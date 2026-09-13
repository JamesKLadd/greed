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
  canToggleLock,
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
import { raiseCareerBestTurn } from "./leaderboards.js";
import { AccountError } from "./accounts.js";

/** Cap on submitted move lists — a legitimate 10-turn run is far shorter. */
const MAX_MOVES = 2000;

export interface DailyEntry {
  username: string;
  /** Their equipped avatar id, so the row shows the face they chose rather
   *  than one derived from their name. */
  avatar: string;
  score: number;
  turns: number;
  bestTurn: number;
  busts: number;
  hotDice: number;
  /** How many daily challenges this player has won outright. */
  wins: number;
  /** Position on the board, 1-based. */
  rank: number;
  /** True for the requesting player's own row. */
  you?: boolean;
  /** True for the reigning champion — see `champion`. */
  crown?: true;
}

/** Who took a day, once that day was over. */
export interface DailyChampion {
  /** The challenge's day, as YYYY-MM-DD; formatted by the client. */
  day: string;
  username: string;
  avatar: string;
  score: number;
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
  /**
   * True once the player has finished in the top ten on a day that is OVER.
   *
   * Deliberately not "you are top ten right now": a board fills up across its
   * day, so a run played in the first hour is measured against whoever happened
   * to be up early, and placing on it then meant only that few people had
   * played. Standing on a board that has closed is the thing worth a badge, and
   * a closed board cannot change again.
   */
  eliteEarned: boolean;
  /** How many daily challenges this player has won outright. */
  wins: number;
  /**
   * Who took the most recent day that has finished, or null before anyone has.
   *
   * Almost always yesterday's winner; on a day nobody played it reaches further
   * back rather than going blank, which is why it carries its own date. The
   * crown on today's board goes to this player.
   */
  champion: DailyChampion | null;
  /** Every past winner, newest first. Closed days only, so it gives nothing
   *  away about today and is shown before the run as well as after. */
  champions: DailyChampion[];
}

/** How high on a FINISHED daily board earns the badge. */
const PODIUM_RANK = 10;

/** How many past champions the daily screen lists. */
const CHAMPIONS_LIMIT = 200;

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
    `INSERT INTO daily_runs (user_id, day, score, turns, banks, busts, super_busts, hot_dice, best_turn, moves, complete, seed)
       VALUES ($1, $2, 0, 0, 0, 0, 0, 0, 0, '', false, $3)
       ON CONFLICT (user_id, day) DO NOTHING`,
    [userId, day, seed],
  );
  // Re-read rather than trusting the insert: a second start returns the run
  // already in progress, on its original seed.
  const run = await storedRun(userId, day);
  if (!run) throw new AccountError(500, "Couldn't start today's run.", "daily.startFailed");
  return viewOf(run);
}

/**
 * Raise a player's career best turn to `points`, if it beats what they have.
 *
 * GREATEST in the statement rather than a read-then-write, so two runs finishing
 * at once cannot talk over each other — and so this can never LOWER a figure,
 * which is the same rule the profile merge follows everywhere else.
 */
async function raiseBestTurn(userId: string, points: number): Promise<void> {
  await query(
    `UPDATE users
        SET profile = jsonb_set(
              profile,
              '{bestTurn}',
              to_jsonb(GREATEST(COALESCE((profile ->> 'bestTurn')::numeric, 0), $2::numeric)),
              true
            ),
            updated_at = now()
      WHERE id = $1`,
    [userId, points],
  );
  // The boards rank the server's own figures, not the synced profile.
  await raiseCareerBestTurn(userId, points);
}

/**
 * Record a player's daily first places on their account, if it beats what is
 * stored. Same GREATEST-in-the-statement rule as the best turn above.
 *
 * The count is DERIVED — it can always be recomputed from daily_runs, and is,
 * every time a status is read. This copy exists so the figure reaches the Stats
 * screen and the profile sync like any other career stat, instead of only
 * existing on the one screen that queried for it.
 */
