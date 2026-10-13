import { describe, expect, it, vi } from "vitest";
import {
  improvesPersonalBest,
  readScoreBaseline,
  scoreBaseline,
  weeklyScoreOutcome,
} from "./challengeScoreFeedback.js";

describe("challenge score feedback", () => {
  it("only highlights a score above a known prior all-time personal best", () => {
    expect(improvesPersonalBest(7150, 6700)).toBe(true);
    expect(improvesPersonalBest(6700, 6700)).toBe(false);
    expect(improvesPersonalBest(6200, 6700)).toBe(false);
    expect(improvesPersonalBest(7150, null)).toBe(false);
    expect(improvesPersonalBest(7150, undefined)).toBe(false);
  });

  it("keeps missing or invalid history distinct from no previous result", () => {
    expect(scoreBaseline({ score: 0 })).toBe(0);
    expect(scoreBaseline({ score: 6700 })).toBe(6700);
    expect(scoreBaseline(null)).toBeNull();
    expect(scoreBaseline(undefined)).toBeUndefined();
    expect(scoreBaseline({ score: NaN })).toBeUndefined();
    expect(scoreBaseline({ score: -1 })).toBeUndefined();
  });

  it("reports the improvement in the total, independently of all-time records", () => {
    expect(weeklyScoreOutcome(7150, 6700, 7150)).toEqual({ kind: "improved", gain: 450 });
    expect(improvesPersonalBest(7150, 8000)).toBe(false);
  });

  it("keeps the standing total after weaker and equal-score attempts", () => {
    expect(weeklyScoreOutcome(6200, 6700, 6700)).toEqual({ kind: "stands", score: 6700 });
    expect(weeklyScoreOutcome(6700, 6700, 6700)).toEqual({ kind: "stands", score: 6700 });
    // A concurrent attempt in another tab can post a stronger standing score.
    expect(weeklyScoreOutcome(7150, 6700, 8000)).toEqual({ kind: "stands", score: 8000 });
  });

  it("labels a first weekly score without inventing an improvement", () => {
    expect(weeklyScoreOutcome(3000, null, 3000)).toEqual({ kind: "first" });
  });

  it("does not block play when the optional score history stalls", async () => {
    vi.useFakeTimers();
    try {
      let deliver: ((value: { yourBest: { score: number } }) => void) | undefined;
      const read = readScoreBaseline(() => new Promise((resolve) => (deliver = resolve)));
      await vi.advanceTimersByTimeAsync(1500);
      expect(await read).toBeUndefined();
      deliver?.({ yourBest: { score: 6700 } });
      expect(await read).toBeUndefined();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cleans up its deadline after a successful read or an unavailable board", async () => {
    vi.useFakeTimers();
    try {
      expect(await readScoreBaseline(async () => ({ yourBest: { score: 6700 } }))).toBe(6700);
      expect(
        await readScoreBaseline(async () => {
          throw new Error("Unavailable");
        }),
      ).toBeUndefined();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
