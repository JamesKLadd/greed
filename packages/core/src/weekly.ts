/**
 * The weekly challenge: the same ten-turn solo run as the daily, but a player
 * gets a whole week's worth of attempts at it and only their best score stands.
 *
 * Like the daily, this lives in the engine because the client and the server
 * must agree exactly on which week it is. The run itself is the shared
 * machinery in `run.ts`; what is weekly about the weekly is the calendar below.
 *
 * Every attempt is dealt its own secret seed, so a week cannot be scouted: a
 * retry buys another roll of the dice, never a second look at the same ones.
 * What a week rewards is therefore playing well, not memorising a board.
 */

import { runMoveStart, runPosition, scoreRun, createRunGame } from "./run.js";
import type { RunMove, RunPosition, RunResult } from "./run.js";
import { CHALLENGE_ZONE, dateKey, zonedMidnight, zonedParts } from "./zone.js";
import type { GameState } from "./types.js";

/** Turns in a weekly run — the same ten as the daily, so a score means the
 *  same thing in both modes and a run still fits in a sitting. */
export const WEEKLY_TURNS = 10;

/**
 * Attempts a player gets in a week.
 *
 * The mode opened with no limit at all, which made "how many times can you be
 * bothered" part of the score — a week went to whoever ground it hardest rather
 * than to whoever played it best. Fifty is meant to be more than anyone needs
 * to have a proper go at a week and few enough that an attempt is worth
 * something. They can be spent whenever across the week; nothing is doled out
 * per day.
 */
export const WEEKLY_ATTEMPTS = 50;

/**
 * The first week the cap applies to — the Monday it starts on.
 *
 * The weeks before it were played under the old promise of unlimited tries, and
 * players spent them accordingly: some already hold more than fifty attempts on
 * a week in progress. Capping those retroactively would take back a mode people
 * were part-way through, so the limit begins at a week boundary and every week
 * before it stays as it was played.
 */
export const WEEKLY_CAP_FROM = "2026-09-14";

/**
 * How many attempts a given week allows, or null where a week is unlimited.
 *
 * Week keys are YYYY-MM-DD, so they compare as strings in calendar order — the
 * same property that lets the board's queries say `week < today`.
 */
export function weeklyAttemptLimit(week: string = weekKey()): number | null {
  return week >= WEEKLY_CAP_FROM ? WEEKLY_ATTEMPTS : null;
}

export type WeeklyMove = RunMove;
export type WeeklyResult = RunResult;
export type WeeklyPosition = RunPosition;

/** The clock the weekly runs on — the same zone as the daily (see zone.ts). */
export const WEEKLY_ZONE = CHALLENGE_ZONE;

/**
 * The day a challenge week begins.
 *
 * A week runs Monday through Sunday and turns over as Monday BEGINS — i.e. at
 * the midnight that ends Sunday. 1 is Monday in the `getUTCDay` numbering
 * (0 = Sunday), and it is written as a named constant because "which midnight
 * on Sunday" is the one thing about this feature that has two readings.
 */
const WEEK_STARTS_ON = 1;

/** How many days into its week a local calendar date falls (0 = Monday). */
function dayOfWeekOffset(year: number, month: number, day: number): number {
  // Plain UTC arithmetic: this reads a weekday off a calendar date, and a
  // calendar date has no zone. Using the zone here would ask what day of the
  // week midnight is, which is the question we are trying to answer.
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return (dow - WEEK_STARTS_ON + 7) % 7;
}

/** The local calendar date `days` after the given one. */
function shift(year: number, month: number, day: number, days: number) {
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/**
 * Week key for an instant — the identity of a weekly challenge.
 *
 * The key is the DATE OF THE MONDAY the week starts on, as YYYY-MM-DD, rather
 * than an ISO week number. It stores as a plain `date` column, sorts and
 * compares as one, and prints as a date a player recognises ("week of 25 Aug")
 * without a lookup table — where "2026-W35" is a number nobody can place.
 */
export function weekKey(date: Date = new Date()): string {
  const p = zonedParts(date.getTime());
  const monday = shift(p.year, p.month, p.day, -dayOfWeekOffset(p.year, p.month, p.day));
  return dateKey(monday.year, monday.month, monday.day);
}

/**
 * Milliseconds until the next challenge week begins — the coming Monday
 * midnight in WEEKLY_ZONE, the instant `weekKey` starts naming a new week.
 *
 * Beside `weekKey` for the same reason the daily's countdown is beside
 * `dailyKey`: the clock a player watches and the key that decides which
 * challenge they are playing must never disagree about when it turns over.
 * Always positive — at the stroke of Monday midnight a whole new week remains.
 */
export function msUntilNextWeek(now: Date = new Date()): number {
  const p = zonedParts(now.getTime());
  const nextMonday = shift(p.year, p.month, p.day, 7 - dayOfWeekOffset(p.year, p.month, p.day));
  return zonedMidnight(nextMonday.year, nextMonday.month, nextMonday.day) - now.getTime();
}

/** A fresh weekly run on a given seed. */
export function createWeeklyGame(seed: number): GameState {
  return createRunGame(seed);
}

/** Where the next move in a weekly run begins. See `runMoveStart`. */
export function weeklyMoveStart(state: GameState): GameState {
  return runMoveStart(state);
}

/** Replay a weekly run's moves and report where it stands. */
export function weeklyPosition(seed: number, moves: WeeklyMove[]): WeeklyPosition {
  return runPosition(seed, moves, WEEKLY_TURNS);
}

/** The score a move list earns — the attempt's final, authoritative result. */
export function scoreWeeklyRun(seed: number, moves: WeeklyMove[]): WeeklyResult {
  return scoreRun(seed, moves, WEEKLY_TURNS);
}
