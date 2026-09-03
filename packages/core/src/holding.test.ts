/**
 * Holding dice by hand, and the one hand that can be built across throws.
 *
 * A position is set up by writing the dice and their awards directly — the RNG
 * is not what is under test — and everything after that is the real engine:
 * applyAction for the taps, and turn.ts for what the mat is worth. The one thing
 * a hand-built position cannot check is that a THROW attributes its awards to
 * the right dice, so that is checked separately as a property of real rolls.
 */

import { describe, expect, it } from "vitest";
import { applyAction, createGame, getLegalActions } from "./game.js";
import { canToggleLock, diceToRoll, heldScore, refreshTurn } from "./turn.js";
import type { DieValue, GameState, TurnAward } from "./types.js";

const players = [
  { id: "a", name: "A", isBot: false },
  { id: "b", name: "B", isBot: false },
];

/**
 * A game with a position placed on the mat: the faces, which dice are held, and
 * the awards those dice have been granted. Written the way doRoll leaves them.
 */
function position(dice: DieValue[], locked: boolean[], awards: TurnAward[] = []): GameState {
  const g = createGame(players, { goal: 10000, seed: 1 });
  g.turn.dice = [...dice];
  g.turn.locked = [...locked];
  g.turn.awards = awards;
  g.turn.rollCount = 1; // a throw has happened, so taps are allowed
  g.turn.awaitingDecision = true;
  refreshTurn(g.turn);
  return g;
}

/** 1s pay one die at a time, which is how the engine records them. */
const ones = (indices: number[]): TurnAward[] =>
  indices.map((i) => ({ kind: "ones", face: 1, dice: [i], points: 100 }));

const fives = (indices: number[]): TurnAward[] =>
  indices.map((i) => ({ kind: "fives", face: 5, dice: [i], points: 50 }));

const tap = (g: GameState, index: number) => applyAction(g, { type: "TOGGLE_LOCK", index });

describe("five of a kind is built, not just rolled", () => {
  it("pays 1000 for five held dice of a face, whatever they were worth apart", () => {
    // Three 1s (300) and two more arriving: 1000, not 1300.
    const g = position(
      [1, 1, 1, 1, 1],
      [true, true, true, true, true],
      [...ones([0, 1, 2]), ...ones([3, 4])],
    );
    expect(g.turn.turnScore).toBe(1000);
  });

  it("falls back to what the rest are earning when one die is taken back", () => {
    let g = position(
      [1, 1, 1, 1, 1],
      [true, true, true, true, true],
      [...ones([0, 1, 2]), ...ones([3, 4])],
    );
    expect(g.turn.turnScore).toBe(1000);

    // The four still held are still four 1s — 400, not nothing.
    g = tap(g, 4);
    expect(g.turn.turnScore).toBe(400);

    // And putting it back restores the hand: it has not been thrown since.
    g = tap(g, 4);
    expect(g.turn.turnScore).toBe(1000);
  });

  it("is not claimed while a matching die is loose", () => {
    const g = position(
      [4, 4, 4, 4, 4],
      [true, true, true, true, false],
      [{ kind: "triple", face: 4, dice: [0, 1, 2], points: 400 }],
    );
    // Four 4s on the mat, but only three of them held and paying.
    expect(g.turn.turnScore).toBe(400);
  });

  it("does not pay for five held dice that do not match", () => {
    const g = position(
      [1, 1, 1, 5, 5],
      [true, true, true, true, true],
      [...ones([0, 1, 2]), ...fives([3, 4])],
    );
    expect(g.turn.turnScore).toBe(400);
  });
});

