/**
 * Scoring rules for Greed (authoritative implementation of the confirmed ruleset):
 *
 *  - Single 1 = 100, single 5 = 50.
 *  - Three of a kind = 100 x face value.
 *  - Straight (1-2-3-4-5 or 2-3-4-5-6) = 500, uses all 5 dice.
 *  - Five of a kind (any face) = 1000, uses all 5 dice. Worth more than the same
 *    five dice scored any other way, so it replaces rather than adds to them.
 *  - Four/five of a kind = triple + extra dice scored individually (1s/5s only);
 *    there is no special 4/5-of-a-kind bonus.
 *  - Everything in a throw is added together.
 *
 * For each face the engine awards the *maximum* of the triple interpretation and
 * the all-individual interpretation, which yields the exact confirmed cases:
 *   three 1s = 300 (individuals beat the 100 triple), three 5s = 500 (triple
 *   beats 150), four 5s = 550, four 6s = 600, five 1s = 500, 1,1,1,5,5 = 400.
 *
 * A die is locked only if it contributed points, so e.g. the 4th 6 in 6,6,6,6,2
 * stays rerollable.
 */

import { FIVE_OF_A_KIND } from "./types.js";
import type { DieValue, ScoreBreakdownEntry, ScoreResult } from "./types.js";

/** Per-die value when scored individually (only 1s and 5s score on their own). */
function individualValue(face: DieValue): number {
  if (face === 1) return 100;
  if (face === 5) return 50;
  return 0;
}

/**
 * One die paying on its own.
 *
 * A 1 or a 5 scores by itself, so it gets an entry of its own rather than being
 * pooled with the others showing that face. It matters because a player can now
 * put a single die back: pooling three 1s into one 300 award meant taking one of
 * them back forfeited all three.
 */
function single(face: DieValue, index: number, points: number): ScoreBreakdownEntry {
  return { kind: face === 1 ? "ones" : "fives", face, diceUsed: 1, indices: [index], points };
}

function isStraight(sortedKey: string): boolean {
  return sortedKey === "1,2,3,4,5" || sortedKey === "2,3,4,5,6";
}

/**
 * Score a single throw of dice. `dice` is exactly the set of dice thrown (1..5).
 * Returns the points, which dice locked, whether the throw was "hot" (all
 * scored), and a human-readable breakdown.
 */
export function scoreRoll(dice: DieValue[]): ScoreResult {
  const n = dice.length;
  const scoringMask = new Array<boolean>(n).fill(false);
  const breakdown: ScoreBreakdownEntry[] = [];

  const all = [0, 1, 2, 3, 4];

  // Five of a kind and a straight both need a full throw, and both take every
  // die, so neither can coexist with anything else.
  if (n === 5) {
    if (dice.every((d) => d === dice[0])) {
      return {
        points: FIVE_OF_A_KIND,
        scoringMask: [true, true, true, true, true],
        isHotDice: true,
        breakdown: [
          {
            kind: "five-of-a-kind",
            face: dice[0],
            diceUsed: 5,
            indices: all,
            points: FIVE_OF_A_KIND,
          },
        ],
      };
    }
    const key = [...dice].sort((a, b) => a - b).join(",");
    if (isStraight(key)) {
      return {
        points: 500,
        scoringMask: [true, true, true, true, true],
        isHotDice: true,
        breakdown: [{ kind: "straight", diceUsed: 5, indices: all, points: 500 }],
      };
    }
  }

  // Group die indices by face value.
  const indicesByFace: number[][] = [[], [], [], [], [], [], []]; // 1..6
  dice.forEach((d, i) => indicesByFace[d].push(i));

  let points = 0;

  for (let f = 1 as DieValue; f <= 6; f = (f + 1) as DieValue) {
    const idxs = indicesByFace[f];
    const count = idxs.length;
    if (count === 0) continue;

    const perDie = individualValue(f);

    if (count >= 3) {
      const tripleOption = 100 * f + (count - 3) * perDie;
      const individualOption = count * perDie;

      if (tripleOption >= individualOption) {
        // Triple (100 x face) locks 3 dice; any extras score individually.
        points += 100 * f;
        for (let k = 0; k < 3; k++) scoringMask[idxs[k]] = true;
        breakdown.push({
          kind: "triple",
          face: f,
          diceUsed: 3,
          indices: idxs.slice(0, 3),
          points: 100 * f,
        });

        for (let k = 3; k < count; k++) {
          if (perDie > 0) {
            points += perDie;
            scoringMask[idxs[k]] = true;
            breakdown.push(single(f, idxs[k], perDie));
          }
        }
      } else {
        // Scoring each die individually is worth more (only happens for 1s).
        points += individualOption;
        for (const i of idxs) {
          scoringMask[i] = true;
          breakdown.push(single(f, i, perDie));
        }
      }
    } else if (perDie > 0) {
      // Fewer than three: only 1s and 5s score.
      points += count * perDie;
      for (const i of idxs) {
        scoringMask[i] = true;
        breakdown.push(single(f, i, perDie));
      }
    }
  }

  const isHotDice = n > 0 && scoringMask.every((m) => m);
  return { points, scoringMask, isHotDice, breakdown };
}

/** Convenience: does a throw of these dice score anything at all? */
export function throwScores(dice: DieValue[]): boolean {
  return scoreRoll(dice).points > 0;
}
