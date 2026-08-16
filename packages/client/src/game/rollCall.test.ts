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

  it("still calls the triple when a fourth or fifth die matches", () => {
    // Four 6s reaches the engine as a triple plus a leftover, five 5s as a
    // triple plus two — both are three of a kind and then some.
    expect(rollCall(turnAfter([6, 6, 6, 6, 2]))).toBe("triple");
    expect(rollCall(turnAfter([5, 5, 5, 5, 5]))).toBe("triple");
  });

  it("calls three 1s, which the engine never awards as a triple", () => {
    // Three separate hundreds beat the 100 a triple of 1s would pay, so the
    // score contains no triple — but three matching dice are three matching
    // dice, and this is the throw a table shouts about.
    expect(rollCall(turnAfter([1, 1, 1, 2, 3]))).toBe("triple");
    expect(rollCall(turnAfter([1, 1, 1, 1, 3]))).toBe("triple");
  });

  it("does not call two 1s and two 5s", () => {
    // Four scoring dice, no three of anything.
    expect(rollCall(turnAfter([1, 1, 5, 5, 3]))).toBe(null);
  });

  it("says nothing for a plain scoring throw or a bust", () => {
    expect(rollCall(turnAfter([1, 5, 2, 3, 6]))).toBe(null);
    expect(rollCall(turnAfter([2, 3, 4, 6, 6]))).toBe(null);
  });
});
