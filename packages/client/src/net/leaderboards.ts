/** Lifetime leaderboards and match history. Both are read-only views the server
 *  derives; the client never posts a standing. */

import { cleanBetaIdentity, type BetaIdentity } from "@greed/protocol";
import { api } from "./auth.js";

export const LEADERBOARD_CATEGORIES = [
  "wins",
  "bestTurn",
  "bestStreak",
  "bestTotal",
  "dailyWins",
  "weeklyWins",
] as const;
export type LeaderboardCategory = (typeof LEADERBOARD_CATEGORIES)[number];

/**
 * The boards built from ONLINE games, as opposed to from challenge runs.
 *
 * The distinction is only a caption — the server ranks each category the same
 * way — but the caption is the one saying which of a player's games counted,
 * and it was wrong for two of the six the moment they were added.
 */
export const ONLINE_CATEGORIES: readonly LeaderboardCategory[] = [
  "wins",
  "bestTurn",
  "bestStreak",
  "bestTotal",
];

export interface LeaderboardEntry {
  username: string;
  avatar: string;
  visualBeta?: BetaIdentity;
  value: number;
  rank: number;
  you?: boolean;
}

export interface LeaderboardView {
  category: LeaderboardCategory;
  entries: LeaderboardEntry[];
  yourRank: number | null;
  yourValue: number | null;
  /** Own equipped portrait and standing, including players outside the top 25. */
  yourEntry?: LeaderboardEntry | null;
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
export async function fetchLeaderboard(category: LeaderboardCategory): Promise<LeaderboardView> {
  const raw = await api<LeaderboardView>(`/api/leaderboard?category=${category}`, { auth: true });
  return {
    ...raw,
    entries: (raw.entries ?? []).map(fillIdentity),
    yourEntry: raw.yourEntry ? fillIdentity(raw.yourEntry) : null,
  };
}

export function fetchMatches(): Promise<{ matches: MatchRecord[] }> {
  return api<{ matches: MatchRecord[] }>("/api/me/matches", { auth: true });
}

/** One run on the all-time daily board. */
export interface DailyBestEntry {
  username: string;
  avatar: string;
  visualBeta?: BetaIdentity;
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
export async function fetchDailyBest(): Promise<DailyBestView> {
  const raw = await api<DailyBestView>("/api/leaderboard/daily", { auth: true });
  return {
    ...raw,
    entries: (raw.entries ?? []).map(fillIdentity),
    yourBest: raw.yourBest ? fillIdentity(raw.yourBest) : null,
    runs: raw.runs ?? 0,
    todayHidden: raw.todayHidden ?? true,
  };
}

/** One player's week on the all-time weekly board. */
export interface WeeklyBestEntry {
  username: string;
  avatar: string;
  visualBeta?: BetaIdentity;
  /** The week's Monday, as YYYY-MM-DD — see formatDay in the screen. */
  week: string;
  score: number;
  rank: number;
  you?: boolean;
}

export interface WeeklyBestView {
  entries: WeeklyBestEntry[];
  yourBest: WeeklyBestEntry | null;
  runs: number;
}

/**
 * The best weekly scores ever posted.
 *
 * No "this week is hidden" flag, unlike the daily board: a week's scores are
 * public while it is being played, so there is nothing here to hold back.
 * `fill` guards the arrays because a server that predates the weekly answers
 * this route with a 404 and the screen must survive it.
 */
export async function fetchWeeklyBest(): Promise<WeeklyBestView> {
  const raw = await api<WeeklyBestView>("/api/leaderboard/weekly", { auth: true });
  return {
    ...raw,
    entries: (raw.entries ?? []).map(fillIdentity),
    yourBest: raw.yourBest ? fillIdentity(raw.yourBest) : null,
    runs: raw.runs ?? 0,
  };
}

/** New clients also receive rows from the older server during deployment. */
function fillIdentity<T extends { avatar: string; visualBeta?: BetaIdentity }>(entry: T): T {
  return {
    ...entry,
    avatar: typeof entry.avatar === "string" ? entry.avatar : "",
    visualBeta: cleanBetaIdentity(entry.visualBeta),
  };
}
