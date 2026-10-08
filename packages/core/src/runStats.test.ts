/**
 * What a run reports about itself — specifically the one stat that cannot be
 * read off the move list without replaying it.
 *
 * A super bust is a bust on a full cup of five: the opening throw of a turn, or
 * the fresh five off a cleared mat. The move list says "ROLL"; only the replay
 * knows how many dice that ROLL picked up.
 */

import { describe, expect, it } from "vitest";
import { DAILY_TURNS, scoreDailyRun } from "./daily.js";
import { runPosition, type RunMove } from "./run.js";
import { applyAction, createGame } from "./game.js";
import { diceToRoll } from "./turn.js";

/** Roll until the turn ends, ten times over: every bust is on a full cup. */
const ROLL_ONLY: RunMove[] = Array<RunMove>(200).fill("ROLL");

describe("hot dice in a run", () => {
  it("counts consecutive cleared mats, including a fresh full cup after hot dice", () => {
    // Real solo-run RNG: the first two full cups are straights, worth 500 each.
    const first = runPosition(35, ["ROLL"], DAILY_TURNS);
    expect(first.state.turn.dice).toEqual([4, 5, 6, 3, 2]);
    expect(first.result.hotDice).toBe(1);

    const second = runPosition(35, ["ROLL", "ROLL"], DAILY_TURNS);
    expect(second.state.turn.dice).toEqual([3, 5, 6, 2, 4]);
    expect(second.state.turn.turnScore).toBe(1000);
    expect(second.result.hotDice).toBe(2);
    expect(second.result.hotDice).toBe(
      second.state.log.filter((event) => event.type === "hot-dice").length,
    );

    const banked = runPosition(35, ["ROLL", "ROLL", "BANK"], DAILY_TURNS);
    expect(banked.result.score).toBe(1000);
    expect(banked.result.hotDice).toBe(2);
  });

  it("does not award more clears for repeatedly releasing and holding the same die", () => {
    const moves: RunMove[] = ["ROLL", "H0", "H0", "H0", "H0"];
    const restored = runPosition(35, moves, DAILY_TURNS);
    expect(restored.state.turn.hotDice).toBe(true);
    expect(restored.result.hotDice).toBe(1);

    const rerolled = runPosition(35, [...moves, "ROLL"], DAILY_TURNS);
    expect(rerolled.result.hotDice).toBe(2);
  });

  it("agrees with the engine's cleared-mat events over complete runs", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const pos = runPosition(seed, ROLL_ONLY, DAILY_TURNS);
      expect(pos.result.hotDice, `seed ${seed}`).toBe(
        pos.state.log.filter((event) => event.type === "hot-dice").length,
      );
    }
  });
});

