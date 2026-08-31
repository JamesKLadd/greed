/**
 * The daily challenge: one run a day, a fixed number of turns, solo, going for
 * the highest total.
 *
 * This lives in the engine (not the client or the server) because BOTH need it
 * and they must agree exactly on which day it is. The run itself — seed, moves,
 * replay, score — is the shared machinery in `run.ts`; what is daily about the
 * daily is the calendar below.
 */

import { runMoveStart, runPosition, scoreRun, createRunGame } from "./run.js";
import type { RunMove, RunPosition, RunResult } from "./run.js";
import { CHALLENGE_ZONE, dateKey, zonedMidnight, zonedParts } from "./zone.js";
import type { GameState } from "./types.js";

/** Turns in a daily run. Enough for scores to spread out, short enough to
 *  finish in a sitting. */
export const DAILY_TURNS = 10;

export { RUN_PLAYER_ID as DAILY_PLAYER_ID } from "./run.js";

/** The moves a player may make in a daily run. */
export type DailyMove = RunMove;
export type DailyResult = RunResult;
export type DailyPosition = RunPosition;

/** Is this string one of the moves a client may submit? */
export { isRunMove as isDailyMove } from "./run.js";

/**
 * The clock the daily runs on.
 *
 * Kept as its own name because it is part of this module's public surface;
 * the zone itself, and the DST-correct arithmetic over it, is shared with the
 * weekly challenge (see zone.ts).
 */
export const DAILY_ZONE = CHALLENGE_ZONE;

/** Day key for an instant — the identity of a daily challenge, in DAILY_ZONE. */
export function dailyKey(date: Date = new Date()): string {
  const p = zonedParts(date.getTime());
  return dateKey(p.year, p.month, p.day);
}

/**
 * Milliseconds until the next challenge begins — i.e. until the next midnight
 * in DAILY_ZONE, the instant `dailyKey` starts naming a new day.
 *
 * It lives here beside `dailyKey` so the countdown a player watches and the key
 * that decides which run they get can never disagree about when the day turns
 * over. Always positive: at the stroke of midnight the current day is already
 * the new one and a full day remains on it.
 */
export function msUntilNextDaily(now: Date = new Date()): number {
  const p = zonedParts(now.getTime());
  // Tomorrow's date on a calendar. Plain UTC arithmetic on the parts, with no
  // zone involved — this only has to roll month and year ends over correctly.
  const tomorrow = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  const next = zonedMidnight(
    tomorrow.getUTCFullYear(),
    tomorrow.getUTCMonth() + 1,
    tomorrow.getUTCDate(),
  );
  return next - now.getTime();
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
  return createRunGame(seed);
}

/** Has the run used up all its turns? */
export function dailyComplete(state: GameState, turnsTaken: number): boolean {
  return turnsTaken >= DAILY_TURNS;
}

/** Where the next move in a daily run begins. See `runMoveStart`. */
export function dailyMoveStart(state: GameState): GameState {
  return runMoveStart(state);
}

/** Replay a daily run's moves and report where it stands. */
export function dailyPosition(seed: number, moves: DailyMove[]): DailyPosition {
  return runPosition(seed, moves, DAILY_TURNS);
}

/** The score a move list earns — the run's final, authoritative result. */
export function scoreDailyRun(seed: number, moves: DailyMove[]): DailyResult {
  return scoreRun(seed, moves, DAILY_TURNS);
}
