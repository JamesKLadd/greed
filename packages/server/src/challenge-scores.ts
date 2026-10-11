import { query } from "./db.js";

// Table and column names come only from this closed set, never a request.
const SOURCES = {
  daily: { runs: "daily_runs", scores: "daily_scores", period: "day", finished: "AND complete" },
  weekly: { runs: "weekly_runs", scores: "weekly_scores", period: "week", finished: "" },
} as const;

type ChallengeKind = keyof typeof SOURCES;

/** Save the scored result in the same transaction as challenge completion. */
export async function recordChallengeScore(
  kind: ChallengeKind,
  userId: string,
  period: string,
): Promise<void> {
  await copyScores(kind, [userId, period]);
}

/** Backfill surviving results before replay cleanup, including older servers' writes. */
export async function preserveChallengeScores(kind: ChallengeKind): Promise<void> {
  await copyScores(kind);
  if (kind === "weekly") {
    // Some known winning scores already outlived their replay. Keep those too,
    // without inventing the best-turn tiebreak that the winner archive lacks.
    await query(
      `INSERT INTO weekly_scores (user_id, week, score, best_turn)
         SELECT user_id, week, score, NULL FROM weekly_champions WHERE score > 0
       ON CONFLICT (user_id, week) DO NOTHING`,
    );
  }
}

async function copyScores(kind: ChallengeKind, params: unknown[] = []): Promise<void> {
  const { runs, scores, period, finished } = SOURCES[kind];
  await query(
    `INSERT INTO ${scores} (user_id, ${period}, score, best_turn)
       SELECT user_id, ${period}, score, best_turn FROM ${runs}
        WHERE score > 0 ${finished}
          ${params.length ? `AND user_id = $1 AND ${period} = $2::date` : ""}
     ON CONFLICT (user_id, ${period}) DO UPDATE
       SET score = EXCLUDED.score, best_turn = EXCLUDED.best_turn
       WHERE EXCLUDED.score > ${scores}.score
          OR (EXCLUDED.score = ${scores}.score
              AND (${scores}.best_turn IS NULL OR EXCLUDED.best_turn > ${scores}.best_turn))`,
    params,
  );
}
