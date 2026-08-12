/**
 * Daily challenge storage and leaderboard.
 *
 * Scores are never taken on trust: the client submits the MOVES it made, and
 * the server replays them through the shared engine (`scoreDailyRun`) to derive
 * the score itself. A client that posts a made-up number gets whatever its moves
 * are actually worth. The moves are stored too, so any run can be re-verified
 * later without asking the player for anything.
 *
 * The replay uses the id we authenticated as the seed key, so a run is scored
 * against the dice that player was dealt — nobody can submit somebody else's
 * moves, or shop for a friendlier seed.
 */

import {
  dailyKey,
  scoreDailyRun,
  scoreDailyShootout,
  type DailyMove,
  type DailyResult,
} from "@greed/core";
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
  leaderboard: DailyEntry[];
  /** The player's own rank, even when outside the top slice. */
  yourRank: number | null;
  players: number;
  /**
   * True when someone else finished today on the same score AND the tie is
   * still unbroken — i.e. the player may still play their sudden-death turn.
   * False once they have played it, or when nothing is level.
   */
  tiedUnresolved: boolean;
  /** The player's shootout result, once played. */
  tiebreak: number | null;
}

function parseMoves(raw: unknown): DailyMove[] {
  if (!Array.isArray(raw)) throw new AccountError(400, "Invalid run.");
  if (raw.length > MAX_MOVES) throw new AccountError(400, "That run is too long.");
  const moves: DailyMove[] = [];
  for (const m of raw) {
    if (m !== "ROLL" && m !== "BANK") throw new AccountError(400, "Invalid run.");
    moves.push(m);
  }
  return moves;
}

/**
 * Score and store a run. One run per player per day: a second submission is
 * rejected rather than replacing the first, so the daily stays a single shot.
 */
export async function submitDailyRun(
  userId: string,
  rawMoves: unknown,
  day = dailyKey(),
): Promise<{ result: DailyResult; alreadyPlayed: boolean }> {
  const moves = parseMoves(rawMoves);
  const result = scoreDailyRun(day, moves, userId);

  const { rows } = await query<{ score: number }>(
    `INSERT INTO daily_runs (user_id, day, score, turns, banks, busts, hot_dice, best_turn, moves)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (user_id, day) DO NOTHING
       RETURNING score`,
    [
      userId,
      day,
      result.score,
      result.turns,
      result.banks,
      result.busts,
      result.hotDice,
      result.bestTurn,
      moves.join(","),
    ],
  );

  return { result, alreadyPlayed: rows.length === 0 };
}

/**
 * Play the one-turn tiebreak shootout. Only allowed when the player has a run
 * today and is actually level with someone; the score is derived by replaying
 * the submitted moves, exactly like the run itself, so it cannot be forged.
 *
 * `tiebreak_moves IS NULL` is what makes it a single shot — the same
 * one-attempt rule the run has, enforced by the same trick (a conditional
 * update rather than a read-then-write, so two requests can't both win).
 */
export async function submitDailyShootout(
  userId: string,
  rawMoves: unknown,
  day = dailyKey(),
): Promise<{ tiebreak: number; alreadyPlayed: boolean }> {
  const moves = parseMoves(rawMoves);

  const { rows: mine } = await query<{ score: number; tiebreak_moves: string | null }>(
    `SELECT score, tiebreak_moves FROM daily_runs WHERE user_id = $1 AND day = $2`,
    [userId, day],
  );
  if (!mine[0]) throw new AccountError(400, "Play today's run first.");
  if (mine[0].tiebreak_moves !== null) {
    return { tiebreak: 0, alreadyPlayed: true };
  }
  if (!(await isTied(userId, day, mine[0].score))) {
    throw new AccountError(400, "Nothing to break — no one shares your score.");
  }

  const tiebreak = scoreDailyShootout(day, moves, userId);
  const { rows } = await query<{ tiebreak: number }>(
    `UPDATE daily_runs SET tiebreak = $3, tiebreak_moves = $4
       WHERE user_id = $1 AND day = $2 AND tiebreak_moves IS NULL
       RETURNING tiebreak`,
    [userId, day, tiebreak, moves.join(",")],
  );
  return { tiebreak, alreadyPlayed: rows.length === 0 };
}

/** Is anyone else on this exact score today? */
async function isTied(userId: string, day: string, score: number): Promise<boolean> {
  const { rows } = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM daily_runs
       WHERE day = $1 AND score = $2 AND user_id <> $3`,
    [day, score, userId],
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

/** Consecutive days played, counting back from today. */
async function currentStreak(userId: string, today: string): Promise<number> {
  const { rows } = await query<{ day: string }>(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day FROM daily_runs
       WHERE user_id = $1 AND day <= $2
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

export async function dailyStatus(
  userId: string,
  day = dailyKey(),
  top = 20,
): Promise<DailyStatus> {
  const board = await query<{
    username: string;
    score: number;
    turns: number;
    best_turn: number;
    busts: number;
    rank: string;
    user_id: string;
  }>(
    `SELECT u.username, r.score, r.turns, r.best_turn, r.busts, r.user_id,
            RANK() OVER (ORDER BY r.score DESC, r.tiebreak DESC, r.created_at ASC) AS rank
       FROM daily_runs r JOIN users u ON u.id = r.user_id
      WHERE r.day = $1
      ORDER BY rank
      LIMIT $2`,
    [day, top],
  );

  const mine = await query<{
    score: number;
    turns: number;
    tiebreak: number;
    tiebreak_moves: string | null;
    banks: number;
    busts: number;
    hot_dice: number;
    best_turn: number;
    rank: string;
    players: string;
  }>(
    `WITH ranked AS (
       SELECT user_id, score, turns, banks, busts, hot_dice, best_turn,
              tiebreak, tiebreak_moves,
              RANK() OVER (ORDER BY score DESC, tiebreak DESC, created_at ASC) AS rank,
              COUNT(*) OVER () AS players
         FROM daily_runs WHERE day = $1
     )
     SELECT * FROM ranked WHERE user_id = $2`,
    [day, userId],
  );

  const total = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM daily_runs WHERE day = $1`,
    [day],
  );

  const own = mine.rows[0];
  // Offer the shootout only while it can still change something: the player has
  // a run, someone else matched it, and they have not taken their turn yet.
  const tiedUnresolved =
    own != null && own.tiebreak_moves == null && (await isTied(userId, day, own.score));
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
    tiedUnresolved,
    tiebreak: own?.tiebreak_moves != null ? own.tiebreak : null,
  };
}
