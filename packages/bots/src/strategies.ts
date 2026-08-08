/**
 * Bot decision-making. A strategy answers one question each time it is the bot's
 * turn to act: given the current game state, do I ROLL again or BANK?
 *
 *  - easy:   simple point threshold with deliberate mistakes.
 *  - medium: expected-value math from the exact roll statistics, plus correct
 *            endgame play.
 *  - hard:   expected value with positional awareness (push when behind, protect
 *            a lead), plus correct endgame play.
 *  - expert: solves the turn as a dynamic program over the exact roll model —
 *            the risk-neutral optimal continue/stop policy (it naturally chases
 *            low-risk hot-dice re-rolls) — with positional awareness and endgame.
 *
 * A bot also has a **personality** layered on difficulty: cautious banks earlier,
 * reckless pushes further, balanced is neutral. It shifts the roll/bank threshold
 * for every expected-value bot, and is read from the player's `botPersonality`.
 *
 * Endgame rule for the smart bots (medium/hard/expert): in the final round there
 * is no point banking a total that would still be behind first place — you can
 * only win by at least tying the leader, so keep rolling until you do (or bust).
 * The last seat, if it can reach the goal first, banks immediately for the win.
 */

import { diceRemaining, getLegalActions } from "@greed/core";
import type { BotDifficulty, BotPersonality, GameAction, GameState } from "@greed/core";
import { rollModel, rollStats } from "./probabilities.js";

export type RandomFn = () => number;

export interface BotContext {
  /** Randomness source (defaults to Math.random). Injectable for tests. */
  random?: RandomFn;
  /** Overrides the player's own `botPersonality` (defaults to "balanced"). */
  personality?: BotPersonality;
}

function othersMaxTotal(state: GameState, playerIndex: number): number {
  let max = 0;
  state.players.forEach((p, i) => {
    if (i !== playerIndex && p.total > max) max = p.total;
  });
  return max;
}

/**
 * How strongly a personality tilts toward banking. >1 makes a bot bank sooner
 * (needs a bigger edge to keep rolling); <1 makes it push its luck.
 */
function personalityBias(p: BotPersonality): number {
  switch (p) {
    case "cautious":
      return 1.3;
    case "reckless":
      return 0.72;
    default:
      return 1;
  }
}

/** EV of rolling vs. banking: roll while expected gain outweighs expected loss. */
function rollIsPositiveEV(turnScore: number, k: number, greed = 1): boolean {
  const { bustProb: p, expectedGainIfScored: g } = rollStats(k);
  return g * (1 - p) > p * turnScore * greed;
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
 * Guaranteed-win and final-round logic shared by the smart bots. Returns an
 * action, or null when normal play should decide.
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

export function decide(
  state: GameState,
  difficulty: BotDifficulty,
  ctx: BotContext = {},
): GameAction {
  const random = ctx.random ?? Math.random;
  const turn = state.turn;
  const legal = getLegalActions(state);

  // Cannot bank a zero-point turn: must roll.
  if (!legal.canBank) return { type: "ROLL" };
  if (!legal.canRoll) return { type: "BANK" };

  const k = diceRemaining(turn);

  // Smart bots apply guaranteed-win / final-round logic first.
  if (difficulty !== "easy") {
    const smart = endgameAwareDecision(state);
    if (smart) return smart;
  }

  const personality =
    ctx.personality ?? state.players[turn.playerIndex].botPersonality ?? "balanced";
  const bias = personalityBias(personality);

  switch (difficulty) {
    case "easy":
      return decideEasy(turn.turnScore, k, random);
    case "medium":
      return decideMedium(turn.turnScore, k, bias);
    case "hard":
      return decideHardNormal(state, k, bias);
    case "expert":
      return decideExpert(state, k, bias);
    default:
      return { type: "BANK" };
  }
}

/**
 * Medium plays the expected-value odds, but with a common human habit: it pushes
 * for a decent turn (~300) before it starts weighing the risk of busting. That
 * mild over-greed is what a disciplined hard/expert bot punishes.
 */
function decideMedium(turnScore: number, k: number, bias: number): GameAction {
  const floor = Math.round(300 / bias); // cautious lowers it, reckless raises it
  if (turnScore < floor) return { type: "ROLL" };
  return rollIsPositiveEV(turnScore, k, bias) ? { type: "ROLL" } : { type: "BANK" };
}

function decideEasy(turnScore: number, k: number, random: RandomFn): GameAction {
  // Baseline: keep going until ~300, then stop. With plenty of dice, push on.
  let wantRoll = turnScore < 300 || k >= 4;
  // Deliberate mistakes ~20% of the time to feel beatable.
  if (random() < 0.2) wantRoll = !wantRoll;
  return wantRoll ? { type: "ROLL" } : { type: "BANK" };
}

function decideHardNormal(state: GameState, k: number, bias: number): GameAction {
  const turn = state.turn;
  const player = state.players[turn.playerIndex];
  const leader = Math.max(...state.players.map((p) => p.total));
  const behind = player.total < leader;
  // Push harder when trailing, protect points when ahead; then apply personality.
  const greed = (behind ? 0.8 : 1.2) * bias;
  return rollIsPositiveEV(turn.turnScore, k, greed) ? { type: "ROLL" } : { type: "BANK" };
}

function decideExpert(state: GameState, k: number, bias: number): GameAction {
  const turn = state.turn;
  const player = state.players[turn.playerIndex];
  const leader = Math.max(...state.players.map((p) => p.total));
  const behind = player.total < leader;
  // Mild positional tilt on top of the optimal policy, then personality.
  const threshold = turn.turnScore * (behind ? 0.85 : 1.15) * bias;
  return expectedValueOfRolling(turn.turnScore, k) > threshold
    ? { type: "ROLL" }
    : { type: "BANK" };
}
