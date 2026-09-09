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

import { GOAL_DEFAULT } from "@greed/core";
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
 * The career_stats column each category ranks.
 *
 * Whitelisted through this map rather than interpolated from the request: the
 * column name lands inside the SQL text, so it must never be caller-controlled.
 *
 * These used to be jsonb keys on `users.profile` — a snapshot the CLIENT
 * uploads — which meant the boards ranked whatever a client claimed. They now
 * read a table only the server writes, from games it ran itself. What a board
 * measures changed with that: `wins` is online wins, because an offline game
 * against bots is not something anyone but the player can vouch for.
 */
const FIELD: Record<LeaderboardCategory, string> = {
  wins: "online_wins",
  bestTurn: "best_turn",
  bestStreak: "best_streak",
  bestTotal: "best_total",
};

export async function leaderboard(
  category: LeaderboardCategory,
  userId: string | null,
): Promise<LeaderboardView> {
  const value = `c.${FIELD[category]}`;

  const { rows } = await query<{ username: string; value: string; rank: string; id: string }>(
    `WITH ranked AS (
       SELECT u.id, u.username, ${value} AS value,
              RANK() OVER (ORDER BY ${value} DESC, u.created_at ASC) AS rank
       FROM career_stats c JOIN users u ON u.id = c.user_id
       WHERE ${value} > 0
     )
     SELECT * FROM ranked ORDER BY rank LIMIT $1`,
    [BOARD_SIZE],
  );

  const { rows: totals } = await query<{ count: string }>(
    `SELECT count(*)::text AS count FROM career_stats c WHERE ${value} > 0`,
  );

  let yourRank: number | null = null;
  let yourValue: number | null = null;
  if (userId) {
    const { rows: own } = await query<{ value: string; rank: string }>(
      `WITH ranked AS (
         SELECT u.id, ${value} AS value,
                RANK() OVER (ORDER BY ${value} DESC, u.created_at ASC) AS rank
         FROM career_stats c JOIN users u ON u.id = c.user_id
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
  /** Their best single turn in this game, derived from the server's own log. */
  bestTurn: number;
}

/**
 * Record one finished online game for one signed-in player: the row in their
 * history, and the same game folded into their career figures.
 *
 * The career half is what the all-time boards rank, so it is written HERE —
 * from a game this server ran and scored — rather than accepted from a client.
 *
 * Best Total only counts a game played to the standard goal: the goal is a
 * setting, and a table set to 20,000 would otherwise post a finishing total no
 * ordinary game could approach.
 */
export async function recordMatch(m: FinishedMatch): Promise<void> {
  await query(
    `INSERT INTO match_history (user_id, won, score, goal, players, team, opponents)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [m.userId, m.won, m.score, m.goal, m.players, m.team, m.opponents],
  );
  const eligibleTotal = m.goal === GOAL_DEFAULT ? m.score : 0;
  await query(
    `INSERT INTO career_stats
       (user_id, online_games, online_wins, current_streak, best_streak, best_turn, best_total)
     VALUES ($1, 1, $2, $2, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET
       online_games   = career_stats.online_games + 1,
       online_wins    = career_stats.online_wins + $2,
       -- A loss ends the run; a win extends it.
       current_streak = CASE WHEN $2 = 1 THEN career_stats.current_streak + 1 ELSE 0 END,
       best_streak    = GREATEST(
                          career_stats.best_streak,
                          CASE WHEN $2 = 1 THEN career_stats.current_streak + 1 ELSE 0 END),
       best_turn      = GREATEST(career_stats.best_turn, $3),
       best_total     = GREATEST(career_stats.best_total, $4),
       updated_at     = now()`,
    [m.userId, m.won ? 1 : 0, Math.max(0, Math.round(m.bestTurn)), Math.max(0, eligibleTotal)],
  );
}

/**
 * Raise a player's career best turn, from wherever the server scored it.
 *
 * The daily and weekly both derive a best turn by replaying a run's moves, and
 * that is as much the server's own figure as an online game is — so it belongs
 * on the same row the boards read.
 */
export async function raiseCareerBestTurn(userId: string, points: number): Promise<void> {
  if (!(points > 0)) return;
  await query(
    `INSERT INTO career_stats (user_id, best_turn) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE
       SET best_turn = GREATEST(career_stats.best_turn, EXCLUDED.best_turn),
           updated_at = now()`,
    [userId, Math.round(points)],
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

// ---------------------------------------------------------------------------
// All-time weekly challenge
// ---------------------------------------------------------------------------

/** One attempt on the all-time weekly board: who, which week, what they scored. */
export interface WeeklyBestEntry {
  username: string;
  /** The challenge week's Monday, as YYYY-MM-DD. Formatted by the client, in
   *  its own timezone — an ISO instant would land on the wrong date west of UTC. */
  week: string;
  score: number;
  rank: number;
  you?: boolean;
}

export interface WeeklyBestView {
  entries: WeeklyBestEntry[];
  /** The viewer's own best week ever, even if it is nowhere near the top. */
  yourBest: WeeklyBestEntry | null;
  /** Total weeks the board is drawn from. */
  runs: number;
}

/** How many rows the all-time weekly board shows. */
const WEEKLY_BOARD_SIZE = 25;

/**
 * The best weekly scores ever posted.
 *
 * A row is a PLAYER'S WEEK, not an attempt: `weekly_runs` already keeps only
 * the best attempt of each week, so a great week appears once however many
 * tries it took. The date is half of what makes a score worth reading, and
 * someone who has had two blinding weeks has earned both of them.
 *
 * Unlike the all-time daily board, this one has no current-period filter.
 * That board hides today because the daily withholds today's scores until your
 * run is in, and an all-time board would hand back exactly what was withheld.
 * The weekly's board is public from the first moment of the week, so there is
 * nothing to protect and this week ranks alongside every other.
 */
export async function weeklyBest(
  userId: string | null,
  _thisWeek: string,
): Promise<WeeklyBestView> {
  void _thisWeek; // kept in the signature: see the note above about filtering
  const { rows } = await query<{
    username: string;
    week: string;
    score: number;
    rank: string;
    user_id: string;
  }>(
    `SELECT u.username, to_char(r.week, 'YYYY-MM-DD') AS week, r.score, r.user_id,
            RANK() OVER (ORDER BY r.score DESC, r.week ASC) AS rank
       FROM weekly_runs r JOIN users u ON u.id = r.user_id
      WHERE r.score > 0
      ORDER BY rank
      LIMIT ${WEEKLY_BOARD_SIZE}`,
  );

  const { rows: totals } = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM weekly_runs r WHERE r.score > 0`,
  );

  let yourBest: WeeklyBestEntry | null = null;
  if (userId) {
    const { rows: own } = await query<{
      username: string;
      week: string;
      score: number;
      rank: string;
    }>(
      `WITH ranked AS (
         SELECT u.username, to_char(r.week, 'YYYY-MM-DD') AS week, r.score, r.user_id,
                RANK() OVER (ORDER BY r.score DESC, r.week ASC) AS rank
           FROM weekly_runs r JOIN users u ON u.id = r.user_id
          WHERE r.score > 0
       )
       SELECT * FROM ranked WHERE user_id = $1 ORDER BY rank LIMIT 1`,
      [userId],
    );
    const r = own[0];
    if (r) {
      yourBest = {
        username: r.username,
        week: r.week,
        score: r.score,
        rank: Number(r.rank),
        you: true,
      };
    }
  }

  return {
    entries: rows.map((r) => ({
      username: r.username,
      week: r.week,
      score: r.score,
      rank: Number(r.rank),
      you: userId != null && r.user_id === userId ? true : undefined,
    })),
    yourBest,
    runs: Number(totals[0]?.n ?? 0),
  };
}
