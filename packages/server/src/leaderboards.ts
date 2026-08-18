/**
 * Lifetime leaderboards and per-player match history.
 *
 * The leaderboard numbers come out of the `profile` jsonb on `users` — the same
 * monotonic profile the client syncs up after every game — rather than from a
 * separate tally. That means there is exactly one place a career stat lives, so
 * a board can never disagree with the Stats screen a player is looking at.
 *
 * The trade-off is that these figures are only as honest as the client that
 * reported them: the profile merge is monotonic (see accounts.ts), so a value
 * can be inflated but never quietly rolled back. Ranked play would need
 * server-derived stats; these boards are a social scoreboard, not a ladder, and
 * are labelled as such.
 */

import { query } from "./db.js";

/** The career stats a board can be built on. */
export const LEADERBOARD_CATEGORIES = ["wins", "bestTurn", "bestStreak", "bestTotal"] as const;
export type LeaderboardCategory = (typeof LEADERBOARD_CATEGORIES)[number];

export function isLeaderboardCategory(v: unknown): v is LeaderboardCategory {
  return typeof v === "string" && (LEADERBOARD_CATEGORIES as readonly string[]).includes(v);
}

export interface LeaderboardEntry {
  username: string;
  value: number;
  rank: number;
  you?: boolean;
}

export interface LeaderboardView {
  category: LeaderboardCategory;
  entries: LeaderboardEntry[];
  /** The caller's rank, even when they fall outside the returned slice. */
  yourRank: number | null;
  yourValue: number | null;
  players: number;
}

/** How many rows a board returns. */
const BOARD_SIZE = 25;

/**
 * The jsonb key each category reads. Whitelisted through this map rather than
 * interpolated from the request: the key lands inside the SQL text (jsonb path
 * extraction can't be a bind parameter), so it must never be caller-controlled.
 */
const FIELD: Record<LeaderboardCategory, string> = {
  wins: "wins",
  bestTurn: "bestTurn",
  bestStreak: "bestStreak",
  bestTotal: "bestTotal",
};

