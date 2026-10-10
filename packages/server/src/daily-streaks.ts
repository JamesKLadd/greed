import { query } from "./db.js";

/** Keep only the fact of completion after the scored run and its replay expire. */
export async function recordDailyCompletion(userId: string, day: string): Promise<void> {
  await query(
    `INSERT INTO daily_completions (user_id, day) VALUES ($1, $2)
       ON CONFLICT (user_id, day) DO NOTHING`,
    [userId, day],
  );
}

/** Backfill before pruning, including runs completed by an older server process. */
export async function preserveDailyCompletions(): Promise<void> {
  await query(
    `INSERT INTO daily_completions (user_id, day)
       SELECT user_id, day FROM daily_runs WHERE complete
       ON CONFLICT (user_id, day) DO NOTHING`,
  );
}

/** Follow consecutive calendar dates through the index, with no history limit. */
export async function currentDailyStreak(userId: string, today: string): Promise<number> {
  const { rows } = await query<{ streak: string }>(
    `WITH RECURSIVE streak_days AS (
       SELECT day FROM daily_completions WHERE user_id = $1 AND day = $2::date
       UNION ALL
       SELECT c.day FROM daily_completions c
         JOIN streak_days s ON c.day = s.day - 1
        WHERE c.user_id = $1
     )
     SELECT count(*)::text AS streak FROM streak_days`,
    [userId, today],
  );
  return Number(rows[0]?.streak ?? 0);
}
