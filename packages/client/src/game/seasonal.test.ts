import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applySeasonalPreference,
  currentSeasonalTheme,
  isSeasonalPreference,
  refreshSeasonalTheme,
  resolveSeasonalTheme,
  pinSeasonalGame,
  releaseSeasonalGame,
  type SeasonalPreference,
} from "./seasonal.js";

let owners: object[];
function owner() {
  const next = {};
  owners.push(next);
  return next;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-15T17:00:00Z"));
  vi.stubGlobal("document", { documentElement: { dataset: {} } });
  owners = [];
  applySeasonalPreference("automatic");
});

afterEach(() => {
  for (const current of owners) releaseSeasonalGame(current);
  applySeasonalPreference("automatic");
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Chicago seasonal calendar", () => {
  it.each([
    ["2026-06-01T04:59:59.999Z", "classic"],
    ["2026-06-01T05:00:00.000Z", "summer"],
    ["2026-09-01T04:59:59.999Z", "summer"],
    ["2026-09-01T05:00:00.000Z", "classic"],
    ["2026-10-01T04:59:59.999Z", "classic"],
    ["2026-10-01T05:00:00.000Z", "halloween"],
    ["2026-11-01T04:59:59.999Z", "halloween"],
    // Halloween hands over to Thanksgiving, which runs to Christmas.
    ["2026-11-01T05:00:00.000Z", "thanksgiving"],
    ["2026-12-01T05:59:59.999Z", "thanksgiving"],
    ["2026-12-01T06:00:00.000Z", "christmas"],
    // New Year's takes the last night of December and the first days of January.
    ["2026-12-31T05:59:59.999Z", "christmas"],
    ["2026-12-31T06:00:00.000Z", "newyear"],
    ["2027-01-01T06:00:00.000Z", "newyear"],
    ["2027-01-06T05:59:59.999Z", "newyear"],
    ["2027-01-06T06:00:00.000Z", "classic"],
    ["2027-02-01T06:00:00.000Z", "valentines"],
    ["2027-02-15T05:59:59.999Z", "valentines"],
    ["2027-02-15T06:00:00.000Z", "classic"],
    ["2027-03-01T06:00:00.000Z", "stpatricks"],
    ["2027-03-18T04:59:59.999Z", "stpatricks"],
    ["2027-03-18T05:00:00.000Z", "classic"],
    ["2028-02-29T12:00:00.000Z", "classic"],
    ["2028-06-01T05:00:00.000Z", "summer"],
  ])("resolves %s to %s", (instant, expected) => {
    expect(resolveSeasonalTheme("automatic", new Date(instant))).toBe(expected);
  });

  it.each([
    "classic",
    "halloween",
    "christmas",
    "summer",
    "newyear",
    "valentines",
    "stpatricks",
    "thanksgiving",
  ] as const)("allows %s throughout the year", (preference) => {
    expect(resolveSeasonalTheme(preference, new Date("2027-03-10T00:00:00Z"))).toBe(preference);
  });

  it("refuses damaged saved values and handles invalid dates safely", () => {
    for (const value of [undefined, null, "winter", "Automatic", {}, 1]) {
      expect(isSeasonalPreference(value)).toBe(false);
    }
    expect(isSeasonalPreference("automatic")).toBe(true);
    expect(resolveSeasonalTheme("automatic", new Date(NaN))).toBe("classic");
  });
});

describe("appearance during a game", () => {
  it.each(["local", "online", "daily", "weekly", "practice"])(
    "keeps %s stable through midnight and refreshes on return to menus",
    (mode) => {
      vi.setSystemTime(new Date("2026-11-01T04:59:00Z"));
      const current = owner();
      pinSeasonalGame(current, mode);
      vi.setSystemTime(new Date("2026-11-01T05:01:00Z"));
      expect(refreshSeasonalTheme()).toBe("halloween");
      expect(currentSeasonalTheme()).toBe("halloween");
      releaseSeasonalGame(current);
      expect(currentSeasonalTheme()).toBe("thanksgiving");
    },
  );

  it("starts a different game with the current season and ignores stale cleanup", () => {
    const daily = owner();
    const weekly = owner();
    pinSeasonalGame(daily, "daily");
    vi.setSystemTime(new Date("2026-12-02T12:00:00Z"));
    pinSeasonalGame(weekly, "weekly");
    releaseSeasonalGame(daily);
    vi.setSystemTime(new Date("2027-02-20T12:00:00Z"));
    expect(refreshSeasonalTheme()).toBe("christmas");
    expect(currentSeasonalTheme()).toBe("christmas");
    releaseSeasonalGame(weekly);
    expect(currentSeasonalTheme()).toBe("classic");
  });

  it("queues a manual preference while pinned, then applies it in menus", () => {
    const current = owner();
    pinSeasonalGame(current, "online");
    applySeasonalPreference("summer");
    expect(currentSeasonalTheme()).toBe("halloween");
    releaseSeasonalGame(current);
    expect(currentSeasonalTheme()).toBe("summer");
  });

  it("refreshes an in-place restart while repeated updates keep the same game pinned", () => {
    const current = owner();
    const firstMatch = {};
    pinSeasonalGame(current, firstMatch);
    vi.setSystemTime(new Date("2026-11-01T05:01:00Z"));
    pinSeasonalGame(current, firstMatch);
    expect(currentSeasonalTheme()).toBe("halloween");
    pinSeasonalGame(current, {});
    expect(currentSeasonalTheme()).toBe("thanksgiving");
  });

  it("uses the actual document appearance for shared cards", () => {
    document.documentElement.dataset.season = "christmas";
    expect(currentSeasonalTheme()).toBe("christmas");
    document.documentElement.dataset.season = "damaged";
    expect(currentSeasonalTheme()).toBe("halloween");
  });

  it("refreshes automatic themes in menus and works without a document", () => {
    vi.setSystemTime(new Date("2026-12-02T12:00:00Z"));
    expect(refreshSeasonalTheme()).toBe("christmas");
    vi.stubGlobal("document", undefined);
    expect(currentSeasonalTheme()).toBe("christmas");
    expect(() => applySeasonalPreference("classic" as SeasonalPreference)).not.toThrow();
    expect(currentSeasonalTheme()).toBe("classic");
  });
});
