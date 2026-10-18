/**
 * Bot decision-making. A strategy answers one question each time it is the bot's
 * turn to act: given the current game state, do I ROLL again or BANK?
 *
 * There is ONE standard skill level. Every bot uses a cached risk-neutral turn
 * value as its baseline, adjusted for the actual held hand, score gap, proximity
 * to the goal, and the responses still to come in the final round.
 *
 * What makes one bot feel different from another is its **personality**, read
 * from the player's `botPersonality`:
 *
 *  - cautious: protects a good turn, but raises its target when falling behind.
 *  - balanced: follows expected turn value, no temperament either way.
 *  - reckless: pushes every turn to a big number before it will even consider
 *              banking, then keeps rolling on a thinner edge than the odds like.
 *
 * The floor is the important half. Fine-tuning the expected-value threshold
 * barely moves how a bot behaves; over-rolling with few dice left is what
 * actually changes a game, so that is the lever the personalities pull hardest.
 *
 * All bots chase a losing final-round total and bank a guaranteed win. Ties and
 * leads that opponents can still answer remain risk decisions, including during
 * sudden death. Nothing in the policy reads future dice or the engine's RNG.
 */

import { getLegalActions, rivalBest, scoreFor, teamOf } from "@greed/core";
import type { BotPersonality, GameAction, GameState } from "@greed/core";
import { rollModel, turnRollModel } from "./probabilities.js";

export interface BotContext {
  /** Overrides the player's own `botPersonality` (defaults to "balanced"). */
  personality?: BotPersonality;
}

/** How a temperament plays a turn. */
interface Temperament {
  /**
   * Multiplier on the bank threshold. >1 makes a bot bank sooner (it needs a
   * bigger edge to keep rolling); <1 makes it push its luck.
   */
  bias: number;
  /** Roll on regardless of the odds until the turn is worth at least this. */
  floor: number;
  /** Never roll a turn already worth this much (0 = no ceiling). */
  ceiling: number;
}

/** Close races retain distinct temperaments; catch-up pressure adapts all three. */
const TEMPERAMENTS: Record<BotPersonality, Temperament> = {
  // Takes the money: a high bar to continue, and a hard stop once the turn is
  // worth protecting.
  cautious: { bias: 1.3, floor: 0, ceiling: 600 },
  // The house line — no extra temperament bias.
  balanced: { bias: 1, floor: 0, ceiling: 0 },
  // Chases the big turn: rolls to a properly greedy number before it will even
  // look at the odds, then keeps going on a thinner edge than they justify.
  reckless: { bias: 0.75, floor: 350, ceiling: 0 },
};

/**
 * Risk-neutral optimal value of a turn that is holding `score` points with `k`
 * dice available to throw: the better of banking now (`score`) or rolling and
 * then continuing optimally. Deterministic, so results are cached across calls.
 */
const valueMemo = new Map<number, number>();
function optimalValue(score: number, k: number): number {
  // A manually held, non-paying die can leave a takeover bot unable to roll.
  if (k === 0) return score;
  // Beyond any realistic turn total, banking always wins — bounds the recursion.
  if (score >= 12000) return score;
  const key = score * 8 + k;
  const hit = valueMemo.get(key);
  if (hit !== undefined) return hit;

  const model = rollModel(k);
  let eRoll = 0; // busts contribute 0
  for (const t of model.transitions) {
    eRoll += t.p * optimalValue(score + t.gain, t.kNext);
  }
  const v = Math.max(score, eRoll);
  valueMemo.set(key, v);
  return v;
}

/** Expected value of taking one more roll now, then playing optimally afterwards. */
function expectedValueOfRolling(state: GameState): number {
  // The next throw accounts for the held mat and replacement whole-hand awards.
  // Subsequent throws use the cached generic continuation approximation.
  const model = turnRollModel(state.turn);
  let eRoll = 0;
  for (const t of model.transitions) {
    eRoll += t.p * optimalValue(state.turn.turnScore + t.gain, t.kNext);
  }
  return eRoll;
}