describe("taking a die back", () => {
  it("removes the points it was part of", () => {
    let g = position(
      [3, 3, 3, 2, 4],
      [true, true, true, false, false],
      [{ kind: "triple", face: 3, dice: [0, 1, 2], points: 300 }],
    );
    expect(g.turn.turnScore).toBe(300);

    // Break the triple and its 300 goes, even though two 3s are still held.
    g = tap(g, 2);
    expect(g.turn.turnScore).toBe(0);
    expect(g.turn.locked).toEqual([true, true, false, false, false]);
  });

  it("frees a die while the mat is clear, so a hand can be chased", () => {
    // Four 1s and a 5: everything is paying, so the mat is clear.
    let g = position(
      [1, 1, 1, 1, 5],
      [true, true, true, true, true],
      [...ones([0, 1, 2, 3]), ...fives([4])],
    );
    expect(g.turn.turnScore).toBe(450);
    expect(g.turn.hotDice).toBe(true);

    // Put the 5 back to chase the last 1: the mat is no longer clear, and the
    // next throw is that one die rather than a fresh five.
    g = tap(g, 4);
    expect(g.turn.hotDice).toBe(false);
    expect(g.turn.turnScore).toBe(400);
    expect(diceToRoll(g.turn)).toEqual([4]);
  });

  it("is refused once the turn is over", () => {
    const g = position([1, 1, 1, 2, 3], [true, true, true, false, false], ones([0, 1, 2]));
    g.turn.outcome = "banked";
    expect(tap(g, 0).turn.locked).toEqual([true, true, true, false, false]);
  });

  it("is refused before the first throw", () => {
    const g = createGame(players, { goal: 10000, seed: 1 });
    expect(tap(g, 0).turn.locked.some(Boolean)).toBe(false);
  });

  it("ignores a die that is not on the mat", () => {
    const g = position([1, 2, 3, 4, 6], [true, false, false, false, false], ones([0]));
    for (const bad of [-1, 5, 1.5, Number.NaN]) {
      expect(tap(g, bad).turn.locked).toEqual([true, false, false, false, false]);
    }
  });
});

describe("a mat that only looks clear", () => {
  it("is not hot dice when a held die is paying nothing", () => {
    // A 1 and a 5 scored; the other three are duds held by hand.
    const g = position(
      [1, 5, 2, 3, 4],
      [true, true, true, true, true],
      [...ones([0]), ...fives([1])],
    );
    expect(g.turn.turnScore).toBe(150);
    expect(g.turn.hotDice).toBe(false);
    // Nothing left to throw, so rolling is not on offer — banking is.
    expect(getLegalActions(g).canRoll).toBe(false);
    expect(getLegalActions(g).canBank).toBe(true);
  });

  it("keeps the last paying die, so there is always something to bank", () => {
    // This used to read the other way: the tap went through, the turn dropped
    // to nothing, and rolling all five again was on offer. That was a free
    // throw — see "a throw is never free" below.
    const g = position([1, 2, 3, 4, 6], [true, false, false, false, false], ones([0]));
    expect(getLegalActions(g).canBank).toBe(true);
    const after = tap(g, 0);
    expect(after.turn.locked).toEqual([true, false, false, false, false]);
    expect(after.turn.turnScore).toBe(100);
    expect(getLegalActions(after).canBank).toBe(true);
  });
});

