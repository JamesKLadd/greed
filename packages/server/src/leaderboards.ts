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
import { cleanBetaIdentity, type BetaIdentity } from "@greed/protocol";
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
 * How each challenge's winners are found, and from where.
 *
 * Both are "finished top of a board that has closed", tie-broken exactly as the
 * board itself draws them so every day and every week has one winner. Written
 * out here rather than reusing the challenge modules' own placings queries,
 * because those answer for a named list of players and this has to answer for
 * everybody at once.
 *
 * Each statement yields one row per closed period — who won it, and which day
 * or week it was — not a count. A count taken from the run tables is only ever
 * a count of the last thirty days, which is the bug the ledger below exists to
 * fix; see refreshCareerChallengeWins.
 */
const CHALLENGE_WINS = {
  daily: {
    column: "daily_wins",
    /** Today's board is still filling up, so today is not a win yet. */
    openBoard: dailyKey,
    winners: `SELECT user_id, day AS period FROM (
            SELECT user_id, day,
                   RANK() OVER (PARTITION BY day ORDER BY ${DAILY_ORDER}) AS rank
              FROM daily_runs WHERE complete AND score > 0 AND day < $1::date
          ) r WHERE rank = 1`,
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
    winners: `SELECT user_id, week AS period FROM (
            SELECT user_id, week,
                   RANK() OVER (PARTITION BY week ORDER BY ${WEEKLY_ORDER}) AS rank
              FROM weekly_runs WHERE score > 0 AND week < $1::date
          ) r WHERE rank = 1`,
  },
} as const;

/**
 * Bank the winner of every day or week that has closed since the last call.
 *
 * Wins are written to `challenge_wins`, one row per closed period, and each new
 * row adds one to the winner's career column. The ledger is never pruned; the
 * run tables it is read from are, after thirty days.
 *
 * This used to keep the column as GREATEST(stored, a count taken from the run
 * tables) — a high-water mark, on the reasoning that the count shrinks as old
 * runs are pruned and a career total should not. But the count was never a
 * career total in the first place. It was the number of wins inside the last
 * thirty days, and the maximum of a sliding window is not a sum: a player who
 * had four wins and then won two more days, while two of the old winning days
 * aged out, went from four to four. Reported exactly like that, and reproduced
 * exactly like that, day by day, against a real database.
 *
 * So a period is written down once, when it has closed, and after that its
 * result stands. Only the periods the ledger has not yet seen are banked —
 * `NOT EXISTS` on the period, not just the player — so a closed day can never
 * gain a second winner, even if a later rule would rank it differently. That
 * is deliberate: re-deciding closed days from whatever runs happen to survive
 * is precisely how wins were lost before.
 *
 * Safe to run concurrently and repeatedly. A closed period's runs are frozen —
 * moves only ever reach today's run and this week's attempt — so two callers
 * find the same winners, and the primary key lets exactly one of them insert;
 * `RETURNING` reports only rows actually inserted, so the column moves once.
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
  const { column, winners } = CHALLENGE_WINS[kind];
  await query(
    `WITH winners AS (${winners}),
          banked AS (
            INSERT INTO challenge_wins (kind, period, user_id)
            SELECT $2::text, w.period, w.user_id FROM winners w
             WHERE NOT EXISTS (
                     SELECT 1 FROM challenge_wins c
                      WHERE c.kind = $2::text AND c.period = w.period)
            ON CONFLICT DO NOTHING
            RETURNING user_id
          )
     INSERT INTO career_stats (user_id, ${column})
     SELECT user_id, count(*)::int FROM banked GROUP BY user_id
     ON CONFLICT (user_id) DO UPDATE
       SET ${column} = career_stats.${column} + EXCLUDED.${column},
           updated_at = now()`,
    [openBoard, kind],
  );
}

/**
 * Start the ledger from the runs that are still there. Once, on the boot that
 * creates it; see applyOnce in db.ts.
 *
 * Only the last thirty days of runs survive to be read, so this cannot know
 * about a win older than that. What it CAN do is not make anything worse: the
 * stored column is kept wherever it is already higher, since it may be holding
 * a win whose run has since been deleted. The two are never added together —
 * they overlap by an amount nothing on record can tell.
 *
 * After this, the refresh above only ever adds, one closed period at a time.
 */
