import { describe, expect, it } from "vitest";
import { GOAL_DEFAULT } from "@greed/core";
import { normalizeSetupGoal } from "./setupGoal.js";

describe("committing a custom local goal", () => {
  it("accepts a still-focused draft and snaps it to the scoring increment", () => {
    expect(normalizeSetupGoal("3026")).toBe(3050);
    expect(normalizeSetupGoal("3024")).toBe(3000);
    expect(normalizeSetupGoal(" 4500 ")).toBe(4500);
  });

  it("limits pasted or unfinished values before they reach a match", () => {
    expect(normalizeSetupGoal("1")).toBe(500);
    expect(normalizeSetupGoal("-20")).toBe(500);
    expect(normalizeSetupGoal("999999999")).toBe(100000);
  });

  it("uses the agreed default when the field is empty or invalid", () => {
    for (const value of ["", " ", "abc", "3000xyz", Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(normalizeSetupGoal(value)).toBe(GOAL_DEFAULT);
    }
  });
});
