import { describe, expect, it } from "vitest";
import {
  applyAction,
  createGame,
  createTurn,
  diceRemaining,
  diceToRoll,
  refreshTurn,
  type DieValue,
  type TurnAward,
  type TurnState,
} from "@greed/core";
import { rollModel, turnRollModel, type RollModel } from "./probabilities.js";

function heldTurn(dice: DieValue[], held: number, awards: TurnAward[]): TurnState {
  const turn = {
    ...createTurn(0),
    dice,
    locked: dice.map((_, i) => i < held),
    awards,
    rollCount: 1,
    awaitingDecision: true,
  };
  refreshTurn(turn);
  return turn;
}

function singles(face: 1 | 5, indices: number[]): TurnAward[] {
  return indices.map((i) => ({
    kind: face === 1 ? "ones" : "fives",
    face,
    dice: [i],
    points: face === 1 ? 100 : 50,
  }));
}

/** Run each distinct throw through the actual engine once, not its bot model. */
function engineOutcomes(turn: TurnState): RollModel {
  const indices = diceToRoll(turn);
  const total = 6 ** indices.length;
  const observed = new Set<string>();
  const transitions = new Map<string, { p: number; gain: number; kNext: number }>();
  const base = createGame(
    [
      { id: "a", name: "a", isBot: true },
      { id: "b", name: "b", isBot: true },
    ],
    { goal: 3000, seed: 1, order: [0, 1] },
  );
  let busts = 0;
  for (let seed = 1; seed < 50_000 && observed.size < total; seed++) {
    const next = applyAction({ ...base, rng: seed, turn }, { type: "ROLL" });
    const faces = indices.map((i) => next.turn.dice[i]).join("");
    if (observed.has(faces)) continue;
    observed.add(faces);
    if (next.turn.busted) {
      busts++;
      continue;
    }
    const gain = next.turn.turnScore - turn.turnScore;
    const kNext = diceRemaining(next.turn);
    const key = `${gain}|${kNext}`;
    const existing = transitions.get(key);
    if (existing) existing.p++;
    else transitions.set(key, { p: 1, gain, kNext });
  }
  expect(observed.size).toBe(total);
  return {
    bustProb: busts / total,
    transitions: [...transitions.values()].map((t) => ({ ...t, p: t.p / total })),
  };
}

function ordered(model: RollModel): RollModel {
  return {
    ...model,
    transitions: [...model.transitions].sort((a, b) => a.gain - b.gain || a.kNext - b.kNext),
  };
}

describe("visible held-hand roll model", () => {
  it("counts an assembled straight even though the new dice score nothing alone", () => {
    const turn = heldTurn([1, 5, 2, 2, 6], 2, [...singles(1, [0]), ...singles(5, [1])]);
    const model = turnRollModel(turn);
    expect(model.bustProb).toBeCloseTo(rollModel(3).bustProb - 6 / 216, 12);
    expect(model.transitions.find((t) => t.gain === 350 && t.kNext === 5)?.p).toBeCloseTo(
      6 / 216,
      12,
    );
    expect(ordered(model)).toEqual(ordered(engineOutcomes(turn)));
  });

  it("replaces four held ones with the five-of-a-kind award", () => {
    const turn = heldTurn([1, 1, 1, 1, 2], 4, singles(1, [0, 1, 2, 3]));
    const model = turnRollModel(turn);
    expect(model.bustProb).toBeCloseTo(4 / 6, 12);
    expect(model.transitions.find((t) => t.gain === 600 && t.kNext === 5)?.p).toBeCloseTo(
      1 / 6,
      12,
    );
    expect(ordered(model)).toEqual(ordered(engineOutcomes(turn)));
  });

  it("retains award provenance when four identical held faces have different scores", () => {
    const separateThrows = heldTurn([5, 5, 5, 5, 2], 4, singles(5, [0, 1, 2, 3]));
    const sameThrow = heldTurn([5, 5, 5, 5, 2], 4, [
      { kind: "triple", face: 5, dice: [0, 1, 2], points: 500 },
      ...singles(5, [3]),
    ]);
    expect(separateThrows.turnScore).toBe(200);
    expect(sameThrow.turnScore).toBe(550);
    const separateModel = turnRollModel(separateThrows);
    const sameModel = turnRollModel(sameThrow);
    expect(separateModel).not.toBe(sameModel);
    expect(separateModel.transitions.find((t) => t.gain === 800)?.p).toBeCloseTo(1 / 6, 12);
    expect(sameModel.transitions.find((t) => t.gain === 450)?.p).toBeCloseTo(1 / 6, 12);
    expect(ordered(separateModel)).toEqual(ordered(engineOutcomes(separateThrows)));
    expect(ordered(sameModel)).toEqual(ordered(engineOutcomes(sameThrow)));
  });

  it("rescues five of a kind on non-scoring faces", () => {
    const turn = heldTurn([2, 2, 2, 3, 4], 3, [
      { kind: "triple", face: 2, dice: [0, 1, 2], points: 200 },
    ]);
    const model = turnRollModel(turn);
    expect(model.bustProb).toBeCloseTo(rollModel(2).bustProb - 1 / 36, 12);
    expect(model.transitions.find((t) => t.gain === 800 && t.kNext === 5)?.p).toBeCloseTo(
      1 / 36,
      12,
    );
    expect(ordered(model)).toEqual(ordered(engineOutcomes(turn)));
  });

  it("reuses cached visible outcomes regardless of carried score or loose die faces", () => {
    const turn = heldTurn([1, 1, 1, 1, 2], 4, singles(1, [0, 1, 2, 3]));
    const carried = { ...turn, carried: 800, turnScore: 1200, dice: [1, 1, 1, 1, 6] as DieValue[] };
    expect(turnRollModel(carried)).toBe(turnRollModel(turn));
  });

  it("uses the ordinary five-dice model for fresh and hot dice", () => {
    expect(turnRollModel(createTurn(0))).toBe(rollModel(5));
    const hot = heldTurn([1, 1, 1, 5, 5], 5, [...singles(1, [0, 1, 2]), ...singles(5, [3, 4])]);
    expect(hot.hotDice).toBe(true);
    expect(turnRollModel(hot)).toBe(rollModel(5));
  });

  it("does not invent hot dice when a human left a non-paying die held", () => {
    // The player held a non-paying 2, then released the only paying 1.
    const turn = heldTurn([2, 1, 4, 6, 2], 1, singles(1, [1]));
    const model = turnRollModel(turn);
    expect(model.transitions.some((t) => t.gain === 400 && t.kNext === 0)).toBe(true);
    expect(model.bustProb + model.transitions.reduce((sum, t) => sum + t.p, 0)).toBeCloseTo(1, 12);
  });

  it("preserves all outcome probability without changing the input turn", () => {
    const turn = heldTurn([5, 5, 5, 5, 2], 4, singles(5, [0, 1, 2, 3]));
    const before = structuredClone(turn);
    const model = turnRollModel(turn);
    expect(model.bustProb + model.transitions.reduce((sum, t) => sum + t.p, 0)).toBeCloseTo(1, 12);
    expect(turn).toEqual(before);
  });
});
