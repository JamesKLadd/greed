/**
 * The daily challenge: everyone gets the same dice each day and plays a fixed
 * number of turns solo, going for the highest total.
 *
 * This lives in the engine (not the client or the server) because BOTH need it
 * and they must agree exactly: the client plays the run locally, then submits
 * its moves, and the server REPLAYS them here to derive the score. Because the
 * engine is pure and its RNG is seeded, the replay is authoritative — a forged
 * score can't survive it, and the only way to submit a bigger number is to
 * actually play better.
 *
 * Every run gets its own randomly generated seed, held by the server and never
 * sent to the client. Two properties fall out of that. No two people play the
 * same dice, so the best line through a day cannot be worked out once and
 * copied. And nobody — including the player — can read their own dice ahead of
 * time, so the route to a good score has to be found live, one throw at a
 * time. Runs stay comparable because every seed draws from the same
 * distribution: ten turns of identical odds.
 */

import { applyAction, createSoloGame, getLegalActions } from "./game.js";
import type { GameState } from "./types.js";

/** Turns in a daily run. Enough for scores to spread out, short enough to
 *  finish in a sitting. */
export const DAILY_TURNS = 10;

/** A goal high enough that the endgame can never trigger, so the run always
 *  ends on the turn count rather than on reaching a target. */
const DAILY_GOAL = 1_000_000_000;

export const DAILY_PLAYER_ID = "you";

/** The moves a player may make in a daily run. */
export type DailyMove = "ROLL" | "BANK";

export interface DailyResult {
  /** Final banked total. */
  score: number;
  /** Turns actually completed (a run may be submitted unfinished). */
  turns: number;
  banks: number;
  busts: number;
  hotDice: number;
  /** Largest single banked turn. */
  bestTurn: number;
  /** True when the run played out all DAILY_TURNS turns. */
  complete: boolean;
}

/** ISO day key (UTC) for a date — the identity of a daily challenge. */
export function dailyKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Milliseconds until the next challenge begins — i.e. until the next UTC
 * midnight, the instant `dailyKey` starts naming a new day.
 *
 * It lives here beside `dailyKey` so the countdown a player watches and the key
 * that decides which run they get can never disagree about when the day turns
 * over. Always positive: at the stroke of midnight the current day is already
 * the new one and a full day remains on it.
 */
export function msUntilNextDaily(now: Date = new Date()): number {
  const nextMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return nextMidnight - now.getTime();
}

/**
 * A seed derived from a day and a per-player key.
 *
 * NO LONGER used to deal a daily run — the server now generates a random seed
 * per run and keeps it, because a derived seed is reproducible by anyone who
 * can work out the inputs, and a player who can reproduce their seed can read
 * the whole day off ahead of time. Kept for re-verifying runs recorded under
 * the old scheme, whose stored seed is 0.
 */
export function dailySeed(day: string, playerKey = ""): number {
  // FNV-1a over "day|player", which spreads adjacent days (and neighbouring
  // ids) far apart.
  const input = `${day}|${playerKey}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A fresh daily run on a given seed. */
export function createDailyGame(seed: number): GameState {
  return createSoloGame(
    { id: DAILY_PLAYER_ID, name: "You", isBot: false },
    { seed, goal: DAILY_GOAL },
  );
}

/** Has the run used up all its turns? */
export function dailyComplete(state: GameState, turnsTaken: number): boolean {
  return turnsTaken >= DAILY_TURNS;
}

/** Where a run stands after a sequence of moves. */
export interface DailyPosition {
  /** The live game, with a just-finished turn still showing its outcome. */
  state: GameState;
  /** Turns completed so far, 0..DAILY_TURNS. */
  turns: number;
  /** Aggregate stats for the run so far. */
  result: DailyResult;
}

/**
 * Replay a sequence of moves against a day's seed and report where the run
 * stands. This is the single source of truth for a daily run: the server owns
 * the move list, replays it here, and hands the resulting state back to the
 * client to render.
 *
 * Illegal or excess moves are ignored rather than throwing: a replay should
 * yield the position the moves actually reach, and silently dropping a move
 * that couldn't have been made is what makes a forged submission worth no more
 * than an honest one.
 *
 * A finished turn is left ON SCREEN (its `outcome` still set) rather than
 * advanced past, so the player sees the roll that busted them. The next move
 * advances first — which is why the move list only ever holds ROLL and BANK,
 * and never an ADVANCE the client could desync on.
 */
export function dailyPosition(seed: number, moves: DailyMove[]): DailyPosition {
  let state = createDailyGame(seed);
  let turns = 0;
  let banks = 0;
  let busts = 0;
  let hotDice = 0;
  let bestTurn = 0;

  for (const move of moves) {
    if (turns >= DAILY_TURNS) break;
    // The previous turn is still on show; starting a new move clears it.
    if (state.turn.outcome) state = applyAction(state, { type: "ADVANCE" });

    const legal = getLegalActions(state);
    if (move === "ROLL" && !legal.canRoll) continue;
    if (move === "BANK" && !legal.canBank) continue;

    const before = state.players[0].total;
    const hotBefore = state.turn.hotDice;
    state = applyAction(state, { type: move });
    if (!hotBefore && state.turn.hotDice) hotDice += 1;

    if (state.turn.outcome) {
      if (state.turn.outcome === "banked") {
        banks += 1;
        bestTurn = Math.max(bestTurn, state.players[0].total - before);
      } else {
        busts += 1;
      }
      turns += 1;
    }
  }

  return {
    state,
    turns,
    result: {
      score: state.players[0].total,
      turns,
      banks,
      busts,
      hotDice,
      bestTurn,
      complete: turns >= DAILY_TURNS,
    },
  };
}

/** The score a move list earns — the run's final, authoritative result. */
export function scoreDailyRun(seed: number, moves: DailyMove[]): DailyResult {
  return dailyPosition(seed, moves).result;
}
