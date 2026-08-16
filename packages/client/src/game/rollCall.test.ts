import { describe, expect, it } from "vitest";
import { scoreRoll } from "@greed/core";
import type { DieValue, TurnState } from "@greed/core";
import { rollCall } from "./rollCall.js";

/** A turn showing the given throw, which is all rollCall reads. */
function turnAfter(dice: DieValue[] | null): TurnState {
  return {
    playerIndex: 0,
    turnScore: 0,
    dice: [1, 1, 1, 1, 1],
    locked: [false, false, false, false, false],
    rollCount: dice ? 1 : 0,
    lastRoll: dice ? scoreRoll(dice) : null,
    busted: false,
    hotDice: false,
    awaitingDecision: dice != null,
    outcome: null,
  };
}

describe("rollCall", () => {
  it("says nothing before the first throw", () => {
    expect(rollCall(turnAfter(null))).toBe(null);
  });

  it("calls a straight", () => {
    expect(rollCall(turnAfter([1, 2, 3, 4, 5]))).toBe("straight");
    expect(rollCall(turnAfter([6, 4, 2, 5, 3]))).toBe("straight");
  });

  it("calls three of a kind", () => {
    expect(rollCall(turnAfter([3, 3, 3, 2, 4]))).toBe("triple");
  });

  it("still calls the triple when a fourth die matches", () => {
    // Four 6s is a triple plus a leftover, not two of anything.
    expect(rollCall(turnAfter([6, 6, 6, 6, 2]))).toBe("triple");
  });

  it("says nothing about three 1s, which the engine scores individually", () => {
    // 100 each beats the 100 triple, so no triple is ever awarded — and calling
    // one would name an award that isn't in the score.
    expect(rollCall(turnAfter([1, 1, 1, 2, 3]))).toBe(null);
  });

  it("says nothing for a plain scoring throw or a bust", () => {
    expect(rollCall(turnAfter([1, 5, 2, 3, 6]))).toBe(null);
    expect(rollCall(turnAfter([2, 3, 4, 6, 6]))).toBe(null);
  });
});
