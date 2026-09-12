import { describe, expect, it } from "vitest";
import { scoreRoll } from "@greed/core";
import type { DieValue, TurnState } from "@greed/core";
import { rollCall } from "./rollCall.js";

/** A turn showing the given throw, which is all rollCall reads. */
function turnAfter(dice: DieValue[] | null): TurnState {
  return {
    playerIndex: 0,
    turnScore: 0,
    // The dice on the mat, held exactly as the engine would hold them: what
    // scored is what stays. rollCall reads the mat for a five of a kind.
    dice: dice ?? [1, 1, 1, 1, 1],
    locked: dice ? scoreRoll(dice).scoringMask : [false, false, false, false, false],
    rollCount: dice ? 1 : 0,
    lastRoll: dice ? scoreRoll(dice) : null,
    awards: [],
    carried: 0,
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
    // Four 6s reaches the engine as a triple plus a leftover: three of a kind
    // and then some, and the fourth 6 is not even held.
    expect(rollCall(turnAfter([6, 6, 6, 6, 2]))).toBe("triple");
  });

  it("calls five of a kind, which outranks the rest", () => {
    for (const face of [1, 2, 3, 4, 5, 6] as const) {
      expect(rollCall(turnAfter([face, face, face, face, face]))).toBe("five");
    }
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

  it("calls a hand built across throws, not just one that was thrown", () => {
    // The mat is what a call reads: 2,3,4,5 held and a 6 thrown is a straight,
    // even though the throw on its own scored nothing at all. Same shape for
    // the fifth 2 completing five of a kind.
    const built = (dice: DieValue[], thrown: DieValue[]): TurnState => ({
      ...turnAfter(null),
      dice,
      locked: [true, true, true, true, true],
      rollCount: 2,
      lastRoll: scoreRoll(thrown),
      awaitingDecision: true,
    });
    expect(rollCall(built([2, 3, 4, 5, 6], [6]))).toBe("straight");
    expect(rollCall(built([2, 2, 2, 2, 2], [2]))).toBe("five");
  });

  it("says nothing for a plain scoring throw or a bust", () => {
    expect(rollCall(turnAfter([1, 5, 2, 3, 6]))).toBe(null);
    expect(rollCall(turnAfter([2, 3, 4, 6, 6]))).toBe(null);
  });
});
