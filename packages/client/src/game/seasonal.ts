/** Seasonal appearance follows the same Chicago calendar as the challenges. */
export type SeasonalTheme = "classic" | "halloween" | "christmas" | "summer";
export type SeasonalPreference = "automatic" | SeasonalTheme;

export const SEASONAL_PREFERENCES = [
  "automatic",
  "classic",
  "halloween",
  "christmas",
  "summer",
] as const satisfies readonly SeasonalPreference[];

const chicagoCalendar = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  month: "numeric",
  day: "numeric",
});

export function isSeasonalPreference(value: unknown): value is SeasonalPreference {
  return SEASONAL_PREFERENCES.some((preference) => preference === value);
}

function isSeasonalTheme(value: unknown): value is SeasonalTheme {
  return value !== "automatic" && isSeasonalPreference(value);
}

export function resolveSeasonalTheme(
  preference: SeasonalPreference,
  date: Date = new Date(),
): SeasonalTheme {
  if (preference !== "automatic") return preference;
  if (!Number.isFinite(date.getTime())) return "classic";
  const parts = chicagoCalendar.formatToParts(date);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  if (month === 10) return "halloween";
  if (month === 12 || (month === 1 && day <= 5)) return "christmas";
  if (month >= 6 && month <= 8) return "summer";
  return "classic";
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