/** Is there still an opposing seat that can answer our bank this round? */
function opponentsRemain(state: GameState): boolean {
  const sudden = state.phase === "sudden-death" ? state.suddenDeath : null;
  const order = sudden?.contenders ?? state.order;
  const pointer = sudden?.pointer ?? state.turnPointer;
  const myTeam = teamOf(state, state.turn.playerIndex);
  return order
    .slice(pointer + 1)
    .some((i) => (myTeam === null ? i !== state.turn.playerIndex : teamOf(state, i) !== myTeam));
}

/**
 * Guaranteed-win and final-round logic. Returns an action, or null when normal
 * play should decide.
 */
function endgameAwareDecision(state: GameState): GameAction | null {
  const turn = state.turn;
  const goal = state.config.goal;
  // In a team game the side's shared total is what wins, so a bot plays for the
  // side: it banks to put the TEAM over the goal and chases the leading TEAM.
  const prospective = scoreFor(state, turn.playerIndex) + turn.turnScore;
  const isLastSeat = turn.playerIndex === state.order[state.order.length - 1];

  // Last seat first to the goal wins outright — lock it in.
  if (state.phase === "playing" && !state.endgame.triggered && isLastSeat && prospective >= goal) {
    return { type: "BANK" };
  }

  if (state.endgame.triggered || state.phase === "sudden-death") {
    // A losing bank cannot recover this round. Once tied, dice odds matter:
    // banking can secure sudden death, while hot dice may win outright.
    const target = rivalBest(state, turn.playerIndex);
    if (prospective < target) return { type: "ROLL" };
    if (prospective > target && !opponentsRemain(state)) return { type: "BANK" };
  }
  return null;
}

/**
 * Adapt to the size of a deficit, not just whether one exists. Small gaps keep
 * normal personality play. A large gap raises the minimum useful bank, softens
 * caution, and lifts its ceiling; the target rises further when the leader is
 * only one or two ordinary (~300-point) turns from the goal.
 */
function positionalTemperament(state: GameState, base: Temperament): Temperament {
  const own = scoreFor(state, state.turn.playerIndex);
  const leader = rivalBest(state, state.turn.playerIndex);
  const gap = Math.max(0, leader - own);
  const goal = Math.max(1, state.config.goal);
  const severity = Math.min(1, Math.max(0, (gap / goal - 0.1) / 0.5));
  const pressure = severity * (0.5 + 0.5 * Math.min(1, leader / goal));
  const turnsRemaining = Math.max(1, (goal - leader) / 300);
  // Custom goals can be enormous. Build the deficit back over several turns;
  // only demand a desperate single-turn chase when the leader is nearly home.
  const steadyTarget = Math.min(600, goal * 0.3 * pressure);
  const catchUpTarget = Math.min(
    gap,
    Math.ceil(Math.max(steadyTarget, (gap / turnsRemaining) * severity) / 50) * 50,
  );
  return {
    bias: 1 + (base.bias - 1) * (1 - pressure * 0.75),
    floor: Math.max(base.floor, catchUpTarget),
    ceiling: base.ceiling > 0 ? base.ceiling + catchUpTarget : 0,
  };
}

export function decide(state: GameState, ctx: BotContext = {}): GameAction {
  const turn = state.turn;
  const legal = getLegalActions(state);

  // Cannot bank a zero-point turn: must roll.
  if (!legal.canBank) return { type: "ROLL" };
  if (!legal.canRoll) return { type: "BANK" };

  // Guaranteed-win / final-round logic outranks temperament: no personality is
  // worth losing a game you had already won.
  const smart = endgameAwareDecision(state);
  if (smart) return smart;

  const personality =
    ctx.personality ?? state.players[turn.playerIndex].botPersonality ?? "balanced";
  const { bias, floor, ceiling } = positionalTemperament(state, TEMPERAMENTS[personality]);

  if (turn.turnScore < floor) return { type: "ROLL" };
  if (ceiling > 0 && turn.turnScore >= ceiling) return { type: "BANK" };

  const behind = scoreFor(state, turn.playerIndex) < rivalBest(state, turn.playerIndex);
  // Push harder when trailing, protect points when ahead, then apply temperament.
  const threshold = turn.turnScore * (behind ? 0.85 : 1.15) * bias;
  return expectedValueOfRolling(state) > threshold ? { type: "ROLL" } : { type: "BANK" };
}
