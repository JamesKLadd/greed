/**
 * Opening roll-off that sets the turn order. Every player throws all 5 dice and
 * their pip totals are compared (the raw sum, not Greed points). The lowest total
 * goes first and the highest total goes last — going last is an advantage because
 * of how the endgame resolves (the last seat takes the final turn). Ties are
 * settled by re-rolling the tied players.
 */

import { rollDice } from "./rng.js";
import { DICE_COUNT } from "./types.js";
import type { RollOffEntry } from "./types.js";

export interface RollOffResult {
  /** Each player's final deciding throw, indexed by player. */
  entries: RollOffEntry[];
  /** Turn order: order[0] goes first (lowest total), the last entry goes last. */
  order: number[];
}

function sum(dice: number[]): number {
  return dice.reduce((a, b) => a + b, 0);
}

export function determineOrder(playerCount: number, seed: number): RollOffResult {
  let rng = seed >>> 0;
  const throwDice = (): RollOffEntry["dice"] => {
    const r = rollDice(rng, DICE_COUNT);
    rng = r.state;
    return r.dice;
  };

  const entries: RollOffEntry[] = [];
  for (let i = 0; i < playerCount; i++) {
    const dice = throwDice();
    entries.push({ playerIndex: i, dice, sum: sum(dice) });
  }

  // Re-roll any players sharing a total until everyone is distinct (bounded).
  for (let iter = 0; iter < 100; iter++) {
    const bySum = new Map<number, RollOffEntry[]>();
    for (const e of entries) {
      const group = bySum.get(e.sum) ?? [];
      group.push(e);
      bySum.set(e.sum, group);
    }
    const tied = [...bySum.values()].filter((g) => g.length > 1).flat();
    if (tied.length === 0) break;
    for (const e of tied) {
      e.dice = throwDice();
      e.sum = sum(e.dice);
    }
  }

  // Lowest total first, highest last (playerIndex as a final deterministic tiebreak).
  const order = [...entries]
    .sort((a, b) => a.sum - b.sum || a.playerIndex - b.playerIndex)
    .map((e) => e.playerIndex);

  return { entries, order };
}
