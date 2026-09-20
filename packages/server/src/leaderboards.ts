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

import { GOAL_DEFAULT, dailyKey, weekKey } from "@greed/core";
import { query } from "./db.js";
import {
  DAILY_ALLTIME_ORDER_R,
  DAILY_ORDER,
  WEEKLY_ALLTIME_ORDER_R,
  WEEKLY_ORDER,
} from "./ranking.js";

/** The career stats a board can be built on. */
export const LEADERBOARD_CATEGORIES = [
  "wins",
  "bestTurn",
  "bestStreak",
  "bestTotal",
  "dailyWins",
  "weeklyWins",
] as const;
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
  dailyWins: "daily_wins",
  weeklyWins: "weekly_wins",
};

export async function leaderboard(
  category: LeaderboardCategory,
  userId: string | null,
): Promise<LeaderboardView> {
  // The four online boards are written as games finish, so they are already
  // current. The two challenge boards are a tally of the run tables, and this
  // is what keeps them from lagging behind the days and weeks that have closed
  // since anybody last looked.
  if (category === "dailyWins") await refreshCareerChallengeWins("daily");
  if (category === "weeklyWins") await refreshCareerChallengeWins("weekly");

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
 * How each challenge's wins are counted, and from where.
 *
 * Both are "finished top of a board that has closed", tie-broken exactly as the
 * board itself draws them so every day and every week has one winner. Written
 * out here rather than reusing the challenge modules' own placings queries,
 * because those answer for a named list of players and this has to answer for
 * everybody at once.
 */
const CHALLENGE_WINS = {
  daily: {
    column: "daily_wins",
    /** Today's board is still filling up, so today is not a win yet. */
    openBoard: dailyKey,
    sql: `SELECT user_id, count(*)::int AS wins FROM (
            SELECT user_id,
                   RANK() OVER (PARTITION BY day ORDER BY ${DAILY_ORDER}) AS rank
              FROM daily_runs WHERE complete AND score > 0 AND day < $1::date
          ) r WHERE rank = 1 GROUP BY user_id`,
  },
  weekly: {
    column: "weekly_wins",
    /**
     * The Monday of the week still being played — NOT today.
     *
     * This is the whole of the bug that made these boards wrong on the day they
     * shipped. A week's key is the Monday it starts on, so from Tuesday onward
     * the current week's key is strictly less than today's date: comparing
     * against today let the week in progress through as though it had closed,
     * and whoever happened to be leading it was credited with a win they had
     * not won yet. The comment here used to state that "a Monday is strictly
     * less than today" as the REASON the boundary was safe, which is exactly
     * backwards — it is the reason it was not.
     */
    openBoard: weekKey,
    sql: `SELECT user_id, count(*)::int AS wins FROM (
            SELECT user_id,
                   RANK() OVER (PARTITION BY week ORDER BY ${WEEKLY_ORDER}) AS rank
              FROM weekly_runs WHERE score > 0 AND week < $1::date
          ) r WHERE rank = 1 GROUP BY user_id`,
  },
} as const;

/**
 * Bring the career count of days or weeks taken outright up to date.
 *
 * A stored column rather than a live count, and GREATEST rather than
 * assignment, for one reason: wins are derived from the run tables and those
 * are pruned after thirty days, so the derived figure SHRINKS as a player's
 * history ages out. A career total that went down would be a strange thing to
 * show anybody, so the high-water mark is kept here and the boards rank that.
 *
 * Called from two places, and it needs both. Reading a board refreshes it, so
 * what is on screen is never behind the days and weeks that closed since anyone
 * last looked. The retention sweep refreshes it too, just BEFORE it deletes
 * anything, so a win is banked even if nobody happens to open the board in the
 * month between earning it and the run expiring.
 *
 * `kind` picks the statement from a closed set rather than naming a column,
 * because the column name lands inside the SQL text — same rule as FIELD above.
 */
export async function refreshCareerChallengeWins(
  kind: "daily" | "weekly",
  /**
   * The period still being played, whose board is therefore not yet won.
   *
   * Defaulted from the clock, but taken from the caller where there is one:
   * the challenge screens are told which day or week they are reporting on,
   * and a refresh that asked the clock instead would answer about a different
   * period than the screen that triggered it.
   */
  openBoard = CHALLENGE_WINS[kind].openBoard(),
): Promise<void> {
  const { column, sql } = CHALLENGE_WINS[kind];
  await query(
    `INSERT INTO career_stats (user_id, ${column})
     ${sql}
     ON CONFLICT (user_id) DO UPDATE
       SET ${column} = GREATEST(career_stats.${column}, EXCLUDED.${column}),
           updated_at = now()`,
    [openBoard],
  );
}

/**
 * Recompute a challenge's career wins from scratch, lowering them if need be.
 *
 * GREATEST is what makes this necessary rather than self-healing. The tally is
 * a high-water mark so that a win survives its run being pruned, and the price
 * of that is a stored figure which cannot come down on its own — so whenever a
 * banked answer stops being the right one, something has to come and say so.
 *
 * It has happened twice. A boundary bug credited weekly wins for a week that
 * had not finished; and changing how a tie is settled re-decided days and weeks
 * that had already been counted, leaving players holding wins the board no
 * longer shows them winning.
 *
 * Only safe to lower while nothing has been pruned since the columns existed —
 * after that a stored figure above today's honest count may be a real win whose
 * run has expired, and indistinguishable from a stale one. Both columns were
 * created on 2026-09-14 and retention is thirty days, so that is true now and
 * stops being true in October. Which is why every call is applied once and
 * written down; see applyOnce in db.ts.
 */
export async function recountCareerChallengeWins(kind: "daily" | "weekly"): Promise<void> {
  const { column, sql, openBoard } = CHALLENGE_WINS[kind];
  await query(
    `WITH winners AS (${sql})
     UPDATE career_stats c
        SET ${column} = COALESCE(w.wins, 0),
            updated_at = now()
       FROM (SELECT user_id FROM career_stats WHERE ${column} > 0) stale
       LEFT JOIN winners w ON w.user_id = stale.user_id
      WHERE c.user_id = stale.user_id`,
    [openBoard()],
  );
}

/**
 * The career win counts for a set of players, as the boards rank them.
 *
 * So that the challenge screens can show the same figure the board does. They
 * used to show a LIVE count, recomputed from the run tables on every read, and
 * the two are not the same number: the live one falls as a player's runs are
 * pruned, and falls again if a rule change re-decides a day. That is exactly
 * how a player came to read four wins on one screen and six on another.
 */
export async function careerChallengeWins(
  kind: "daily" | "weekly",
  userIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (userIds.length === 0) return out;
  const { column } = CHALLENGE_WINS[kind];
  const { rows } = await query<{ user_id: string; wins: number }>(
    `SELECT user_id, ${column} AS wins FROM career_stats WHERE user_id = ANY($1::uuid[])`,
    [[...new Set(userIds)]],
  );
  for (const r of rows) out.set(r.user_id, Number(r.wins));
  return out;
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
            RANK() OVER (ORDER BY ${DAILY_ALLTIME_ORDER_R}) AS rank
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
                RANK() OVER (ORDER BY ${DAILY_ALLTIME_ORDER_R}) AS rank
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
            RANK() OVER (ORDER BY ${WEEKLY_ALLTIME_ORDER_R}) AS rank
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
                RANK() OVER (ORDER BY ${WEEKLY_ALLTIME_ORDER_R}) AS rank
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
