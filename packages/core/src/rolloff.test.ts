import { describe, it, expect } from "vitest";
import { determineOrder } from "./rolloff.js";
import { createGame } from "./game.js";
import type { PlayerConfig } from "./types.js";

describe("determineOrder (opening roll-off)", () => {
  it("orders players by pip total, lowest first and highest last", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { entries, order } = determineOrder(4, seed);
      expect(entries).toHaveLength(4);
      expect([...order].sort()).toEqual([0, 1, 2, 3]); // a permutation

      const sums = order.map((i) => entries[i].sum);
      // Non-decreasing along the order => first has the lowest, last the highest.
      for (let k = 1; k < sums.length; k++) {
        expect(sums[k]).toBeGreaterThanOrEqual(sums[k - 1]);
      }
      const maxSum = Math.max(...entries.map((e) => e.sum));
      expect(entries[order[order.length - 1]].sum).toBe(maxSum);
    }
  });

  it("each throw sums 5 dice (range 5..30)", () => {
    const { entries } = determineOrder(6, 123);
    for (const e of entries) {
      expect(e.dice).toHaveLength(5);
      expect(e.sum).toBe(e.dice.reduce((a, b) => a + b, 0));
      expect(e.sum).toBeGreaterThanOrEqual(5);
      expect(e.sum).toBeLessThanOrEqual(30);
    }
  });
});

describe("createGame accepts an explicit order", () => {
  it("uses the roll-off order as the turn order", () => {
    const players: PlayerConfig[] = [0, 1, 2, 3].map((i) => ({
      id: `p${i}`,
      name: `P${i}`,
      isBot: false,
    }));
    const g = createGame(players, { goal: 2000, seed: 5, order: [2, 0, 3, 1] });
    expect(g.order).toEqual([2, 0, 3, 1]);
    expect(g.players[g.turn.playerIndex].id).toBe("p2"); // order[0] goes first
  });
});
