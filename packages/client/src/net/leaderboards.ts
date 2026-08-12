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