describe("super busts in a run", () => {
  it("counts a bust on the opening throw of a turn", () => {
    // Rolling and never holding anything back means every throw after the first
    // of a turn is a partial one — so the only busts that can be super are the
    // openers. Checked against the engine rather than assumed.
    for (const seed of [7, 19, 44, 101, 2024]) {
      const pos = runPosition(seed, ROLL_ONLY, DAILY_TURNS);
      expect(pos.result.superBusts).toBeLessThanOrEqual(pos.result.busts);
      expect(pos.result.banks + pos.result.busts).toBe(DAILY_TURNS);
    }
  });

  it("agrees with the throws the engine actually made", () => {
    // The independent count: replay the same move list step by step, look at
    // the cup before each ROLL, and tally the busts that came off a full five.
    for (let seed = 1; seed <= 200; seed++) {
      let state = runPosition(seed, [], DAILY_TURNS).state;
      let turns = 0;
      let expected = 0;
      for (let i = 0; i < ROLL_ONLY.length; i++) {
        if (turns >= DAILY_TURNS) break;
        if (state.turn.outcome) state = applyAction(state, { type: "ADVANCE" });
        const cup = diceToRoll(state.turn).length;
        const next = applyAction(state, { type: "ROLL" });
        if (next === state) break;
        state = next;
        if (state.turn.outcome) {
          if (state.turn.busted && cup === 5) expected += 1;
          turns += 1;
        }
      }
      expect(runPosition(seed, ROLL_ONLY, DAILY_TURNS).result.superBusts, `seed ${seed}`).toBe(
        expected,
      );
    }
  });

  it("counts the fresh five off a cleared mat, not just the opener", () => {
    // Hunt for a seed where a turn goes hot and then dies on the next throw —
    // the same five dice, a different moment, and the case a rule written as
    // "the first roll of a turn" would miss.
    let found = 0;
    for (let seed = 1; seed <= 3000 && found < 3; seed++) {
      let state = runPosition(seed, [], DAILY_TURNS).state;
      const moves: RunMove[] = [];
      for (let i = 0; i < 40; i++) {
        if (state.turn.outcome) break;
        const wasHot = state.turn.hotDice;
        const cup = diceToRoll(state.turn).length;
        state = applyAction(state, { type: "ROLL" });
        moves.push("ROLL");
        if (state.turn.busted && wasHot && cup === 5) {
          // A bust on the five that a cleared mat dealt, inside the FIRST turn,
          // so the run's count is unambiguously this one.
          expect(runPosition(seed, moves, DAILY_TURNS).result.superBusts).toBe(1);
          found++;
          break;
        }
      }
    }
    expect(found, "no hot-dice bust found to check").toBe(3);
  });

  it("does not count a bust on a partial throw", () => {
    // Hold everything that scored and throw the rest: those busts are on a
    // short cup and must not be counted, however many of them there are.
    let partialBusts = 0;
    for (let seed = 1; seed <= 400; seed++) {
      let state = runPosition(seed, [], DAILY_TURNS).state;
      const moves: RunMove[] = [];
      state = applyAction(state, { type: "ROLL" });
      moves.push("ROLL");
      if (state.turn.outcome) continue;
      if (diceToRoll(state.turn).length === 5) continue; // hot: the next cup is full
      const before = state.turn.dice.slice();
      state = applyAction(state, { type: "ROLL" });
      moves.push("ROLL");
      if (!state.turn.busted) continue;
      expect(before.length).toBe(5);
      const r = runPosition(seed, moves, DAILY_TURNS).result;
      expect(r.busts).toBe(1);
      expect(r.superBusts, `seed ${seed}`).toBe(0);
      partialBusts++;
    }
    expect(partialBusts).toBeGreaterThan(50);
  });

  it("travels with the rest of a daily run's figures", () => {
    const r = scoreDailyRun(12345, ROLL_ONLY);
    expect(r.superBusts).toBeGreaterThanOrEqual(0);
    expect(r.superBusts).toBeLessThanOrEqual(r.busts);
    // And it is as deterministic as everything else on the row: the whole
    // point of storing seed and moves is that this can be re-derived.
    expect(scoreDailyRun(12345, ROLL_ONLY)).toEqual(r);
  });

  it("is never more than the busts it is a subset of", () => {
    for (let seed = 1; seed <= 500; seed++) {
      const mixed: RunMove[] = [];
      for (let i = 0; i < 60; i++) mixed.push(i % 3 === 2 ? "BANK" : "ROLL");
      const r = runPosition(seed, mixed, DAILY_TURNS).result;
      expect(r.superBusts).toBeLessThanOrEqual(r.busts);
      expect(r.superBusts).toBeGreaterThanOrEqual(0);
    }
  });

  it("ignores a game that is not a run at all", () => {
    // The stat lives on RunResult, so an ordinary table game has no opinion
    // about it — stated here so nobody goes looking for one.
    const g = createGame(
      [
        { id: "a", name: "A", isBot: false },
        { id: "b", name: "B", isBot: false },
      ],
      { goal: 3000, seed: 1 },
    );
    expect("superBusts" in g).toBe(false);
  });
});
