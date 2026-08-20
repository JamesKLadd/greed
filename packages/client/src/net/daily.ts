/** Daily challenge API. Scores come back from the server, which derives them by
 *  replaying the submitted moves — the client never reports a score. */

import type { DailyMove, DailyResult, GameState } from "@greed/core";
import { api } from "./auth.js";

/**
 * A daily run as the server hands it over. The seed never crosses this line:
 * the client is given the position it has reached, not the means to compute
 * the next one, which is what stops a run being replayed against dice the
 * player has already seen.
 */
export interface DailyRunView {
  state: GameState;
  turns: number;
  totalTurns: number;
  complete: boolean;
}

export interface DailyEntry {
  username: string;
  score: number;
  turns: number;
  bestTurn: number;
  busts: number;
  rank: number;
  you?: boolean;
}

export interface DailyStatus {
  day: string;
  run: DailyResult | null;
  streak: number;
  leaderboard: DailyEntry[];
  yourRank: number | null;
  players: number;
  /**
   * True once a top-ten finish on a CLOSED day is on the record. The server
   * decides this: where you stand on today's board is not the same claim.
   */
  eliteEarned: boolean;
}

export function fetchDaily(): Promise<DailyStatus> {
  return api<DailyStatus>("/api/daily", { auth: true });
}

/** Claim today's run and get the opening position. Idempotent: starting twice
 *  returns the run already in progress. */
export function startDaily(): Promise<DailyRunView> {
  return api<DailyRunView>("/api/daily/start", { method: "POST", body: {}, auth: true });
}

/** Play one move. The server appends it, replays, and returns the new position. */
export function playDailyMove(move: DailyMove): Promise<DailyRunView & { status?: DailyStatus }> {
  return api("/api/daily/move", { method: "POST", body: { move }, auth: true });
}

/** The run left in progress, if any — for picking up where you left off. */
export function resumeDaily(): Promise<{ run: DailyRunView | null }> {
  return api("/api/daily/resume", { auth: true });
}
