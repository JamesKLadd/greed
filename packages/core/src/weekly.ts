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
 * Attempts a player gets each day, once the daily allowance begins.
 *
 * The mode opened with no limit at all, which made "how many times can you be
 * bothered" part of the score — a week went to whoever ground it hardest rather
 * than to whoever played it best. A weekly ration fixed that but bought a
 * second problem with it: fifty in one pot is spendable in one sitting, so a
 * player who found a good week on Monday could exhaust it before Tuesday and
 * then watch the board for six days with nothing to play.
 *
 * Ten a day is roughly the same ration across a week and cannot be front-
 * loaded. It also gives the mode a reason to be opened daily, which is the
 * shape the daily challenge already has and the weekly never did.
 */
export const WEEKLY_ATTEMPTS_PER_DAY = 10;

/**
 * Attempts a player got for a whole week, in the one week that worked that way.
 *
 * Kept because that week really happened and its rule has to keep answering
 * for it — `weeklyAllowance` still reports it for the week of WEEKLY_CAP_FROM.
 * No week after WEEKLY_DAILY_CAP_FROM uses it.
 */
export const WEEKLY_ATTEMPTS = 50;

/**
 * The first week any cap applied to — the Monday it started on.
 *
 * The weeks before it were played under the old promise of unlimited tries, and
 * players spent them accordingly: some already hold more than fifty attempts on
 * a week in progress. Capping those retroactively would take back a mode people
 * were part-way through, so the limit begins at a week boundary and every week
 * before it stays as it was played.
 */
export const WEEKLY_CAP_FROM = "2026-09-14";

/**
 * The first week the ration is DAILY rather than weekly.
 *
 * A week later than WEEKLY_CAP_FROM, and for the same reason it exists at all:
 * the fifty-a-week week was announced in an update log and is being played
 * right now under that promise. Moving it to ten a day mid-week would cut
 * somebody off at four attempts who had been told they had fifty, so the change
 * lands on the boundary and the week already in progress keeps the rule it
 * started with.
 */
export const WEEKLY_DAILY_CAP_FROM = "2026-09-21";

/** What a limit is counted per, or null where a week is unlimited. */
export type AttemptPeriod = "day" | "week";

export interface WeeklyAllowance {
  /** How many attempts the allowance grants per `per`, or null for no cap. */
  limit: number | null;
  /** What that limit is counted per. Null exactly when `limit` is. */
  per: AttemptPeriod | null;
}

/**
 * What a given week grants, and what it grants it per.
 *
 * Three answers, because the mode has had three rules and each week has to keep
 * reporting the one it was actually played under — a board from August is still
 * readable, and the screen describing it should not claim a cap that did not
 * exist then.
 *
 * Week keys are YYYY-MM-DD, so they compare as strings in calendar order — the
 * same property that lets the board's queries say `week < today`.
 */
export function weeklyAllowance(week: string = weekKey()): WeeklyAllowance {
  if (week >= WEEKLY_DAILY_CAP_FROM) return { limit: WEEKLY_ATTEMPTS_PER_DAY, per: "day" };
  if (week >= WEEKLY_CAP_FROM) return { limit: WEEKLY_ATTEMPTS, per: "week" };
  return { limit: null, per: null };
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