async function raiseDailyWins(userId: string, wins: number): Promise<void> {
  await query(
    `UPDATE users
        SET profile = jsonb_set(
              profile,
              '{dailyWins}',
              to_jsonb(GREATEST(COALESCE((profile ->> 'dailyWins')::numeric, 0), $2::numeric)),
              true
            ),
            updated_at = now()
      WHERE id = $1`,
    [userId, wins],
  );
}

/** What a player has to show for the daily boards that have CLOSED. */
export interface DailyPlacings {
  /** Days taken outright. */
  wins: number;
  /** Days finished in the top `PODIUM_RANK`. */
  podiums: number;
}

/**
 * First places and top-ten finishes on closed days, for the given accounts.
 *
 * Days strictly before `today` only: a board fills up over the course of its
 * day, so neither figure means anything until the day it was won on is over.
 * Ties break on who got there first, the same order the board itself is drawn
 * in — so every day has exactly one winner, and the crown has one owner.
 */
export async function closedDayPlacings(
  userIds: string[],
  today = dailyKey(),
): Promise<Map<string, DailyPlacings>> {
  const out = new Map<string, DailyPlacings>();
  if (userIds.length === 0) return out;
  const { rows } = await query<{ user_id: string; wins: string; podiums: string }>(
    `WITH ranked AS (
       SELECT user_id,
              RANK() OVER (PARTITION BY day ORDER BY score DESC, created_at ASC) AS rank
         FROM daily_runs
        WHERE complete AND score > 0 AND day < $2::date
     )
     SELECT user_id,
            count(*) FILTER (WHERE rank = 1)::text AS wins,
            count(*) FILTER (WHERE rank <= $3)::text AS podiums
       FROM ranked
      WHERE user_id = ANY($1::uuid[])
      GROUP BY user_id`,
    [[...new Set(userIds)], today, PODIUM_RANK],
  );
  for (const r of rows) {
    out.set(r.user_id, { wins: Number(r.wins), podiums: Number(r.podiums) });
  }
  return out;
}

/** A champion as the client sees them — the account id stays here. */
function strip(c: DailyChampion & { userId: string }): DailyChampion {
  return { day: c.day, username: c.username, avatar: c.avatar, score: c.score };
}

