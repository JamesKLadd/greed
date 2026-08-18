/** Lifetime leaderboards and match history. Both are read-only views the server
 *  derives; the client never posts a standing. */

import { api } from "./auth.js";

export const LEADERBOARD_CATEGORIES = ["wins", "bestTurn", "bestStreak", "bestTotal"] as const;
export type LeaderboardCategory = (typeof LEADERBOARD_CATEGORIES)[number];

export interface LeaderboardEntry {
  username: string;
  value: number;
  rank: number;
  you?: boolean;
}

export interface LeaderboardView {
  category: LeaderboardCategory;
  entries: LeaderboardEntry[];
  yourRank: number | null;
  yourValue: number | null;
  players: number;
}

export interface MatchRecord {
  playedAt: string;
  won: boolean;
  score: number;
  goal: number;
  players: number;
  team: number | null;
  opponents: string[];
}

/** Boards are public — a signed-out visitor sees them, just without their own rank. */
export function fetchLeaderboard(category: LeaderboardCategory): Promise<LeaderboardView> {
  return api<LeaderboardView>(`/api/leaderboard?category=${category}`, { auth: true });
}

export function fetchMatches(): Promise<{ matches: MatchRecord[] }> {
  return api<{ matches: MatchRecord[] }>("/api/me/matches", { auth: true });
}

/** One run on the all-time daily board. */
export interface DailyBestEntry {
  username: string;
  /** YYYY-MM-DD. A plain date, not an instant — see formatDay in the screen. */
  day: string;
  score: number;
  rank: number;
  you?: boolean;
}

export interface DailyBestView {
  entries: DailyBestEntry[];
  yourBest: DailyBestEntry | null;
  runs: number;
  /** True when today's runs are being held back until you've played today. */
  todayHidden: boolean;
}

/** The best daily runs ever played. Public, like the other boards. */
export function fetchDailyBest(): Promise<DailyBestView> {
  return api<DailyBestView>("/api/leaderboard/daily", { auth: true });
}
