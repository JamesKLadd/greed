import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let local: Map<string, string>;
let session: Map<string, string>;
const storage = (values: Map<string, string>) => ({
  getItem: (k: string) => values.get(k) ?? null,
  setItem: (k: string, v: string) => values.set(k, v),
  removeItem: (k: string) => values.delete(k),
});
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubEnv("PROD", true);
  vi.stubEnv("DEV", false);
  vi.stubEnv("VITE_SERVER_URL", "wss://example.test");
  local = new Map();
  session = new Map();
  vi.stubGlobal("localStorage", storage(local));
  vi.stubGlobal("sessionStorage", storage(session));
  vi.stubGlobal("navigator", { doNotTrack: null });
  vi.stubGlobal("location", { hostname: "example.test" });
  vi.stubGlobal("window", {
    location: { search: "?source=landing&utm_campaign=daily" },
    setTimeout,
    clearTimeout,
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("first-party usage choices", () => {
  it("sends welcome actions before navigation without waiting for the batch timer", async () => {
    const { recordGrowthEvent, flushGrowthEvents } = await import("./growth.js");
    recordGrowthEvent("landing_viewed");
    recordGrowthEvent("landing_practice_selected");
    flushGrowthEvents();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string).events.map(
        (r: { event: string }) => r.event,
      ),
    ).toEqual(["landing_viewed", "landing_practice_selected"]);
    vi.advanceTimersByTime(2000);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("keeps the welcome campaign and session through practice and the account step", async () => {
    const location = { pathname: "/welcome/", search: "?utm_campaign=bank_or_roll" };
    vi.stubGlobal("window", { location, setTimeout, clearTimeout });
    const { recordGrowthEvent } = await import("./growth.js");
    recordGrowthEvent("landing_viewed");
    recordGrowthEvent("landing_practice_selected");
    location.pathname = "/";
    location.search = "?practice=1&source=landing&utm_campaign=bank_or_roll";
    recordGrowthEvent("practice_started");
    location.search = "?challenge=daily&source=landing&utm_campaign=bank_or_roll";
    recordGrowthEvent("daily_signin_opened");
    recordGrowthEvent("daily_signin_completed");
    vi.advanceTimersByTime(1600);
    const records = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string).events;
    expect(new Set(records.map((r: { session: string }) => r.session)).size).toBe(1);
    expect(
      records.every(
        (r: { source: string; campaign: string }) =>
          r.source === "landing" && r.campaign === "bank_or_roll",
      ),
    ).toBe(true);
    expect(
      records.every(
        (r: Record<string, unknown>) =>
          Object.keys(r).sort().join(",") === "campaign,event,id,session,source,visitor",
      ),
    ).toBe(true);
  });
  it("attributes an untagged welcome visit consistently and rotates an idle session", async () => {
    const location = { pathname: "/welcome/", search: "" };
    vi.stubGlobal("window", { location, setTimeout, clearTimeout });
    const { recordGrowthEvent } = await import("./growth.js");
    recordGrowthEvent("landing_viewed");
    location.pathname = "/";
    location.search = "?practice=1&source=landing&utm_campaign=none";
    recordGrowthEvent("practice_started");
    vi.advanceTimersByTime(1600);
    const first = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string).events;
    expect(first.map((r: { source: string; campaign: string }) => [r.source, r.campaign])).toEqual([
      ["landing", "none"],
      ["landing", "none"],
    ]);
    vi.advanceTimersByTime(31 * 60_000);
    recordGrowthEvent("daily_started");
    vi.advanceTimersByTime(1600);
    const next = JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string).events[0];
    expect(next.session).not.toBe(first[0].session);
    expect(next.visitor).toBe(first[0].visitor);
  });
  it("sends fixed actions and random IDs without account headers or URL contents", async () => {
    const { recordGrowthEvent } = await import("./growth.js");
    recordGrowthEvent("practice_started");
    recordGrowthEvent("practice_completed");
    vi.advanceTimersByTime(1600);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, request] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://example.test/api/growth");
    const records = JSON.parse(request!.body as string).events;
    expect(records).toHaveLength(2);
    expect(records[0].visitor).toMatch(/^[a-f0-9-]{36}$/);
    expect(records[0].visitor).toBe(records[1].visitor);
    expect(records[0].source).toBe("landing");
    expect(records[0].campaign).toBe("daily");
    expect(request!.headers).toEqual({ "Content-Type": "application/json" });
    expect(request!.credentials).toBe("omit");
  });
  it("drops pending events and identifiers immediately on opt-out", async () => {
    const { recordGrowthEvent, setUsageEnabled } = await import("./growth.js");
    recordGrowthEvent("daily_started");
    setUsageEnabled(false);
    recordGrowthEvent("daily_completed");
    vi.advanceTimersByTime(2000);
    expect(fetch).not.toHaveBeenCalled();
    expect(local.has("greed:usage-visitor")).toBe(false);
    expect(session.size).toBe(0);
  });
  it("honors both browser privacy signals even after opting in", async () => {
    const { recordGrowthEvent, setUsageEnabled } = await import("./growth.js");
    for (const signal of [{ doNotTrack: "1" }, { globalPrivacyControl: true }]) {
      vi.stubGlobal("navigator", signal);
      setUsageEnabled(true);
      recordGrowthEvent("visit");
    }
    vi.advanceTimersByTime(2000);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not collect when storage is blocked", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    const { recordGrowthEvent } = await import("./growth.js");
    expect(() => recordGrowthEvent("visit")).not.toThrow();
    vi.advanceTimersByTime(2000);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rotates expired browser IDs and ignores arbitrary campaign parameters", async () => {
    const expired = "f768af0e-83d0-45f8-89f6-d58f2caab6ab";
    local.set("greed:usage-visitor", JSON.stringify({ id: expired, expires: 0 }));
    vi.stubGlobal("window", {
      location: { search: "?source=secret&utm_campaign=user@email.test" },
      setTimeout,
      clearTimeout,
    });
    const { recordGrowthEvent } = await import("./growth.js");
    recordGrowthEvent("visit");
    vi.advanceTimersByTime(2000);
    const record = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string).events[0];
    expect(record.visitor).not.toBe(expired);
    expect(record.source).toBe("direct");
    expect(record.campaign).toBe("none");
  });
});
