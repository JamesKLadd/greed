import { weekKey } from "@greed/core";
import { query } from "./db.js";

export const WEEKLY_HISTORY_WEEKS = 52;

/**
 * Preserve the ledger's settled winner, using the run or permanent score summary.
 * Older ledger entries can recover a winner's name even after the score is lost.
 * Once captured, neither a later ranking rule nor a retry changes the result.
 */
export async function preserveWeeklyChampions(thisWeek = weekKey()): Promise<void> {
  await query(
    `INSERT INTO weekly_champions (week, user_id, score)
     SELECT w.period, w.user_id, COALESCE(r.score, s.score)
       FROM challenge_wins w
       LEFT JOIN weekly_runs r ON r.week = w.period AND r.user_id = w.user_id
       LEFT JOIN weekly_scores s ON s.week = w.period AND s.user_id = w.user_id
      WHERE w.kind = 'weekly' AND w.period < $1::date
        AND w.period >= $1::date - ($2::int * 7)
     ON CONFLICT (week) DO UPDATE
       SET score = COALESCE(weekly_champions.score, EXCLUDED.score)
       WHERE weekly_champions.user_id = EXCLUDED.user_id
         AND weekly_champions.score IS NULL AND EXCLUDED.score IS NOT NULL`,
    [thisWeek, WEEKLY_HISTORY_WEEKS],
  );
}
