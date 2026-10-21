import { beforeEach, describe, expect, it } from "vitest";
import {
  HOLIDAY_DICE,
  claimHolidayDice,
  daysUntilHoliday,
  holidayOn,
  type Holiday,
} from "./holidayDice.js";
import { ACHIEVEMENTS, loadProfile } from "./profile.js";
import { DICE_SKINS, isUnlocked } from "./cosmetics.js";
import { resolveSeasonalTheme } from "./seasonal.js";
import { cosmeticUnlockProgress } from "./unlockProgress.js";

class MemStore {
  private store = new Map<string, string>();
  getItem(k: string) {
    return this.store.has(k) ? this.store.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.store.set(k, String(v));
  }
  removeItem(k: string) {
    this.store.delete(k);
  }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemStore }).localStorage = new MemStore();
});

describe("holiday calendar (America/Chicago)", () => {
  it.each([
    // Halloween is the one day, in Chicago: 05:00Z is local midnight in October.
    ["2026-10-31T04:59:59.999Z", null],
    ["2026-10-31T05:00:00.000Z", "halloween"],
    ["2026-11-01T04:59:59.999Z", "halloween"],
    ["2026-11-01T05:00:00.000Z", null],
    // Christmas Day: 06:00Z is local midnight in December.
    ["2026-12-25T05:59:59.999Z", null],
    ["2026-12-25T06:00:00.000Z", "christmas"],
    ["2026-12-26T05:59:59.999Z", "christmas"],
    ["2026-12-26T06:00:00.000Z", null],
    // Summer is the whole Boardwalk Club season.
    ["2026-06-01T04:59:59.999Z", null],
    ["2026-06-01T05:00:00.000Z", "summer"],
    ["2026-07-15T17:00:00.000Z", "summer"],
    ["2026-09-01T04:59:59.999Z", "summer"],
    ["2026-09-01T05:00:00.000Z", null],
    // The rest of the Halloween and Christmas seasons are themed, but are not
    // the holiday itself.
    ["2026-10-30T17:00:00.000Z", null],
    ["2026-12-24T18:00:00.000Z", null],
    ["2027-01-01T18:00:00.000Z", null],
  ] as const)("%s → %s", (iso, holiday) => {
    expect(holidayOn(new Date(iso))).toBe(holiday);
  });

  it("summer is exactly the summer theme's dates", () => {
    for (let day = 0; day < 366; day += 1) {
      const date = new Date(Date.UTC(2026, 0, 1, 18) + day * 86_400_000);
      expect(holidayOn(date) === "summer", date.toISOString()).toBe(
        resolveSeasonalTheme("automatic", date) === "summer",
      );
    }
  });

  it("an invalid clock is never a holiday", () => {
    expect(holidayOn(new Date(Number.NaN))).toBeNull();
    expect(daysUntilHoliday("halloween", new Date(Number.NaN))).toBeNull();
  });
});

describe("daysUntilHoliday", () => {
  it.each([
    ["halloween", "2026-10-21T17:00:00Z", 10],
    ["halloween", "2026-10-30T23:00:00Z", 1],
    ["halloween", "2026-10-31T23:00:00Z", 0],
    // Just after it ends in Chicago, a whole year to wait (2027 is no leap year).
    ["halloween", "2026-11-01T05:30:00Z", 364],
    ["christmas", "2026-12-24T12:00:00Z", 1],
    ["christmas", "2026-12-25T12:00:00Z", 0],
    ["christmas", "2026-12-26T12:00:00Z", 364],
    ["summer", "2026-07-04T17:00:00Z", 0],
    ["summer", "2026-05-31T17:00:00Z", 1],
    ["summer", "2026-09-01T17:00:00Z", 273],
  ] as const)("%s from %s is %i days", (holiday, iso, days) => {
    expect(daysUntilHoliday(holiday as Holiday, new Date(iso))).toBe(days);
  });

  it("counts calendar days across a daylight-saving change", () => {
    // Chicago falls back on 1 November 2026; Christmas is still 30 dates away
    // from 25 November whatever the clocks did in between.
    expect(daysUntilHoliday("christmas", new Date("2026-11-25T23:30:00Z"))).toBe(30);
  });
});

describe("claimHolidayDice", () => {
  it("grants the day's badge once, which unlocks its dice", () => {
    const halloween = new Date("2026-10-31T20:00:00Z");
    const pumpkin = DICE_SKINS.find((c) => c.id === "pumpkin")!;
    expect(isUnlocked(pumpkin, loadProfile())).toBe(false);

    expect(claimHolidayDice(halloween)?.id).toBe("trick-or-treat");
    expect(isUnlocked(pumpkin, loadProfile())).toBe(true);
    // Already held: nothing new to celebrate.
    expect(claimHolidayDice(halloween)).toBeNull();
  });

  it("grants nothing on an ordinary day", () => {
    expect(claimHolidayDice(new Date("2026-10-21T17:00:00Z"))).toBeNull();
    expect(loadProfile().achievements).toEqual([]);
  });

  it.each([
    ["2026-12-25T18:00:00Z", "deck-the-halls", "ornament"],
    ["2026-08-15T18:00:00Z", "beach-day", "beach-ball"],
  ] as const)("on %s grants %s for the %s dice", (iso, badge, dice) => {
    expect(claimHolidayDice(new Date(iso))?.id).toBe(badge);
    expect(
      isUnlocked(
        DICE_SKINS.find((c) => c.id === dice)!,
        loadProfile(),
      ),
    ).toBe(true);
  });
});

describe("holiday rewards are wired end to end", () => {
  it("every holiday names a real badge and a real shaped skin", () => {
    for (const h of HOLIDAY_DICE) {
      expect(
        ACHIEVEMENTS.some((a) => a.id === h.achievement),
        h.achievement,
      ).toBe(true);
      const skin = DICE_SKINS.find((c) => c.id === h.dice);
      expect(skin?.shape, h.dice).toBeDefined();
      expect(skin!.shape).not.toBe("cube");
      // The skin is gated on exactly its holiday's badge.
      expect(isUnlocked(skin!, { ...loadProfile(), achievements: [] })).toBe(false);
      expect(isUnlocked(skin!, { ...loadProfile(), achievements: [h.achievement] })).toBe(true);
    }
  });

  it("the locker counts down to the day instead of showing a counter", () => {
    const profile = loadProfile();
    expect(cosmeticUnlockProgress("pumpkin", profile, new Date("2026-10-21T17:00:00Z"))).toEqual({
      kind: "holiday",
      daysAway: 10,
    });
    expect(cosmeticUnlockProgress("ornament", profile, new Date("2026-12-25T17:00:00Z"))).toEqual({
      kind: "holiday",
      daysAway: 0,
    });
    const earned = { ...profile, achievements: ["beach-day"] };
    expect(cosmeticUnlockProgress("beach-ball", earned)).toBeNull();
  });
});