/** Every day's winner, newest first. Closed days only. */
async function dailyChampions(
  today: string,
  limit = CHAMPIONS_LIMIT,
): Promise<(DailyChampion & { userId: string })[]> {
  const { rows } = await query<{
    username: string;
    avatar: string | null;
    day: string;
    score: number;
    user_id: string;
  }>(
    `WITH ranked AS (
       SELECT user_id, day, score,
              RANK() OVER (PARTITION BY day ORDER BY score DESC, created_at ASC) AS rank
         FROM daily_runs
        WHERE complete AND score > 0 AND day < $1::date
     )
     SELECT u.username, u.profile ->> 'avatar' AS avatar,
            to_char(k.day, 'YYYY-MM-DD') AS day, k.score, k.user_id
       FROM ranked k JOIN users u ON u.id = k.user_id
      WHERE k.rank = 1
      ORDER BY k.day DESC
      LIMIT $2`,
    [today, limit],
  );
  return rows.map((r) => ({
    day: r.day,
    username: r.username,
    avatar: r.avatar ?? "",
    score: r.score,
    userId: r.user_id,
  }));
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
  if (!isDailyMove(rawMove)) throw new AccountError(400, "Invalid move.", "move.invalid");
  const move: DailyMove = rawMove;

  const run = await storedRun(userId, day);
  if (run === null) throw new AccountError(400, "Start today's run first.", "daily.notStarted");
  const { seed, moves } = run;
  if (run.complete)
    throw new AccountError(409, "You've already played today.", "daily.alreadyPlayed");
  if (moves.length >= MAX_MOVES)
    throw new AccountError(400, "That run is too long.", "run.tooLong");

  const before = dailyPosition(seed, moves);
  if (before.result.complete)
    throw new AccountError(409, "You've already played today.", "daily.alreadyPlayed");

  // Holding a die is judged against the turn as it stands — it does not start a
  // new one — and by the engine's own rule, so the server refuses exactly the
  // taps a local game refuses (including putting back the last held die).
  const held = holdIndex(move);
  if (held !== null) {
    if (!canToggleLock(before.state.turn, held)) {
      throw new AccountError(400, "That move isn't legal.", "move.illegal");
    }
  } else {
    // Legality is checked against the position the NEXT move actually starts
    // from — a finished turn is advanced past first, exactly as the replay does.
    const legal = getLegalActions(dailyMoveStart(before.state));
    if (move === "ROLL" && !legal.canRoll)
      throw new AccountError(400, "That move isn't legal.", "move.illegal");
    if (move === "BANK" && !legal.canBank)
      throw new AccountError(400, "That move isn't legal.", "move.illegal");
  }

  const next = [...moves, move];
  const after = dailyPosition(seed, next);
  const r = after.result;

  // A turn banked in a daily run is a turn the player played, so it counts
  // toward their career best like any other. Written from HERE rather than
  // reported by the client: the daily is the one mode whose score the server
  // derives itself, and feeding the board from the number it derived keeps that
  // property instead of handing it back to a client to pass along.
  if (r.bestTurn > before.result.bestTurn) {
    await raiseBestTurn(userId, r.bestTurn);
  }

  await query(
    `UPDATE daily_runs
        SET score = $3, turns = $4, banks = $5, busts = $6, hot_dice = $7,
            best_turn = $8, moves = $9, complete = $10, super_busts = $11
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
      r.superBusts,
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
    super_busts: number | null;
    hot_dice: number;
    best_turn: number;
    rank: string;
    players: string;
  }>(
    `WITH ranked AS (
       SELECT user_id, score, turns, banks, busts, super_busts, hot_dice, best_turn,
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
        avatar: string | null;
        score: number;
        turns: number;
        best_turn: number;
        busts: number;
        super_busts: number | null;
        hot_dice: number;
        rank: string;
        user_id: string;
      }>(
        `SELECT u.username, u.profile ->> 'avatar' AS avatar,
            r.score, r.turns, r.best_turn, r.busts, r.super_busts, r.hot_dice, r.user_id,
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

  // What this player, and everyone on the board with them, has to show for the
  // days that have already CLOSED: first places and top-ten finishes. Today's
  // standings say as much about the hour as about the run, so neither figure
  // counts a day that is still being written.
  const placings = await closedDayPlacings([userId, ...board.rows.map((r) => r.user_id)], day);
  const mineClosed = placings.get(userId) ?? { wins: 0, podiums: 0 };

  // Past winners. Closed days only, so this is safe to send before the run.
  const champions = await dailyChampions(day);
  const reigning = champions[0] ?? null;

  // Keep the account's copy in step, so the count reaches the Stats screen and
  // the leaderboards rather than living only in this response.
  if (mineClosed.wins > 0) await raiseDailyWins(userId, mineClosed.wins);

  return {
    day,
    run: own
      ? {
          score: own.score,
          turns: own.turns,
          banks: own.banks,
          busts: own.busts,
          // Null only for a row the backfill could not reach: a daily played
          // before the seed became a secret, whose moves belong to dice nobody
          // can reconstruct. Zero is the honest reading of "unknown" here.
          superBusts: own.super_busts ?? 0,
          hotDice: own.hot_dice,
          bestTurn: own.best_turn,
          complete: true,
        }
      : null,
    streak: await currentStreak(userId, day),
    leaderboard: board.rows.map((r) => ({
      username: r.username,
      avatar: r.avatar ?? "",
      score: r.score,
      turns: r.turns,
      bestTurn: r.best_turn,
      busts: r.busts,
      superBusts: r.super_busts ?? 0,
      hotDice: r.hot_dice,
      wins: placings.get(r.user_id)?.wins ?? 0,
      rank: Number(r.rank),
      you: r.user_id === userId ? true : undefined,
      crown: reigning && r.user_id === reigning.userId ? (true as const) : undefined,
    })),
    yourRank: own ? Number(own.rank) : null,
    players: Number(total.rows[0]?.n ?? 0),
    eliteEarned: mineClosed.podiums > 0,
    wins: mineClosed.wins,
    champion: reigning && strip(reigning),
    champions: champions.map(strip),
  };
}
