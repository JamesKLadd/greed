import { query } from "./db.js";

/**
 * The weekly streak's own record: one row per player per week they finished an
 * attempt in, kept forever.
 *
 * The streak used to be counted from weekly_runs, which the retention sweep
 * clears after 30 days — so it could never count back past about five weeks,
 * and stopped there however long a player kept it up. The daily had the same
 * bug and the same cure (daily-streaks.ts): keep the fact of playing, not the
 * run, after the run expires.
 */
export async function recordWeeklyCompletion(userId: string, week: string): Promise<void> {
  await query(
    `INSERT INTO weekly_completions (user_id, week) VALUES ($1, $2)
       ON CONFLICT (user_id, week) DO NOTHING`,
    [userId, week],
  );
}

/**
 * Backfill before pruning, from everything that still says a week was played:
 * the runs (a month of them), the all-time scores (kept forever, so streaks the
 * old count cut short come back), and the winner archive. A week a player
 * finished on a score of zero lived only in the runs, so one older than a month
 * cannot be recovered; nothing is invented for it.
 */
export async function preserveWeeklyCompletions(): Promise<void> {
  await query(
    `INSERT INTO weekly_completions (user_id, week)
       SELECT user_id, week FROM weekly_runs
       UNION SELECT user_id, week FROM weekly_scores
       UNION SELECT user_id, week FROM weekly_champions
     ON CONFLICT (user_id, week) DO NOTHING`,
  );
}

/** Follow consecutive weeks back from this one, with no history limit. */
export async function currentWeeklyStreak(userId: string, thisWeek: string): Promise<number> {
  const { rows } = await query<{ streak: string }>(
    `WITH RECURSIVE streak_weeks AS (
       SELECT week FROM weekly_completions WHERE user_id = $1 AND week = $2::date
       UNION ALL
       SELECT c.week FROM weekly_completions c
         JOIN streak_weeks s ON c.week = s.week - 7
        WHERE c.user_id = $1
     )
     SELECT count(*)::text AS streak FROM streak_weeks`,
    [userId, thisWeek],
  );
  return Number(rows[0]?.streak ?? 0);
}
