import { query } from "./db.js";
import { DAILY_ORDER_R, WEEKLY_ORDER_R } from "./ranking.js";

export interface FriendChallengeRow {
  user_id: string;
  username: string;
  avatar: string | null;
  visual_beta: unknown;
  score: number;
  turns: number;
  best_turn: number;
  busts: number;
  super_busts: number | null;
  hot_dice: number;
  attempts: number;
  rank: string;
}

/** Rank the viewer and accepted friends before limiting. Never filter a global top slice. */
export async function challengeFriends(kind: "daily" | "weekly", userId: string, period: string) {
  const daily = kind === "daily";
  const { rows } = await query<FriendChallengeRow>(
    `SELECT u.username, u.profile ->> 'avatar' AS avatar,
            u.profile -> 'visualBeta' AS visual_beta,
            r.user_id, r.score, r.turns, r.best_turn, r.busts, r.super_busts, r.hot_dice,
            ${daily ? "0" : "r.attempts"} AS attempts,
            RANK() OVER (ORDER BY ${daily ? DAILY_ORDER_R : WEEKLY_ORDER_R}) AS rank
       FROM ${daily ? "daily_runs" : "weekly_runs"} r JOIN users u ON u.id = r.user_id
      WHERE r.${daily ? "day" : "week"} = $1 ${daily ? "AND r.complete" : ""}
        AND (r.user_id = $2 OR r.user_id IN (
          SELECT CASE WHEN f.requester_id = $2 THEN f.addressee_id ELSE f.requester_id END
            FROM friendships f
           WHERE f.status = 'accepted' AND (f.requester_id = $2 OR f.addressee_id = $2)
        ))
      ORDER BY rank, u.username
      LIMIT 100`,
    [period, userId],
  );
  return rows;
}
