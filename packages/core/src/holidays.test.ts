import { describe, expect, it } from "vitest";
import {
  HOLIDAYS,
  challengeDate,
  daysUntilHoliday,
  holidayOfDaily,
  holidayOfWeek,
  holidayOnDate,
  seasonOnDate,
  thanksgivingDay,
  trophyDay,
} from "./holidays.js";
import { weekKey } from "./weekly.js";

const on = (iso: string) => challengeDate(new Date(iso))!;

describe("holiday calendar", () => {
  it("finds Thanksgiving on the fourth Thursday of November", () => {
    expect(thanksgivingDay(2025)).toBe(27);
    expect(thanksgivingDay(2026)).toBe(26);
    expect(thanksgivingDay(2027)).toBe(25);
    expect(thanksgivingDay(2029)).toBe(22);
  });

  it("gives gifts on the day, reading the date in Chicago", () => {
    // 03:00 UTC on Nov 1 is still Halloween evening in Chicago.
    expect(holidayOnDate(on("2026-11-01T03:00:00Z"))).toBe("halloween");
    expect(holidayOnDate(on("2026-11-01T12:00:00Z"))).toBeNull();
    expect(holidayOnDate(on("2026-12-31T18:00:00Z"))).toBe("newyear");
    expect(holidayOnDate(on("2027-01-01T18:00:00Z"))).toBe("newyear");
    expect(holidayOnDate(on("2027-01-02T18:00:00Z"))).toBeNull();
    expect(holidayOnDate(on("2027-02-14T18:00:00Z"))).toBe("valentines");
    expect(holidayOnDate(on("2027-03-17T18:00:00Z"))).toBe("stpatricks");
    expect(holidayOnDate(on("2026-11-26T18:00:00Z"))).toBe("thanksgiving");
    expect(holidayOnDate(on("2026-11-27T18:00:00Z"))).toBeNull();
    expect(holidayOnDate(on("2026-12-25T18:00:00Z"))).toBe("christmas");
    expect(holidayOnDate(on("2026-07-19T18:00:00Z"))).toBe("summer");
  });

  it("decorates for each season without two at once", () => {
    expect(seasonOnDate(on("2026-12-30T18:00:00Z"))).toBe("christmas");
    expect(seasonOnDate(on("2026-12-31T18:00:00Z"))).toBe("newyear");
    expect(seasonOnDate(on("2027-01-05T18:00:00Z"))).toBe("newyear");
    expect(seasonOnDate(on("2027-01-06T18:00:00Z"))).toBeNull();
    expect(seasonOnDate(on("2027-02-01T18:00:00Z"))).toBe("valentines");
    expect(seasonOnDate(on("2027-02-15T18:00:00Z"))).toBeNull();
    expect(seasonOnDate(on("2027-03-17T18:00:00Z"))).toBe("stpatricks");
    expect(seasonOnDate(on("2027-03-18T18:00:00Z"))).toBeNull();
    expect(seasonOnDate(on("2026-11-30T18:00:00Z"))).toBe("thanksgiving");
    expect(seasonOnDate(on("2026-10-01T18:00:00Z"))).toBe("halloween");
    // Every gift day falls inside its own season, so the theme on screen always
    // matches the dice being handed out.
    for (let i = 0; i < 366 * 2; i++) {
      const d = challengeDate(new Date(Date.UTC(2026, 0, 1, 18) + i * 86_400_000))!;
      const gift = holidayOnDate(d);
      if (gift) expect(seasonOnDate(d)).toBe(gift);
    }
  });

  it("names one Daily a year per holiday, and the week around it", () => {
    for (const year of [2026, 2027, 2028]) {
      for (const h of HOLIDAYS) {
        const day = trophyDay(h, year);
        expect(holidayOfDaily(day)).toBe(h);
        const week = weekKey(new Date(`${day}T18:00:00Z`));
        expect(holidayOfWeek(week)).toBe(h);
      }
    }
    expect(trophyDay("summer", 2027)).toBe("2027-07-04");
    expect(trophyDay("newyear", 2027)).toBe("2027-01-01");
    expect(holidayOfDaily("2026-10-30")).toBeNull();
    expect(holidayOfDaily("2026-12-31")).toBeNull();
    expect(holidayOfWeek("2026-10-19")).toBeNull();
    // Christmas and New Year's Day land in neighbouring weeks, never one.
    expect(holidayOfWeek(weekKey(new Date("2026-12-25T18:00:00Z")))).toBe("christmas");
    expect(holidayOfWeek(weekKey(new Date("2027-01-01T18:00:00Z")))).toBe("newyear");
  });

  it("counts calendar days to the next gift day", () => {
    const now = new Date("2026-10-21T18:00:00Z");
    expect(daysUntilHoliday("halloween", now)).toBe(10);
    expect(daysUntilHoliday("thanksgiving", now)).toBe(36);
    expect(daysUntilHoliday("newyear", now)).toBe(71);
    expect(daysUntilHoliday("summer", now)).toBe(223);
    expect(daysUntilHoliday("halloween", new Date("2026-10-31T18:00:00Z"))).toBe(0);
  });
});
