import { HOLIDAYS, challengeDate, seasonOnDate, type Holiday } from "@greed/core";

/** Seasonal appearance follows the same Chicago calendar as the challenges. */
export type SeasonalTheme = "classic" | Holiday;
export type SeasonalPreference = "automatic" | SeasonalTheme;

export const SEASONAL_PREFERENCES = [
  "automatic",
  "classic",
  ...HOLIDAYS,
] as const satisfies readonly SeasonalPreference[];

export function isSeasonalPreference(value: unknown): value is SeasonalPreference {
  return SEASONAL_PREFERENCES.some((preference) => preference === value);
}

function isSeasonalTheme(value: unknown): value is SeasonalTheme {
  return value !== "automatic" && isSeasonalPreference(value);
}

/**
 * The calendar date it is in Chicago (month 1-12), or null for an invalid date.
 *
 * Shared with the holiday sets, so "it's Halloween" means the same instant to
 * the table's decorations and to the pumpkin dice they promise.
 */
export function chicagoDate(date: Date): { year: number; month: number; day: number } | null {
  return challengeDate(date);
}

/** Each holiday's decorations go up for a stretch before it: see core/holidays.ts. */
export function resolveSeasonalTheme(
  preference: SeasonalPreference,
  date: Date = new Date(),
): SeasonalTheme {
  if (preference !== "automatic") return preference;
  const today = challengeDate(date);
  return (today && seasonOnDate(today)) ?? "classic";
}

let preference: SeasonalPreference = "automatic";
let game: { owner: object; identity: unknown; theme: SeasonalTheme } | null = null;

/** Share images use the appearance on screen, including a match's pinned season. */
export function currentSeasonalTheme(): SeasonalTheme {
  const active =
    typeof document === "undefined" ? undefined : document.documentElement.dataset.season;
  return isSeasonalTheme(active) ? active : (game?.theme ?? resolveSeasonalTheme(preference));
}

export function refreshSeasonalTheme(date: Date = new Date()): SeasonalTheme {
  const theme = game?.theme ?? resolveSeasonalTheme(preference, date);
  if (typeof document !== "undefined") document.documentElement.dataset.season = theme;
  return theme;
}

/** Live settings changes still respect a game that spans a calendar boundary. */
export function applySeasonalPreference(
  next: SeasonalPreference,
  date: Date = new Date(),
): SeasonalTheme {
  preference = next;
  return refreshSeasonalTheme(date);
}

/** Every actual match/run gets a fresh appearance, including in-place restarts. */
export function pinSeasonalGame(owner: object, identity: unknown, date: Date = new Date()): void {
  if (owner !== game?.owner || identity !== game.identity) {
    game = { owner, identity, theme: resolveSeasonalTheme(preference, date) };
  }
  refreshSeasonalTheme(date);
}

/** A stale screen cleanup must never release the game that replaced it. */
export function releaseSeasonalGame(owner: object, date: Date = new Date()): void {
  if (game?.owner !== owner) return;
  game = null;
  refreshSeasonalTheme(date);
}
