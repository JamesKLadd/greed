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
