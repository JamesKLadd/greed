import type { Profile } from "./profile.js";

export type ProgressMetric =
  "games" | "wins" | "bestTurn" | "bestStreak" | "banked" | "hotDice" | "weeklyWins";
export type ProgressHint = "dailyStreak" | "weeklyStreak" | "singleGame";
export type UnlockProgress =
  | { kind: "counter"; metric: ProgressMetric; current: number; target: number }
  | { kind: "hint"; hint: ProgressHint };

type Counter = { field: keyof Profile; metric: ProgressMetric; target: number };
const ACHIEVEMENT_COUNTERS: Record<string, Counter> = {
  "first-win": { field: "wins", metric: "wins", target: 1 },
  "hot-hand": { field: "hotDiceTotal", metric: "hotDice", target: 1 },
  "big-turn": { field: "bestTurn", metric: "bestTurn", target: 1000 },
  "hat-trick": { field: "bestStreak", metric: "bestStreak", target: 3 },
  veteran: { field: "gamesPlayed", metric: "games", target: 10 },
  moonshot: { field: "bestTurn", metric: "bestTurn", target: 1500 },
  "on-fire": { field: "bestStreak", metric: "bestStreak", target: 5 },
  dedicated: { field: "gamesPlayed", metric: "games", target: 25 },
  champion: { field: "wins", metric: "wins", target: 25 },
  "big-banker": { field: "totalBankedPoints", metric: "banked", target: 25000 },
  "tidal-wave": { field: "bestTurn", metric: "bestTurn", target: 2500 },
  unstoppable: { field: "bestStreak", metric: "bestStreak", target: 10 },
  "weekly-champion": { field: "weeklyWins", metric: "weeklyWins", target: 1 },
};
const SINGLE_GAME_FEATS = new Set([
  "flawless",
  "high-roller",
  "giant-slayer",
  "inferno",
  "landslide",
  "full-table",
  "marathon",
  "untouchable",
  "comeback",
  "chain-reaction",
  "blitz",
]);
const COSMETIC_ACHIEVEMENTS: Record<string, string> = {
  crimson: "first-win",
  obsidian: "veteran",
  gold: "high-roller",
  neon: "big-turn",
  emerald: "dedicated",
  amethyst: "on-fire",
  "rose-gold": "champion",
  molten: "moonshot",
  aurora: "comeback",
  platinum: "unstoppable",
  sunrise: "daily-streak-3",
  comet: "daily-streak-10",
  eclipse: "daily-streak-20",
  laurel: "daily-elite",
  regalia: "weekly-champion",
  keystone: "weekly-streak-8",
  "crimson-felt": "flawless",
  royal: "hat-trick",
  sunset: "landslide",
  "emerald-felt": "marathon",
  sand: "full-table",
  "obsidian-felt": "untouchable",
  rosewood: "big-banker",
  ocean: "chain-reaction",
  daybreak: "daily-streak-5",
  frost: "blitz",
  longhall: "weekly-elite",
  lion: "first-win",
  octopus: "hot-hand",
  dragon: "giant-slayer",
  unicorn: "flawless",
  wolf: "hat-trick",
  tiger: "veteran",
  whale: "moonshot",
  crown: "champion",
  shark: "tidal-wave",
  peacock: "unstoppable",
  falcon: "weekly-streak-2",
  stag: "weekly-streak-4",
};
const DIRECT_COUNTERS: Record<string, Counter> = {
  sapphire: { field: "wins", metric: "wins", target: 10 },
  slate: { field: "gamesPlayed", metric: "games", target: 5 },
  midnight: { field: "wins", metric: "wins", target: 5 },
};

function counterProgress(counter: Counter, profile: Profile): UnlockProgress {
  const value = profile[counter.field];
  const current = typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
  return { kind: "counter", metric: counter.metric, current, target: counter.target };
}

/**
 * Preview information only: unlock/award predicates remain authoritative.
 * The profile stores career counters, but not per-game feat records or exact
 * challenge streaks. Never turn lifetime hot dice into a single-turn streak,
 * or the last earned streak badge into a made-up current streak.
 */
export function achievementUnlockProgress(id: string, profile: Profile): UnlockProgress | null {
  if (profile.achievements.includes(id)) return null;
  const counter = ACHIEVEMENT_COUNTERS[id];
  if (counter) {
    const progress = counterProgress(counter, profile);
    // Challenge turns also raise bestTurn without granting solo-game badges;
    // a career stat alone must not promise that a locked reward is complete.
    if (progress.kind === "counter" && progress.current >= progress.target) return null;
    return progress;
  }
  if (id.startsWith("daily-streak-")) return { kind: "hint", hint: "dailyStreak" };
  if (id.startsWith("weekly-streak-")) return { kind: "hint", hint: "weeklyStreak" };
  // bestTotal only records standard-goal games, while these achievements can
  // also be earned at other goals. It cannot supply their exact progress.
  if (SINGLE_GAME_FEATS.has(id)) return { kind: "hint", hint: "singleGame" };
  return null;
}

export function cosmeticUnlockProgress(id: string, profile: Profile): UnlockProgress | null {
  const direct = DIRECT_COUNTERS[id];
  if (direct) return counterProgress(direct, profile);
  const achievement = COSMETIC_ACHIEVEMENTS[id];
  return achievement ? achievementUnlockProgress(achievement, profile) : null;
}
