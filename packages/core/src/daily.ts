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

/**
 * The moves a player may make in a daily run.
 *
 * "H0".."H4" hold a die or put it back — the same tap the other modes make
 * locally, but a daily run is replayed from its move list on the server, so a
 * change to which dice are held has to be part of that list or the replay would
 * throw different dice from the ones the player actually saw.
 */
export type DailyMove = "ROLL" | "BANK" | "H0" | "H1" | "H2" | "H3" | "H4";

/** The die a hold move refers to, or null if this isn't one. */
export function holdIndex(move: DailyMove): number | null {
  return move.startsWith("H") ? Number(move.slice(1)) : null;
}

/** Is this string one of the moves a client may submit? */
export function isDailyMove(value: unknown): value is DailyMove {
  return (
    value === "ROLL" || value === "BANK" || (typeof value === "string" && /^H[0-4]$/.test(value))
  );
}

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

/**
 * The clock the daily runs on.
 *
 * A zone, not a fixed offset. "CST" literally means UTC-6 all year, but US
 * Central observes daylight saving — so a hardcoded -6 would roll the day over
 * at 1am local for the eight months the zone is on CDT. Naming the zone keeps
 * the reset at local midnight in both halves of the year.
 *
 * Both the client and the server derive the day from this, so they must agree:
 * that needs an ICU-complete runtime, which Node 20+ and every browser we
 * target are.
 */
export const DAILY_ZONE = "America/Chicago";

const zoneFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: DAILY_ZONE,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** An instant, read as a wall clock in the daily's zone. */
function zonedParts(ts: number): ZonedParts {
  const found: Record<string, string> = {};
  for (const part of zoneFormat.formatToParts(new Date(ts))) {
    if (part.type !== "literal") found[part.type] = part.value;
  }
  return {
    year: Number(found.year),
    month: Number(found.month),
    day: Number(found.day),
    // Some engines render midnight as hour 24 under hour12:false.
    hour: Number(found.hour) % 24,
    minute: Number(found.minute),
    second: Number(found.second),
  };
}

/** How far the zone's wall clock is ahead of UTC at this instant, in ms. */
function zoneOffsetMs(ts: number): number {
  const p = zonedParts(ts);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // formatToParts has no milliseconds, so compare on whole seconds. Offsets are
  // whole minutes, so nothing is lost.
  return asUtc - Math.floor(ts / 1000) * 1000;
}

/** The instant local midnight begins on a given local calendar date. */
function zonedMidnight(year: number, month: number, day: number): number {
  const wall = Date.UTC(year, month - 1, day);
  // Correct by the offset in force at the guess, then re-check: near a DST
  // boundary the first correction can land on the other side of it.
  const first = wall - zoneOffsetMs(wall);
  const second = wall - zoneOffsetMs(first);
  return second;
}

/** Day key for an instant — the identity of a daily challenge, in DAILY_ZONE. */
export function dailyKey(date: Date = new Date()): string {
  const p = zonedParts(date.getTime());
  const mm = String(p.month).padStart(2, "0");
  const dd = String(p.day).padStart(2, "0");
  return `${p.year}-${mm}-${dd}`;
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
 * The position the next move actually starts from.
 *
 * A finished turn is left on screen with its `outcome` still set, so the player
 * can see the roll that busted them — but the next move does not begin there.
 * The replay advances past it first, and so must anything else reasoning about
 * that move: the server deciding whether it is legal, the client deciding which
 * dice the throw will tumble. Reading the finished turn instead sees the
 * previous turn's locks, which is a board that no longer exists.
 *
 * A no-op on a turn still in play, and never touches the RNG — advancing only
 * swaps in a fresh turn, so this cannot deal anything or move the run along.
 */
export function dailyMoveStart(state: GameState): GameState {
  return state.turn.outcome ? applyAction(state, { type: "ADVANCE" }) : state;
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

    // Holding a die changes nothing about the run's progress — no dice are
    // dealt, no turn ends — so it is applied where it stands, against the turn
    // as the player is looking at it rather than the one after it.
    const held = holdIndex(move);
    if (held !== null) {
      state = applyAction(state, { type: "TOGGLE_LOCK", index: held });
      continue;
    }

    // The previous turn is still on show; starting a new move clears it.
    state = dailyMoveStart(state);

    const legal = getLegalActions(state);
    if (move === "ROLL" && !legal.canRoll) continue;
    if (move === "BANK" && !legal.canBank) continue;

    const before = state.players[0].total;
    const hotBefore = state.turn.hotDice;
    // Narrowed by the two guards above: only ROLL and BANK reach here.
    state = applyAction(state, { type: move as "ROLL" | "BANK" });
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
