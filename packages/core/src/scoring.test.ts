import { describe, it, expect } from "vitest";
import { scoreRoll } from "./scoring.js";
import type { DieValue } from "./types.js";

const d = (...v: number[]) => v as DieValue[];

function lockedCount(dice: DieValue[]): number {
  return scoreRoll(dice).scoringMask.filter(Boolean).length;
}

describe("scoreRoll - confirmed cases", () => {
  it("1,1,5,2,3 = 250", () => {
    expect(scoreRoll(d(1, 1, 5, 2, 3)).points).toBe(250);
  });

  it("three 1s = 300 (individuals beat the triple)", () => {
    expect(scoreRoll(d(1, 1, 1)).points).toBe(300);
    expect(scoreRoll(d(1, 1, 1, 2, 3)).points).toBe(300);
  });

  it("three 5s = 500 (triple beats individuals)", () => {
    expect(scoreRoll(d(5, 5, 5)).points).toBe(500);
    expect(scoreRoll(d(5, 5, 5, 2, 3)).points).toBe(500);
  });

  it("four 5s = 550 (triple + one loose 5)", () => {
    expect(scoreRoll(d(5, 5, 5, 5, 2)).points).toBe(550);
  });

  it("four 6s = 600, and the 4th 6 stays rerollable", () => {
    const r = scoreRoll(d(6, 6, 6, 6, 2));
    expect(r.points).toBe(600);
    expect(r.scoringMask.filter(Boolean).length).toBe(3);
    expect(r.isHotDice).toBe(false);
  });

  it("five of a kind = 1000, whatever the face", () => {
    // Worth more than the same five dice scored any other way: five 1s as
    // individuals would be 500, five 5s as a triple plus two singles 600.
    for (const face of [1, 2, 3, 4, 5, 6] as const) {
      const r = scoreRoll(d(face, face, face, face, face));
      expect(r.points, `five ${face}s`).toBe(1000);
      expect(r.isHotDice).toBe(true);
      expect(r.scoringMask).toEqual([true, true, true, true, true]);
      expect(r.breakdown).toEqual([
        { kind: "five-of-a-kind", face, diceUsed: 5, indices: [0, 1, 2, 3, 4], points: 1000 },
      ]);
    }
  });

  it("1,1,1,5,5 = 400 and is hot dice", () => {
    const r = scoreRoll(d(1, 1, 1, 5, 5));
    expect(r.points).toBe(400);
    expect(r.isHotDice).toBe(true);
  });

  it("6,6,6,5,2 = 650", () => {
    expect(scoreRoll(d(6, 6, 6, 5, 2)).points).toBe(650);
  });
});

describe("scoreRoll - triples", () => {
  it("100 x face for 2,3,4,6", () => {
    expect(scoreRoll(d(2, 2, 2)).points).toBe(200);
    expect(scoreRoll(d(3, 3, 3)).points).toBe(300);
    expect(scoreRoll(d(4, 4, 4)).points).toBe(400);
    expect(scoreRoll(d(6, 6, 6)).points).toBe(600);
  });

  it("a pair scores nothing for non 1/5", () => {
    expect(scoreRoll(d(6, 6)).points).toBe(0);
    expect(scoreRoll(d(2, 2, 3, 4, 6)).points).toBe(0);
  });
});

describe("scoreRoll - straights", () => {
  it("1-2-3-4-5 = 500 and hot dice", () => {
    const r = scoreRoll(d(3, 1, 4, 5, 2));
    expect(r.points).toBe(500);
    expect(r.isHotDice).toBe(true);
  });

  it("2-3-4-5-6 = 500", () => {
    expect(scoreRoll(d(6, 4, 2, 5, 3)).points).toBe(500);
  });

  it("beats scoring the straight's 1/5 individually", () => {
    // 1,2,3,4,5 individually would be 150; straight is 500.
    expect(scoreRoll(d(1, 2, 3, 4, 5)).points).toBe(500);
  });
});

describe("scoreRoll - busts and masks", () => {
  it("returns 0 for a non-scoring throw", () => {
    expect(scoreRoll(d(2, 3, 4, 6, 6)).points).toBe(0);
    expect(scoreRoll(d(2)).points).toBe(0);
  });

  it("locks only scoring dice", () => {
    const r = scoreRoll(d(1, 3, 3, 4, 6));
    expect(r.points).toBe(100);
    expect(r.scoringMask).toEqual([true, false, false, false, false]);
  });

  it("hot dice only when every thrown die scores", () => {
    expect(scoreRoll(d(1, 5)).isHotDice).toBe(true);
    expect(scoreRoll(d(1, 5, 2)).isHotDice).toBe(false);
    expect(lockedCount(d(1, 5, 2))).toBe(2);
  });
});
