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
