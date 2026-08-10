/**
 * Bot decision-making. A strategy answers one question each time it is the bot's
 * turn to act: given the current game state, do I ROLL again or BANK?
 *
 * There is ONE standard skill level. Every bot solves the turn the same way — as
 * a dynamic program over the exact roll model, i.e. the risk-neutral optimal
 * continue/stop policy (it naturally chases low-risk hot-dice re-rolls) — with
 * positional awareness and correct endgame play.
 *
 * What makes one bot feel different from another is its **personality**, read
 * from the player's `botPersonality`:
 *
 *  - cautious: banks a good turn rather than pressing it. Needs a clear edge to
 *              keep rolling, and stops outright once a turn is worth protecting.
 *  - balanced: plays the optimal line, no temperament either way.
 *  - reckless: pushes every turn to a big number before it will even consider
 *              banking, then keeps rolling on a thinner edge than the odds like.
 *
 * The floor is the important half. Fine-tuning the expected-value threshold
 * barely moves how a bot behaves; over-rolling with few dice left is what
 * actually changes a game, so that is the lever the personalities pull hardest.
 *
 * Endgame rule (all bots): in the final round there is no point banking a total
 * that would still be behind first place — you can only win by at least tying
 * the leader, so keep rolling until you do (or bust). The last seat, if it can
 * reach the goal first, banks immediately for the win.
 */

import { diceRemaining, getLegalActions } from "@greed/core";
import type { BotPersonality, GameAction, GameState } from "@greed/core";
import { rollModel } from "./probabilities.js";

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

/**
 * Measured over ~9,600 turns each (points per turn attempted in brackets, with
 * the optimal line worth ~262): cautious banks ~275 a turn and busts 14% [237],
 * balanced banks ~363 and busts 28% [262], reckless banks ~570 and busts 60%
 * [230]. So the temperaments are plainly different to play against without any
 * of them being a pushover.
 */
const TEMPERAMENTS: Record<BotPersonality, Temperament> = {
  // Takes the money: a high bar to continue, and a hard stop once the turn is
  // worth protecting.
  cautious: { bias: 1.3, floor: 0, ceiling: 600 },
  // The house line — pure optimal play.
  balanced: { bias: 1, floor: 0, ceiling: 0 },
  // Chases the big turn: rolls to a properly greedy number before it will even
  // look at the odds, then keeps going on a thinner edge than they justify.
  reckless: { bias: 0.75, floor: 350, ceiling: 0 },
};

function othersMaxTotal(state: GameState, playerIndex: number): number {
  let max = 0;
  state.players.forEach((p, i) => {
    if (i !== playerIndex && p.total > max) max = p.total;
  });
  return max;
}

/**
 * Risk-neutral optimal value of a turn that is holding `score` points with `k`
 * dice available to throw: the better of banking now (`score`) or rolling and
 * then continuing optimally. Deterministic, so results are cached across calls.
 */
const valueMemo = new Map<number, number>();
function optimalValue(score: number, k: number): number {
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
function expectedValueOfRolling(score: number, k: number): number {
  const model = rollModel(k);
  let eRoll = 0;
  for (const t of model.transitions) {
    eRoll += t.p * optimalValue(score + t.gain, t.kNext);
  }
  return eRoll;
}

/**
 * Guaranteed-win and final-round logic. Returns an action, or null when normal
 * play should decide.
 */
function endgameAwareDecision(state: GameState): GameAction | null {
  const turn = state.turn;
  const player = state.players[turn.playerIndex];
  const goal = state.config.goal;
  const prospective = player.total + turn.turnScore;
  const isLastSeat = turn.playerIndex === state.order[state.order.length - 1];

  // Last seat first to the goal wins outright — lock it in.
  if (!state.endgame.triggered && isLastSeat && prospective >= goal) {
    return { type: "BANK" };
  }

  if (state.endgame.triggered) {
    // Final round: only bank if it at least ties first place; otherwise chase.
    const target = othersMaxTotal(state, turn.playerIndex);
    return prospective >= target ? { type: "BANK" } : { type: "ROLL" };
  }
  return null;
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
  const { bias, floor, ceiling } = TEMPERAMENTS[personality];

  if (turn.turnScore < floor) return { type: "ROLL" };
  if (ceiling > 0 && turn.turnScore >= ceiling) return { type: "BANK" };

  const player = state.players[turn.playerIndex];
  const leader = Math.max(...state.players.map((p) => p.total));
  const behind = player.total < leader;
  // Push harder when trailing, protect points when ahead, then apply temperament.
  const threshold = turn.turnScore * (behind ? 0.85 : 1.15) * bias;
  return expectedValueOfRolling(turn.turnScore, diceRemaining(turn)) > threshold
    ? { type: "ROLL" }
    : { type: "BANK" };
}
