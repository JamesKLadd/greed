/**
 * Advent calendar progress as it travels with a profile: doors opened per
 * December, keyed by year ("2026" → 12). Shared so the device and the account
 * clean and merge it by the one rule — the higher count per year, so a second
 * device can never close a door the first one opened.
 */
export const ADVENT_DOOR_COUNT = 24;
/** Years kept: enough to remember a decade of Decembers, bounded all the same. */
const ADVENT_YEARS_KEPT = 10;

export type AdventProgress = Record<string, number>;

/** Whole numbers 0-24 under four-digit year keys, the most recent ten years. */
export function cleanAdventProgress(raw: unknown): AdventProgress {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const kept = Object.entries(raw as Record<string, unknown>)
    .filter(
      (entry): entry is [string, number] =>
        /^\d{4}$/.test(entry[0]) && typeof entry[1] === "number" && Number.isFinite(entry[1]),
    )
    .map(([year, n]) => [year, Math.min(ADVENT_DOOR_COUNT, Math.max(0, Math.round(n)))] as const)
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .slice(0, ADVENT_YEARS_KEPT);
  return Object.fromEntries(kept);
}

/** Two copies of the calendar: the higher count per year. */
export function mergeAdventProgress(a: unknown, b: unknown): AdventProgress {
  const out: AdventProgress = { ...cleanAdventProgress(a) };
  for (const [year, n] of Object.entries(cleanAdventProgress(b))) {
    out[year] = Math.max(out[year] ?? 0, n);
  }
  return cleanAdventProgress(out);
}