export async function leaderboard(
  category: LeaderboardCategory,
  userId: string | null,
): Promise<LeaderboardView> {
  const field = FIELD[category];
  // COALESCE so a profile that predates a field still ranks (at zero) rather
  // than dropping out of the board entirely.
  const value = `COALESCE((profile ->> '${field}')::numeric, 0)`;

  const { rows } = await query<{ username: string; value: string; rank: string; id: string }>(
    `WITH ranked AS (
       SELECT id, username, ${value} AS value,
              RANK() OVER (ORDER BY ${value} DESC, created_at ASC) AS rank
       FROM users
       WHERE ${value} > 0
     )
     SELECT * FROM ranked ORDER BY rank LIMIT $1`,
    [BOARD_SIZE],
  );

  const { rows: totals } = await query<{ count: string }>(
    `SELECT count(*)::text AS count FROM users WHERE ${value} > 0`,
  );

  let yourRank: number | null = null;
  let yourValue: number | null = null;
  if (userId) {
    const { rows: own } = await query<{ value: string; rank: string }>(
      `WITH ranked AS (
         SELECT id, ${value} AS value,
                RANK() OVER (ORDER BY ${value} DESC, created_at ASC) AS rank
         FROM users
         WHERE ${value} > 0
       )
       SELECT value, rank FROM ranked WHERE id = $1`,
      [userId],
    );
    if (own[0]) {
      yourRank = Number(own[0].rank);
      yourValue = Number(own[0].value);
    }
  }

  return {
    category,
    entries: rows.map((r) => ({
      username: r.username,
      value: Number(r.value),
      rank: Number(r.rank),
      you: userId != null && r.id === userId,
    })),
    yourRank,
    yourValue,
    players: Number(totals[0]?.count ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Match history
// ---------------------------------------------------------------------------

export interface MatchRecord {
  playedAt: string;
  won: boolean;
  score: number;
  goal: number;
  players: number;
  team: number | null;
  opponents: string[];
}

/** How many past games the history returns. */
const HISTORY_SIZE = 20;

export interface FinishedMatch {
  userId: string;
  won: boolean;
  score: number;
  goal: number;
  players: number;
  team: number | null;
  opponents: string[];
}

/** Record one finished online game for one signed-in player. */
export async function recordMatch(m: FinishedMatch): Promise<void> {
  await query(
    `INSERT INTO match_history (user_id, won, score, goal, players, team, opponents)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [m.userId, m.won, m.score, m.goal, m.players, m.team, m.opponents],
  );
}

export async function matchHistory(userId: string): Promise<MatchRecord[]> {
  const { rows } = await query<{
    played_at: Date;
    won: boolean;
    score: number;
    goal: number;
    players: number;
    team: number | null;
    opponents: string[];
  }>(
    `SELECT played_at, won, score, goal, players, team, opponents
     FROM match_history
     WHERE user_id = $1
     ORDER BY played_at DESC
     LIMIT $2`,
    [userId, HISTORY_SIZE],
  );
  return rows.map((r) => ({
    playedAt: r.played_at.toISOString(),
    won: r.won,
    score: r.score,
    goal: r.goal,
    players: r.players,
    team: r.team,
    opponents: r.opponents ?? [],
  }));
}

// ---------------------------------------------------------------------------
// All-time daily challenge
// ---------------------------------------------------------------------------

/** One run on the all-time daily board: who, which day, what they scored. */
export interface DailyBestEntry {
  username: string;
  /** The challenge's day, as YYYY-MM-DD. Formatted by the client, in its own
   *  timezone — an ISO instant would land on the wrong date west of UTC. */
  day: string;
  score: number;
  rank: number;
  you?: boolean;
}

export interface DailyBestView {
  entries: DailyBestEntry[];
  /** The viewer's own best run ever, even if it is nowhere near the top. */
  yourBest: DailyBestEntry | null;
  /** Total runs the board is drawn from. */
  runs: number;
  /**
   * True when TODAY's runs were left out because the viewer hasn't finished
   * today's challenge yet. The daily board is hidden until your run is in, and
   * an all-time board that included today would hand back what that withholds —
   * so today is filtered out rather than the whole board being denied.
   */
  todayHidden: boolean;
}

/** How many runs the all-time board shows. */
const DAILY_BOARD_SIZE = 25;

/**
 * The best daily runs ever played.
 *
 * A row is a RUN, not a player: the date is half of what makes a score worth
 * reading, and someone who has had two blinding days has earned both of them.
 */
export async function dailyBest(userId: string | null, today: string): Promise<DailyBestView> {
  // Has the viewer finished today's run? Until they have, today stays out of
  // the board (see todayHidden).
  let includeToday = false;
  if (userId) {
    const { rows } = await query<{ n: string }>(
      `SELECT count(*)::text AS n FROM daily_runs
        WHERE user_id = $1 AND day = $2 AND complete`,
      [userId, today],
    );
    includeToday = Number(rows[0]?.n ?? 0) > 0;
  }
  // Two forms of the same filter, so the ranking a player sees is the ranking
  // of the rows they are allowed to see rather than a top slice with holes in.
  const scope = includeToday ? `r.complete` : `r.complete AND r.day < $1::date`;
  const params = includeToday ? [] : [today];

  const { rows } = await query<{
    username: string;
    day: string;
    score: number;
    rank: string;
    user_id: string;
  }>(
    `SELECT u.username, to_char(r.day, 'YYYY-MM-DD') AS day, r.score, r.user_id,
            RANK() OVER (ORDER BY r.score DESC, r.day ASC) AS rank
       FROM daily_runs r JOIN users u ON u.id = r.user_id
      WHERE ${scope} AND r.score > 0
      ORDER BY rank
      LIMIT ${DAILY_BOARD_SIZE}`,
    params,
  );

  const { rows: totals } = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM daily_runs r WHERE ${scope} AND r.score > 0`,
    params,
  );

  let yourBest: DailyBestEntry | null = null;
  if (userId) {
    const mineParams = includeToday ? [userId] : [today, userId];
    const mine = includeToday ? `$1` : `$2`;
    const { rows: own } = await query<{
      username: string;
      day: string;
      score: number;
      rank: string;
    }>(
      `WITH ranked AS (
         SELECT u.username, to_char(r.day, 'YYYY-MM-DD') AS day, r.score, r.user_id,
                RANK() OVER (ORDER BY r.score DESC, r.day ASC) AS rank
           FROM daily_runs r JOIN users u ON u.id = r.user_id
          WHERE ${scope} AND r.score > 0
       )
       SELECT * FROM ranked WHERE user_id = ${mine} ORDER BY rank LIMIT 1`,
      mineParams,
    );
    const r = own[0];
    if (r) {
      yourBest = {
        username: r.username,
        day: r.day,
        score: r.score,
        rank: Number(r.rank),
        you: true,
      };
    }
  }

  return {
    entries: rows.map((r) => ({
      username: r.username,
      day: r.day,
      score: r.score,
      rank: Number(r.rank),
      you: userId != null && r.user_id === userId ? true : undefined,
    })),
    yourBest,
    runs: Number(totals[0]?.n ?? 0),
    todayHidden: !includeToday,
  };
}
