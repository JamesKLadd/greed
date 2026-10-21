import {
  challengeDate,
  daysUntilHoliday as daysUntil,
  holidayOnDate,
  type Holiday,
} from "@greed/core";
import { awardAchievement, type Achievement } from "./profile.js";

export type { Holiday };

/**
 * The holiday sets: the only rewards in the game earned by WHEN you play rather
 * than how well.
 *
 * Finish any game or challenge run on the day — or just sign in — and the badge
 * is yours, and the whole set with it: shaped dice, a face for the Classic
 * seat, a hat for every character in the new look, and a felt. Most holidays
 * are a single day (New Year's is the Eve and the Day), which is what makes
 * their sets the rarest things in the locker — miss the day and the next
 * chance is a year away. Summer is the whole Boardwalk Club season instead.
 *
 * Every piece is gated on the BADGE, not on a piece of its own, so a player who
 * earned a holiday before a piece existed simply has it: the pumpkin dice came
 * first, and the witch's hat that joined them later is already theirs.
 *
 * Read on the Chicago calendar (core/holidays.ts) like everything else dated in
 * the game, from the device's clock. The badge grants nothing but looks, so it
 * is held to the same standard as every other achievement — the profile is the
 * player's own record — rather than to the server-owned rules that guard
 * rankings. The TROPHY is the exception: who won a holiday's Daily or Weekly is
 * the server's to say (accounts.ts), and it is what unlocks the gold dice.
 */
export interface HolidaySet {
  holiday: Holiday;
  /** The badge that records having played on the day. */
  achievement: string;
  /** The shaped dice skin that badge unlocks. */
  dice: string;
  /** The Classic seat's face. */
  avatar: string;
  /** The felt. */
  table: string;
  /** The hat every character can wear in the new look. */
  hat: string;
  /** The badge for winning the holiday's Daily or Weekly. */
  trophy: string;
  /** The gold dice only a trophy unlocks. */
  goldDice: string;
}

/** In calendar order. */
export const HOLIDAY_SETS: readonly HolidaySet[] = [
  {
    holiday: "newyear",
    achievement: "happy-new-year",
    dice: "disco-ball",
    avatar: "party-face",
    table: "confetti-felt",
    hat: "party-hat",
    trophy: "newyear-champion",
    goldDice: "gold-disco-ball",
  },
  {
    holiday: "valentines",
    achievement: "be-mine",
    dice: "candy-heart",
    avatar: "cupid",
    table: "sweetheart-felt",
    hat: "heart-boppers",
    trophy: "valentines-champion",
    goldDice: "gold-heart",
  },
  {
    holiday: "stpatricks",
    achievement: "luck-of-the-irish",
    dice: "pot-of-gold",
    avatar: "four-leaf",
    table: "clover-felt",
    hat: "leprechaun-hat",
    trophy: "stpatricks-champion",
    goldDice: "gold-pot",
  },
  {
    holiday: "summer",
    achievement: "beach-day",
    dice: "beach-ball",
    avatar: "sunglasses",
    table: "beach-towel-felt",
    hat: "sun-hat",
    trophy: "summer-champion",
    goldDice: "gold-beach-ball",
  },
  {
    holiday: "halloween",
    achievement: "trick-or-treat",
    dice: "pumpkin",
    avatar: "jack-o-lantern",
    table: "haunted-felt",
    hat: "witch-hat",
    trophy: "halloween-champion",
    goldDice: "gold-pumpkin",
  },
  {
    holiday: "thanksgiving",
    achievement: "gobble-gobble",
    dice: "acorn",
    avatar: "turkey",
    table: "harvest-felt",
    hat: "pilgrim-hat",
    trophy: "thanksgiving-champion",
    goldDice: "gold-acorn",
  },
  {
    holiday: "christmas",
    achievement: "deck-the-halls",
    dice: "ornament",
    avatar: "santa",
    table: "tartan-felt",
    hat: "santa-hat",
    trophy: "christmas-champion",
    goldDice: "gold-ornament",
  },
];

/** The holiday whose gifts can be earned at a moment, if any. */
export function holidayOn(date: Date): Holiday | null {
  const today = challengeDate(date);
  return today ? holidayOnDate(today) : null;
}

/** Whole Chicago days until a holiday's gifts can next be earned (0 while they can). */
export function daysUntilHoliday(holiday: Holiday, date: Date = new Date()): number | null {
  return daysUntil(holiday, date);
}

export function holidaySet(holiday: Holiday): HolidaySet {
  return HOLIDAY_SETS.find((h) => h.holiday === holiday)!;
}

/** The holiday set a badge belongs to — its play-on-the-day badge, not its trophy. */
export function holidayForAchievement(id: string): HolidaySet | undefined {
  return HOLIDAY_SETS.find((h) => h.achievement === id);
}

/** The holiday set a trophy belongs to. */
export function holidayForTrophy(id: string): HolidaySet | undefined {
  return HOLIDAY_SETS.find((h) => h.trophy === id);
}

/** The holiday set a dice skin belongs to, gold or not. */
export function holidayForDice(id: string): HolidaySet | undefined {
  return HOLIDAY_SETS.find((h) => h.dice === id || h.goldDice === id);
}

/** Every holiday piece a badge (or trophy) unlocks, by kind, for the locker. */
export function holidayUnlocker(id: string): string | undefined {
  for (const h of HOLIDAY_SETS) {
    if ([h.dice, h.avatar, h.table, h.hat].includes(id)) return h.achievement;
    if (h.goldDice === id) return h.trophy;
  }
  return undefined;
}

/**
 * Window event announcing a newly earned holiday badge or trophy; `detail` is
 * its id. The app answers with the holiday popup (HolidayGift.tsx).
 */
export const HOLIDAY_GIFT_EVENT = "greed:holiday-gift";

export function announceHolidayGift(id: string): void {
  if (typeof window !== "undefined" && typeof CustomEvent !== "undefined") {
    window.dispatchEvent(new CustomEvent(HOLIDAY_GIFT_EVENT, { detail: id }));
  }
}

/**
 * Grant today's holiday badge, if today is one — called when a player signs in
 * and whenever a game or challenge run finishes.
 *
 * Returns the badge when it is newly earned, so the caller can record it, and
 * null on any ordinary day or when it was already held. A new one is also
 * announced app-wide, because the set is the news and the badge alone does not
 * say so.
 */
export function claimHolidayDice(date: Date = new Date()): Achievement | null {
  const holiday = holidayOn(date);
  const entry = HOLIDAY_SETS.find((h) => h.holiday === holiday);
  const earned = entry ? awardAchievement(entry.achievement) : null;
  if (earned) announceHolidayGift(earned.id);
  return earned;
}
