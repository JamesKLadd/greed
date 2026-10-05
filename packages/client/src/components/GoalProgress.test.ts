import { describe, expect, it } from "vitest";
import { goalProgress } from "./GoalProgress.js";

describe("banked goal progress", () => {
  it("uses the configured goal rather than a fixed default", () => {
    expect(goalProgress(500, 2000)).toEqual({ value: 500, percent: 25, remaining: 1500 });
    expect(goalProgress(500, 5000)).toEqual({ value: 500, percent: 10, remaining: 4500 });
  });

  it("fills at the goal and stays full through final-round overshoots", () => {
    expect(goalProgress(3000, 3000)).toEqual({ value: 3000, percent: 100, remaining: 0 });
    expect(goalProgress(4250, 3000)).toEqual({ value: 3000, percent: 100, remaining: 0 });
    expect(goalProgress(0, 3000)).toEqual({ value: 0, percent: 0, remaining: 3000 });
  });
});