export async function seedChallengeWinsLedger(kind: "daily" | "weekly"): Promise<void> {
  const { column, winners, openBoard } = CHALLENGE_WINS[kind];
  await query(
    `WITH winners AS (${winners}),
          banked AS (
            INSERT INTO challenge_wins (kind, period, user_id)
            SELECT $2::text, w.period, w.user_id FROM winners w
            ON CONFLICT DO NOTHING
            RETURNING user_id
          )
     INSERT INTO career_stats (user_id, ${column})
     SELECT user_id, count(*)::int FROM banked GROUP BY user_id
     ON CONFLICT (user_id) DO UPDATE
       SET ${column} = GREATEST(career_stats.${column}, EXCLUDED.${column}),
           updated_at = now()`,
    [openBoard(), kind],
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
  avatar: string;
  /** The equipped Locker portrait, read live from the account. */
  visualBeta?: BetaIdentity;
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
      `SELECT count(*)::text AS n FROM daily_completions
        WHERE user_id = $1 AND day = $2`,
      [userId, today],
    );
    includeToday = Number(rows[0]?.n ?? 0) > 0;
  }
  // Two forms of the same filter, so the ranking a player sees is the ranking
  // of the rows they are allowed to see rather than a top slice with holes in.
  const scope = includeToday ? `TRUE` : `r.day < $1::date`;
  const params = includeToday ? [] : [today];

  const { rows } = await query<{
    username: string;
    avatar: string | null;
    visual_beta: unknown;
    day: string;
    score: number;
    rank: string;
    user_id: string;
  }>(
    `SELECT u.username, u.profile ->> 'avatar' AS avatar,
            u.profile -> 'visualBeta' AS visual_beta, to_char(r.day, 'YYYY-MM-DD') AS day, r.score, r.user_id,
            RANK() OVER (ORDER BY ${DAILY_ALLTIME_ORDER_R}) AS rank
       FROM daily_scores r JOIN users u ON u.id = r.user_id
      WHERE ${scope} AND r.score > 0
      ORDER BY rank
      LIMIT ${DAILY_BOARD_SIZE}`,
    params,
  );

  const { rows: totals } = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM daily_scores r WHERE ${scope} AND r.score > 0`,
    params,
  );

  let yourBest: DailyBestEntry | null = null;
  if (userId) {
    const mineParams = includeToday ? [userId] : [today, userId];
    const mine = includeToday ? `$1` : `$2`;
    const { rows: own } = await query<{
      username: string;
      avatar: string | null;
      visual_beta: unknown;
      day: string;
      score: number;
      rank: string;
    }>(
      `WITH ranked AS (
         SELECT u.username, u.profile ->> 'avatar' AS avatar,
                u.profile -> 'visualBeta' AS visual_beta, to_char(r.day, 'YYYY-MM-DD') AS day, r.score, r.user_id,
                RANK() OVER (ORDER BY ${DAILY_ALLTIME_ORDER_R}) AS rank
           FROM daily_scores r JOIN users u ON u.id = r.user_id
          WHERE ${scope} AND r.score > 0
       )
       SELECT * FROM ranked WHERE user_id = ${mine} ORDER BY rank LIMIT 1`,
      mineParams,
    );
    const r = own[0];
    if (r) {
      yourBest = {
        username: r.username,
        avatar: r.avatar ?? "",
        visualBeta: cleanBetaIdentity(r.visual_beta),
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
      avatar: r.avatar ?? "",
      visualBeta: cleanBetaIdentity(r.visual_beta),
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
  avatar: string;
  /** The equipped Locker portrait, read live from the account. */
  visualBeta?: BetaIdentity;
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
 * A row is a PLAYER'S WEEK, not an attempt: `weekly_scores` keeps only
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
    avatar: string | null;
    visual_beta: unknown;
    week: string;
    score: number;
    rank: string;
    user_id: string;
  }>(
    `SELECT u.username, u.profile ->> 'avatar' AS avatar,
            u.profile -> 'visualBeta' AS visual_beta, to_char(r.week, 'YYYY-MM-DD') AS week, r.score, r.user_id,
            RANK() OVER (ORDER BY ${WEEKLY_ALLTIME_ORDER_R}) AS rank
       FROM weekly_scores r JOIN users u ON u.id = r.user_id
      WHERE r.score > 0
      ORDER BY rank
      LIMIT ${WEEKLY_BOARD_SIZE}`,
  );

  const { rows: totals } = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM weekly_scores r WHERE r.score > 0`,
  );

  let yourBest: WeeklyBestEntry | null = null;
  if (userId) {
    const { rows: own } = await query<{
      username: string;
      avatar: string | null;
      visual_beta: unknown;
      week: string;
      score: number;
      rank: string;
    }>(
      `WITH ranked AS (
         SELECT u.username, u.profile ->> 'avatar' AS avatar,
                u.profile -> 'visualBeta' AS visual_beta, to_char(r.week, 'YYYY-MM-DD') AS week, r.score, r.user_id,
                RANK() OVER (ORDER BY ${WEEKLY_ALLTIME_ORDER_R}) AS rank
           FROM weekly_scores r JOIN users u ON u.id = r.user_id
          WHERE r.score > 0
       )
       SELECT * FROM ranked WHERE user_id = $1 ORDER BY rank LIMIT 1`,
      [userId],
    );
    const r = own[0];
    if (r) {
      yourBest = {
        username: r.username,
        avatar: r.avatar ?? "",
        visualBeta: cleanBetaIdentity(r.visual_beta),
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
      avatar: r.avatar ?? "",
      visualBeta: cleanBetaIdentity(r.visual_beta),
      week: r.week,
      score: r.score,
      rank: Number(r.rank),
      you: userId != null && r.user_id === userId ? true : undefined,
    })),
    yourBest,
    runs: Number(totals[0]?.n ?? 0),
  };
}