describe("a throw is never free", () => {
  it("refuses to put back the last held die", () => {
    // The whole rule. Releasing this 1 would empty the mat and leave a fresh
    // five to throw having lost nothing, because there was nothing on the mat
    // to lose.
    const g = position([1, 2, 3, 4, 6], [true, false, false, false, false], ones([0]));
    expect(canToggleLock(g.turn, 0)).toBe(false);
    // The loose dice are still the player's to pick up.
    expect(canToggleLock(g.turn, 1)).toBe(true);
  });

  it("will not roll from a mat with nothing held", () => {
    // The rule stated where legality lives, not only where the taps are — so a
    // position that arrives from somewhere else (an older server's broadcast)
    // is refused too rather than trusted.
    const g = position([1, 2, 3, 4, 6], [false, false, false, false, false]);
    expect(getLegalActions(g).canRoll).toBe(false);
    expect(getLegalActions(g).canBank).toBe(false);
  });

  it("still throws all five to open a turn", () => {
    const g = createGame(players, { goal: 10000, seed: 1 });
    expect(g.turn.rollCount).toBe(0);
    expect(g.turn.locked.some(Boolean)).toBe(false);
    expect(getLegalActions(g).canRoll).toBe(true);
    expect(diceToRoll(g.turn)).toEqual([0, 1, 2, 3, 4]);
  });

  it("still throws a fresh five off a cleared mat", () => {
    // Everything held and paying, so the mat is clear and the next throw is
    // five new dice — the held-die rule is satisfied by all of them at once.
    const g = position(
      [1, 1, 5, 5, 5],
      [true, true, true, true, true],
      [...ones([0, 1]), { kind: "triple", face: 5, dice: [2, 3, 4], points: 500 }],
    );
    expect(g.turn.hotDice).toBe(true);
    expect(getLegalActions(g).canRoll).toBe(true);
    expect(diceToRoll(g.turn)).toEqual([0, 1, 2, 3, 4]);
  });

  it("lets the kept die be swapped, by holding the new one first", () => {
    // No hand a player might want is unreachable: only passing THROUGH
    // nothing-held is refused, never any destination.
    let g = position([1, 2, 3, 4, 6], [true, false, false, false, false], ones([0]));
    g = tap(g, 1); // pick the dud 2 up as well
    g = tap(g, 0); // now the 1 can go back
    expect(g.turn.locked).toEqual([false, true, false, false, false]);
    expect(g.turn.turnScore).toBe(0);
    expect(getLegalActions(g).canRoll).toBe(true);
    expect(diceToRoll(g.turn)).toEqual([0, 2, 3, 4]);
  });

  it("cannot be talked out of it by releasing the dice one at a time", () => {
    // Real rolls: whatever a player does with the taps after a throw, they
    // cannot arrive at an empty mat with a roll on offer.
    for (let seed = 1; seed <= 200; seed++) {
      let g = createGame(players, { goal: 100000, seed });
      g = applyAction(g, { type: "ROLL" });
      if (g.turn.outcome) continue; // the throw busted; there is nothing held
      for (let i = 0; i < 5; i++) {
        if (g.turn.locked[i]) g = tap(g, i);
      }
      const held = g.turn.locked.filter(Boolean).length;
      expect(held, "seed " + seed).toBe(1);
      expect(getLegalActions(g).canRoll, "seed " + seed).toBe(true);
      expect(diceToRoll(g.turn).length, "seed " + seed).toBe(4);
    }
  });
});

describe("what a throw leaves behind", () => {
  it("attributes every award to dice that are held, and pays exactly their sum", () => {
    // Real rolls, real RNG: whatever comes up, the awards a throw records must
    // describe dice that are actually held, and must add up to the turn score.
    for (let seed = 1; seed <= 200; seed++) {
      let g = createGame(players, { goal: 100000, seed });
      for (let roll = 0; roll < 4 && !g.turn.outcome; roll++) {
        g = applyAction(g, { type: "ROLL" });
        if (g.turn.outcome) break;
        for (const award of g.turn.awards) {
          for (const die of award.dice) {
            expect(g.turn.locked[die], "seed " + seed + ": award die " + die + " held").toBe(true);
          }
        }
        expect(g.turn.turnScore, "seed " + seed).toBe(g.turn.carried + heldScore(g.turn));
      }
    }
  });

  it("keeps no award for a die that has been thrown again", () => {
    // Across many seeds: after any throw, every award standing must belong to
    // dice that are still held — a re-thrown die can never still be paying.
    for (let seed = 1; seed <= 100; seed++) {
      let g = createGame(players, { goal: 100000, seed });
      for (let roll = 0; roll < 5 && !g.turn.outcome; roll++) {
        const thrown = diceToRoll(g.turn);
        g = applyAction(g, { type: "ROLL" });
        if (g.turn.outcome) break;
        const stale = g.turn.awards.filter((a) => a.dice.some((i) => !g.turn.locked[i]));
        expect(stale, "seed " + seed + " threw " + thrown.join(",")).toEqual([]);
      }
    }
  });
});
