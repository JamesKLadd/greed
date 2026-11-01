import { describe, expect, it } from "vitest";
import { challengeStake, stakeSeenKey } from "./challengeStake.js";

describe("challengeStake", () => {
  it("names the trophy a holiday's Daily and Weekly play for, and nothing else", () => {
    expect(challengeStake("daily", "2026-10-31")).toBe("halloween-champion");
    expect(challengeStake("daily", "2026-11-01")).toBeNull();
    expect(challengeStake("weekly", "2026-10-26")).toBe("halloween-champion");
    // The week after Halloween 2026 plays for it too.
    expect(challengeStake("weekly", "2026-11-02")).toBe("halloween-champion");
    expect(challengeStake("weekly", "2026-11-09")).toBeNull();
    expect(challengeStake("daily", "2026-12-25")).toBe("christmas-champion");
  });

  it("remembers the notice per account and per period", () => {
    const a = stakeSeenKey("u1", "weekly", "2026-11-02");
    expect(a).not.toBe(stakeSeenKey("u2", "weekly", "2026-11-02"));
    expect(a).not.toBe(stakeSeenKey("u1", "daily", "2026-11-02"));
    expect(a).not.toBe(stakeSeenKey("u1", "weekly", "2026-11-09"));
  });
});
