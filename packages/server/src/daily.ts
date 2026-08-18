/**
 * Daily challenge storage and leaderboard.
 *
 * The server deals. It holds each run's seed — randomly generated at start and
 * never sent anywhere — owns the move list, and replays it through the shared
 * engine to derive both the position and the score. A client cannot preview its
 * dice, restart against dice it has already seen, or report a score at all.
 *
 * The moves are stored alongside the seed, so any run can be re-verified later
 * without asking the player for anything.
 */

import {
  DAILY_TURNS,
  dailyKey,
  dailyMoveStart,
  dailyPosition,
  getLegalActions,
  holdIndex,
  isDailyMove,
  type DailyMove,
  type DailyResult,
  type GameState,
} from "@greed/core";
import { randomInt } from "node:crypto";
import { query } from "./db.js";
import { AccountError } from "./accounts.js";

/** Cap on submitted move lists — a legitimate 10-turn run is far shorter. */
const MAX_MOVES = 2000;

export interface DailyEntry {
  username: string;
  score: number;
  turns: number;
  bestTurn: number;
  busts: number;
  /** Position on the board, 1-based. */
  rank: number;
  /** True for the requesting player's own row. */
  you?: boolean;
}

export interface DailyStatus {
  day: string;
  /** The player's run for today, if they've played it. */
  run: DailyResult | null;
  /** Current streak of consecutive days played, including today. */
  streak: number;
  /**
   * Today's board — EMPTY until this player's own run is in. See dailyStatus:
   * it is withheld at the source rather than hidden by the client, because a
   * payload the client is trusted to keep to itself is not withheld at all.
   */
  leaderboard: DailyEntry[];
  /** The player's own rank, even when outside the top slice. */
  yourRank: number | null;
  players: number;
}

/** The run as the client is allowed to see it: the position, nothing more. */
export interface DailyRunView {
  state: GameState;
  turns: number;
  totalTurns: number;
  complete: boolean;
}

/** A run as stored: the secret seed, the moves played so far, and whether it
 *  is finished. */
interface StoredRun {
  seed: number;
  moves: DailyMove[];
  /**
   * The stored flag, which is the ONLY authority on whether a run is over.
   *
   * Completion must never be re-derived by replaying the moves. A run recorded
   * before the seed became a stored secret has moves that belong to the old
   * derived seed and a `seed` column of 0; replaying those moves against 0
   * meets different dice, drops most of them as illegal, and lands short of the
   * turn limit — which made a finished run look resumable and handed the player
   * a bogus board.
   */
  complete: boolean;
}

/** Load a run, or null when the player has not started today. */
async function storedRun(userId: string, day: string): Promise<StoredRun | null> {
  const { rows } = await query<{ moves: string; seed: string; complete: boolean }>(
    `SELECT moves, seed, complete FROM daily_runs WHERE user_id = $1 AND day = $2`,
    [userId, day],
  );
  if (!rows[0]) return null;
  return {
    // bigint comes back as a string from pg.
    seed: Number(rows[0].seed),
    moves: rows[0].moves ? (rows[0].moves.split(",") as DailyMove[]) : [],
    complete: rows[0].complete,
  };
}

function viewOf(run: StoredRun): DailyRunView {
  const pos = dailyPosition(run.seed, run.moves);
  return {
    state: pos.state,
    turns: pos.turns,
    totalTurns: DAILY_TURNS,
    // The stored flag wins: a run marked finished is finished, whatever a
    // replay of its moves happens to make of them.
    complete: run.complete || pos.result.complete,
  };
}

/**
 * Claim today's run and deal the opening position.
 *
 * The row is created the moment a player starts, not when they finish, which is
 * what makes the daily a single attempt: there is no way back to a fresh board
 * once this has been called. Starting twice returns the run already in
 * progress rather than a new one.
 */
export async function startDailyRun(userId: string, day = dailyKey()): Promise<DailyRunView> {
  // A fresh, unguessable seed per run. DO NOT derive this from the day or the
  // player: the whole point is that nobody, the player included, can work out
  // their dice ahead of time.
  const seed = randomInt(0, 2 ** 31);
  await query(
    `INSERT INTO daily_runs (user_id, day, score, turns, banks, busts, hot_dice, best_turn, moves, complete, seed)
       VALUES ($1, $2, 0, 0, 0, 0, 0, 0, '', false, $3)
       ON CONFLICT (user_id, day) DO NOTHING`,
    [userId, day, seed],
  );
  // Re-read rather than trusting the insert: a second start returns the run
  // already in progress, on its original seed.
  const run = await storedRun(userId, day);
  if (!run) throw new AccountError(500, "Couldn't start today's run.");
  return viewOf(run);
}

/**
 * Play one move. The server owns the move list and the dice: it appends, replays
 * from the seed, stores the derived score and hands back the new position.
 *
 * The client is never told the seed, so it cannot deal itself a preview of the
 * day, restart against dice it has already seen, or submit a run it did not
 * actually play. A move that isn't legal in the current position is rejected
 * rather than dropped, so a desynced client hears about it instead of silently
 * losing a turn.
 */
