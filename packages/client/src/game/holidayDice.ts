import { awardAchievement, type Achievement } from "./profile.js";
import { chicagoDate, resolveSeasonalTheme } from "./seasonal.js";

/**
 * The holiday dice: the only rewards in the game earned by WHEN you play rather
 * than how well.
 *
 * Finish any game or challenge run on the day and the badge is yours, and the
 * dice with it. Halloween and Christmas are a single day each, which is what
 * makes their dice the rarest thing in the locker — miss the day and the next
 * chance is a year away. Summer is the whole Boardwalk Club season instead, the
 * same June–August the summer theme decorates the table for.
 *
 * Read on the Chicago calendar like everything else dated in the game, from the
 * device's clock. The badge grants nothing but looks, so it is held to the same
 * standard as every other achievement — the profile is the player's own record
 * — rather than to the server-owned rules that guard rankings.
 */
export type Holiday = "halloween" | "christmas" | "summer";

export interface HolidayDice {
  holiday: Holiday;
  /** The badge that records having played on the day. */
  achievement: string;
  /** The dice skin that badge unlocks. */
  dice: string;
}

export const HOLIDAY_DICE: readonly HolidayDice[] = [
  { holiday: "halloween", achievement: "trick-or-treat", dice: "pumpkin" },
  { holiday: "christmas", achievement: "deck-the-halls", dice: "ornament" },
  { holiday: "summer", achievement: "beach-day", dice: "beach-ball" },
];

/** The holiday a moment falls on, if any. */
export function holidayOn(date: Date): Holiday | null {
  const today = chicagoDate(date);
  if (!today) return null;
  if (today.month === 10 && today.day === 31) return "halloween";
  if (today.month === 12 && today.day === 25) return "christmas";
  // Defined by the theme rather than restated, so the two can never disagree
  // about whether it is summer.
  if (resolveSeasonalTheme("automatic", date) === "summer") return "summer";
  return null;
}

/** Where each holiday next begins, as a Chicago month and day. */
const OPENS: Record<Holiday, { month: number; day: number }> = {
  halloween: { month: 10, day: 31 },
  christmas: { month: 12, day: 25 },
  summer: { month: 6, day: 1 },
};

/**
 * Whole Chicago days until the holiday is next on (0 while it is on now).
 *
 * Counted on calendar dates rather than elapsed milliseconds, so the answer
 * changes at midnight and a daylight-saving change cannot make it skip a day.
 */
export function daysUntilHoliday(holiday: Holiday, date: Date = new Date()): number | null {
  if (holidayOn(date) === holiday) return 0;
  const today = chicagoDate(date);
  if (!today) return null;
  const start = Date.UTC(today.year, today.month - 1, today.day);
  const { month, day } = OPENS[holiday];
  let next = Date.UTC(today.year, month - 1, day);
  if (next <= start) next = Date.UTC(today.year + 1, month - 1, day);
  return Math.round((next - start) / 86_400_000);
}

/** The holiday dice that unlock with a given badge, if it is one of theirs. */
export function holidayForAchievement(id: string): HolidayDice | undefined {
  return HOLIDAY_DICE.find((h) => h.achievement === id);
}

/** The holiday dice entry for a dice skin, if it is one of them. */
export function holidayForDice(id: string): HolidayDice | undefined {
  return HOLIDAY_DICE.find((h) => h.dice === id);
}

/** Window event announcing newly earned holiday dice; `detail` is the badge id. */
export const HOLIDAY_GIFT_EVENT = "greed:holiday-gift";

/**
 * Grant today's holiday badge, if today is one — called when a player signs in
 * and whenever a game or challenge run finishes.
 *
 * Returns the badge when it is newly earned, so the caller can record it, and
 * null on any ordinary day or when it was already held. A new one is also
 * announced app-wide, because the dice are the news and the badge alone does
 * not say so: the app answers with the holiday popup (HolidayGift.tsx).
 */
export function claimHolidayDice(date: Date = new Date()): Achievement | null {
  const holiday = holidayOn(date);
  const entry = HOLIDAY_DICE.find((h) => h.holiday === holiday);
  const earned = entry ? awardAchievement(entry.achievement) : null;
  if (earned && typeof window !== "undefined" && typeof CustomEvent !== "undefined") {
    window.dispatchEvent(new CustomEvent(HOLIDAY_GIFT_EVENT, { detail: earned.id }));
  }
  return earned;
}
