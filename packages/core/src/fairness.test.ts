import { describe, expect, it } from "vitest";
import { createDailyGame } from "./daily.js";
import { applyAction } from "./game.js";
import { nextFloat, rollDice } from "./rng.js";
import { scoreRoll } from "./scoring.js";
import { createWeeklyGame } from "./weekly.js";
import type { DieValue, GameState } from "./types.js";

/** Independent rule for a bust: no single 1/5 and no three matching faces.
 * A straight necessarily includes a 5; five of a kind necessarily has a triple.
 * Neither special hand can turn an outcome classified here into a bust. */
function isBust(dice: DieValue[]): boolean {
  if (dice.includes(1) || dice.includes(5)) return false;
  return [2, 3, 4, 6].every((face) => dice.filter((d) => d === face).length < 3);
}

describe("dice fairness guarantees", () => {
  it("matches an independent bust rule for every possible cup of one to five dice", () => {
    const expectedBusts = [4, 16, 60, 204, 600];
    for (let count = 1; count <= 5; count++) {
      let busts = 0;
      for (let outcome = 0; outcome < 6 ** count; outcome++) {
        let remaining = outcome;
        const dice: DieValue[] = [];
        for (let i = 0; i < count; i++) {
          dice.push(((remaining % 6) + 1) as DieValue);
          remaining = Math.floor(remaining / 6);
        }
        const result = scoreRoll(dice);
        const expected = isBust(dice);
        expect(result.points === 0, `cup ${dice.join(",")}`).toBe(expected);
        expect(result.scoringMask.some(Boolean)).toBe(!expected);
        if (expected) busts++;
      }
      expect(busts).toBe(expectedBusts[count - 1]);
    }
    // The exact super-bust probability is 600 / 7776 = 25 / 324.
    expect(expectedBusts[4] / 6 ** 5).toBe(25 / 324);
  });

  it("deals identical fresh dice in daily, weekly and post-hot-dice contexts", () => {
    // Obtain a real cleared mat through a legal roll instead of inventing locks
    // or scoring awards. Only its RNG is then pinned to compare the same draw
    // at the different points where a player picks up a full cup.
    let hot: GameState | undefined;
    for (let seed = 1; seed <= 1000 && !hot; seed++) {
      const candidate = applyAction(createWeeklyGame(seed), { type: "ROLL" });
      if (candidate.turn.hotDice) hot = candidate;
    }
    if (!hot) throw new Error("No hot-dice fixture found");

    let busts = 0;
    let successes = 0;
    for (let seed = 0; seed < 2000; seed++) {
      const daily = createDailyGame(seed);
      const weekly = createWeeklyGame(seed);
      const postHot = structuredClone(hot);
      postHot.rng = weekly.rng;
      const carried = postHot.turn.turnScore;
      const opening = applyAction(weekly, { type: "ROLL" });
      const afterHot = applyAction(postHot, { type: "ROLL" });

      expect(applyAction(daily, { type: "ROLL" }).turn.dice).toEqual(opening.turn.dice);
      expect(afterHot.turn.dice).toEqual(opening.turn.dice);
      expect(afterHot.turn.lastRoll).toEqual(opening.turn.lastRoll);
      expect(afterHot.turn.busted).toBe(opening.turn.busted);
      expect(afterHot.rng).toBe(opening.rng);
      expect(afterHot.rng).toBe(rollDice(weekly.rng, 5).state);
      if (opening.turn.busted) {
        busts++;
        expect(afterHot.turn.turnScore).toBe(0);
      } else {
        successes++;
        expect(afterHot.turn.turnScore).toBe(carried + opening.turn.turnScore);
      }
    }
    expect(busts).toBeGreaterThan(0);
    expect(successes).toBeGreaterThan(0);
  });

  it("advances once per thrown die, without extra draws on banking or advancing", () => {
    for (const seed of [0, 1, 12345, 0x7fffffff, 0xffffffff]) {
      for (let count = 1; count <= 5; count++) {
        let expectedState = seed;
        for (let i = 0; i < count; i++) expectedState = nextFloat(expectedState).state;
        const rolled = rollDice(seed, count);
        expect(rolled.state).toBe(expectedState);
        expect(rolled.dice).toHaveLength(count);
        expect(rolled.dice.every((d) => Number.isInteger(d) && d >= 1 && d <= 6)).toBe(true);
      }
      const fresh = createWeeklyGame(seed);
      expect(applyAction(fresh, { type: "BANK" }).rng).toBe(fresh.rng);
      expect(applyAction(fresh, { type: "ADVANCE" }).rng).toBe(fresh.rng);
      const rolled = applyAction(fresh, { type: "ROLL" });
      const finished = rolled.turn.busted ? rolled : applyAction(rolled, { type: "BANK" });
      expect(finished.rng).toBe(rolled.rng);
      expect(applyAction(finished, { type: "ROLL" }).rng).toBe(finished.rng);
      expect(applyAction(finished, { type: "ADVANCE" }).rng).toBe(finished.rng);
    }
  });
});