export async function playDailyMove(
  userId: string,
  rawMove: unknown,
  day = dailyKey(),
): Promise<DailyRunView> {
  if (!isDailyMove(rawMove)) throw new AccountError(400, "Invalid move.");
  const move: DailyMove = rawMove;

  const run = await storedRun(userId, day);
  if (run === null) throw new AccountError(400, "Start today's run first.");
  const { seed, moves } = run;
  if (run.complete) throw new AccountError(409, "You've already played today.");
  if (moves.length >= MAX_MOVES) throw new AccountError(400, "That run is too long.");

  const before = dailyPosition(seed, moves);
  if (before.result.complete) throw new AccountError(409, "You've already played today.");

  // Holding a die is judged against the turn as it stands — it does not start a
  // new one — and only while there is a turn in play to hold dice in.
  const held = holdIndex(move);
  if (held !== null) {
    const turn = before.state.turn;
    if (turn.outcome || turn.rollCount === 0) {
      throw new AccountError(400, "That move isn't legal.");
    }
  } else {
    // Legality is checked against the position the NEXT move actually starts
    // from — a finished turn is advanced past first, exactly as the replay does.
    const legal = getLegalActions(dailyMoveStart(before.state));
    if (move === "ROLL" && !legal.canRoll) throw new AccountError(400, "That move isn't legal.");
    if (move === "BANK" && !legal.canBank) throw new AccountError(400, "That move isn't legal.");
  }

  const next = [...moves, move];
  const after = dailyPosition(seed, next);
  const r = after.result;

  await query(
    `UPDATE daily_runs
        SET score = $3, turns = $4, banks = $5, busts = $6, hot_dice = $7,
            best_turn = $8, moves = $9, complete = $10
      WHERE user_id = $1 AND day = $2 AND complete = false`,
    [
      userId,
      day,
      r.score,
      r.turns,
      r.banks,
      r.busts,
      r.hotDice,
      r.bestTurn,
      next.join(","),
      r.complete,
    ],
  );

  return {
    state: after.state,
    turns: after.turns,
    totalTurns: DAILY_TURNS,
    complete: r.complete,
  };
}

/** The run in progress, for resuming after leaving the screen. */
export async function resumeDailyRun(
  userId: string,
  day = dailyKey(),
): Promise<DailyRunView | null> {
  const run = await storedRun(userId, day);
  if (run === null || run.complete) return null;
  const view = viewOf(run);
  return view.complete ? null : view;
}

/** Consecutive days played, counting back from today. */
async function currentStreak(userId: string, today: string): Promise<number> {
  const { rows } = await query<{ day: string }>(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day FROM daily_runs
       WHERE user_id = $1 AND day <= $2 AND complete
       ORDER BY day DESC LIMIT 400`,
    [userId, today],
  );
  let streak = 0;
  const cursor = new Date(`${today}T00:00:00Z`);
  for (const row of rows) {
    if (row.day !== cursor.toISOString().slice(0, 10)) break;
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

/**
 * Where the player stands on today's challenge.
 *
 * The board is a reward for having played, not a preview of it. Everyone gets
 * the same ten turns, and seeing what the day is worth before the first throw
 * changes how it gets played — a target to beat is a different game from an
 * unknown one, and it cannot be un-seen. So the scores are withheld until this
 * player's own run is finished, and withheld HERE: a board that reached the
 * client and was merely not drawn is a board anyone curious enough to open the
 * network tab has already read.
 */
export async function dailyStatus(
  userId: string,
  day = dailyKey(),
  top = 20,
): Promise<DailyStatus> {
  const mine = await query<{
    score: number;
    turns: number;
    banks: number;
    busts: number;
    hot_dice: number;
    best_turn: number;
    rank: string;
    players: string;
  }>(
    `WITH ranked AS (
       SELECT user_id, score, turns, banks, busts, hot_dice, best_turn,
              RANK() OVER (ORDER BY score DESC, created_at ASC) AS rank,
              COUNT(*) OVER () AS players
         FROM daily_runs WHERE day = $1 AND complete
     )
     SELECT * FROM ranked WHERE user_id = $2`,
    [day, userId],
  );

  const own = mine.rows[0];

  // Not played yet: no names, no scores, and no query for them either.
  const board = own
    ? await query<{
        username: string;
        score: number;
        turns: number;
        best_turn: number;
        busts: number;
        rank: string;
        user_id: string;
      }>(
        `SELECT u.username, r.score, r.turns, r.best_turn, r.busts, r.user_id,
            RANK() OVER (ORDER BY r.score DESC, r.created_at ASC) AS rank
       FROM daily_runs r JOIN users u ON u.id = r.user_id
      WHERE r.day = $1 AND r.complete
      ORDER BY rank
      LIMIT $2`,
        [day, top],
      )
    : { rows: [] };

  const total = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM daily_runs WHERE day = $1 AND complete`,
    [day],
  );

  return {
    day,
    run: own
      ? {
          score: own.score,
          turns: own.turns,
          banks: own.banks,
          busts: own.busts,
          hotDice: own.hot_dice,
          bestTurn: own.best_turn,
          complete: true,
        }
      : null,
    streak: await currentStreak(userId, day),
    leaderboard: board.rows.map((r) => ({
      username: r.username,
      score: r.score,
      turns: r.turns,
      bestTurn: r.best_turn,
      busts: r.busts,
      rank: Number(r.rank),
      you: r.user_id === userId ? true : undefined,
    })),
    yourRank: own ? Number(own.rank) : null,
    players: Number(total.rows[0]?.n ?? 0),
  };
}
