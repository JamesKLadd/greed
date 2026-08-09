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
 * Note that two players making different choices will see different dice after
 * the first divergence, since the number of dice thrown determines how much of
 * the seeded stream is consumed. That's the same bargain as any seeded daily
 * run: the starting conditions are identical, the outcomes are yours.
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
 * Seed for a given day. Derived from the date alone, so every client and the
 * server compute the same value with nothing to store or distribute.
 */
export function dailySeed(day: string): number {
  // FNV-1a over the day string, which spreads adjacent days far apart.
  let h = 0x811c9dc5;
  for (let i = 0; i < day.length; i++) {
    h ^= day.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A fresh daily run for the given day. */
export function createDailyGame(day: string): GameState {
  return createSoloGame(
    { id: DAILY_PLAYER_ID, name: "You", isBot: false },
    { seed: dailySeed(day), goal: DAILY_GOAL },
  );
}

/** Has the run used up all its turns? */
export function dailyComplete(state: GameState, turnsTaken: number): boolean {
  return turnsTaken >= DAILY_TURNS;
}

/**
 * Replay a sequence of moves against a day's seed and report the true result.
 *
 * Illegal or excess moves are ignored rather than throwing: a replay should
 * yield the score the moves actually earn, and silently dropping a move that
 * couldn't have been made is exactly the behaviour that makes a forged
 * submission score no better than an honest one.
 */
export function scoreDailyRun(day: string, moves: DailyMove[]): DailyResult {
  let state = createDailyGame(day);
  let turns = 0;
  let banks = 0;
  let busts = 0;
  let hotDice = 0;
  let bestTurn = 0;

  for (const move of moves) {
    if (turns >= DAILY_TURNS) break;
    const legal = getLegalActions(state);
    if (move === "ROLL" && !legal.canRoll) continue;
    if (move === "BANK" && !legal.canBank) continue;

    const before = state.players[0].total;
    const hotBefore = state.turn.hotDice;
    state = applyAction(state, { type: move });
    if (!hotBefore && state.turn.hotDice) hotDice += 1;

    // A finished turn (banked or busted) waits for an explicit ADVANCE.
    if (state.turn.outcome) {
      if (state.turn.outcome === "banked") {
        banks += 1;
        bestTurn = Math.max(bestTurn, state.players[0].total - before);
      } else {
        busts += 1;
      }
      turns += 1;
      if (turns < DAILY_TURNS) state = applyAction(state, { type: "ADVANCE" });
    }
  }

  return {
    score: state.players[0].total,
    turns,
    banks,
    busts,
    hotDice,
    bestTurn,
    complete: turns >= DAILY_TURNS,
  };
}
