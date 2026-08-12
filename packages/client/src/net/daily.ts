/** Daily challenge API. Scores come back from the server, which derives them by
 *  replaying the submitted moves — the client never reports a score. */

import type { DailyMove, DailyResult } from "@greed/core";
import { api } from "./auth.js";

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
  /** Someone matched your score and you have not played your tiebreak turn yet. */
  tiedUnresolved: boolean;
  /** Your shootout result, once played. */
  tiebreak: number | null;
}

export function fetchDaily(): Promise<DailyStatus> {
  return api<DailyStatus>("/api/daily", { auth: true });
}

export function submitDaily(
  moves: DailyMove[],
): Promise<{ result: DailyResult; alreadyPlayed: boolean; status: DailyStatus }> {
  return api("/api/daily/run", { method: "POST", body: { moves }, auth: true });
}

export function submitShootout(
  moves: DailyMove[],
): Promise<{ tiebreak: number; alreadyPlayed: boolean; status: DailyStatus }> {
  return api("/api/daily/shootout", { method: "POST", body: { moves }, auth: true });
}
