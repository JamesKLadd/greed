import { describe, expect, it } from "vitest";
import { weeklyLobbyNeedsRefresh } from "./weeklyLobbyCalendar.js";

describe("weekly lobby allowance refresh", () => {
  const current = { week: "2026-09-28", day: "2026-10-01", period: "day" as const };

  it("refills at Chicago midnight rather than UTC midnight", () => {
    expect(weeklyLobbyNeedsRefresh(current, false, new Date("2026-10-02T00:00:00Z"))).toBe(false);
    expect(weeklyLobbyNeedsRefresh(current, false, new Date("2026-10-02T04:59:59Z"))).toBe(false);
    expect(weeklyLobbyNeedsRefresh(current, false, new Date("2026-10-02T05:00:00Z"))).toBe(true);
  });

  it("defers a refill while a run's move controller is mounted", () => {
    const midnight = new Date("2026-10-02T05:00:00Z");
    expect(weeklyLobbyNeedsRefresh(current, true, midnight)).toBe(false);
    expect(weeklyLobbyNeedsRefresh(current, false, midnight)).toBe(true);
  });

  it("keeps historic weekly and unlimited allowances intact at daily midnight", () => {
    const nextDay = new Date("2026-09-16T05:00:00Z");
    const historic = { week: "2026-09-14", day: "2026-09-15" };
    expect(weeklyLobbyNeedsRefresh({ ...historic, period: "week" }, false, nextDay)).toBe(false);
    expect(weeklyLobbyNeedsRefresh({ ...historic, period: null }, false, nextDay)).toBe(false);
  });

  it("refreshes every allowance at Monday midnight, once no run is open", () => {
    const monday = new Date("2026-10-05T05:00:00Z");
    for (const period of ["day", "week", null] as const) {
      expect(weeklyLobbyNeedsRefresh({ ...current, period }, false, monday)).toBe(true);
      expect(weeklyLobbyNeedsRefresh({ ...current, period }, true, monday)).toBe(false);
    }
  });

  it("uses the post-DST midnight when the Chicago clock changes", () => {
    const autumn = { week: "2026-10-26", day: "2026-11-01", period: "day" as const };
    expect(weeklyLobbyNeedsRefresh(autumn, false, new Date("2026-11-02T05:59:59Z"))).toBe(false);
    expect(weeklyLobbyNeedsRefresh(autumn, false, new Date("2026-11-02T06:00:00Z"))).toBe(true);
  });
});
