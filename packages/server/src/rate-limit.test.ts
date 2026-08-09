import { afterEach, describe, expect, it, vi } from "vitest";
import { clientKey, rateLimit, resetRateLimits } from "./rate-limit.js";

afterEach(() => {
  resetRateLimits();
  vi.useRealTimers();
});

describe("rateLimit", () => {
  it("allows up to the limit and blocks beyond it", () => {
    for (let i = 0; i < 3; i++) {
      expect(rateLimit("login", "1.1.1.1", 3, 60_000).allowed, `hit ${i + 1}`).toBe(true);
    }
    const blocked = rateLimit("login", "1.1.1.1", 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("counts each client separately", () => {
    rateLimit("login", "1.1.1.1", 1, 60_000);
    expect(rateLimit("login", "1.1.1.1", 1, 60_000).allowed).toBe(false);
    // A different caller is unaffected by the first one's exhaustion.
    expect(rateLimit("login", "2.2.2.2", 1, 60_000).allowed).toBe(true);
  });

  it("counts each bucket separately", () => {
    rateLimit("login", "1.1.1.1", 1, 60_000);
    expect(rateLimit("login", "1.1.1.1", 1, 60_000).allowed).toBe(false);
    expect(rateLimit("signup", "1.1.1.1", 1, 60_000).allowed).toBe(true);
  });

  it("recovers once the window elapses", () => {
    vi.useFakeTimers();
    rateLimit("login", "1.1.1.1", 1, 60_000);
    expect(rateLimit("login", "1.1.1.1", 1, 60_000).allowed).toBe(false);
    vi.advanceTimersByTime(60_001);
    expect(rateLimit("login", "1.1.1.1", 1, 60_000).allowed).toBe(true);
  });
});

describe("clientKey", () => {
  it("prefers the original client from x-forwarded-for", () => {
    // Render terminates TLS at a proxy, so the socket address is the proxy's;
    // without this every visitor would share one bucket.
    expect(clientKey({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }, "10.0.0.1")).toBe(
      "203.0.113.7",
    );
  });

  it("falls back to the socket address, then to a constant", () => {
    expect(clientKey({}, "198.51.100.4")).toBe("198.51.100.4");
    expect(clientKey({}, "")).toBe("unknown");
  });
});
