import { describe, expect, it } from "vitest";
import {
  applyAction,
  createGame,
  createTurn,
  refreshTurn,
  scoreRoll,
  type BotPersonality,
  type DieValue,
  type GameState,
  type TurnState,
} from "@greed/core";
import { decide } from "./strategies.js";

function scoringTurn(faces: DieValue[]): TurnState {
  const result = scoreRoll(faces);
  const turn: TurnState = {
    ...createTurn(0),
    dice: [...faces, ...new Array<DieValue>(5 - faces.length).fill(2)],
    locked: Array.from({ length: 5 }, (_, i) => i < faces.length),
    awards: result.breakdown.map((award) => ({
      kind: award.kind,
      face: award.face,
      dice: award.indices,
      points: award.points,
    })),
    rollCount: 1,
    awaitingDecision: true,
  };
  refreshTurn(turn);
  return turn;
}

function position(own: number, leader: number, goal = 3000): GameState {
  const state = createGame(
    [
      { id: "bot", name: "Bot", isBot: true, botPersonality: "cautious" },
      { id: "rival", name: "Rival", isBot: false },
    ],
    { goal, seed: 7, order: [0, 1] },
  );
  state.players[0].total = own;
  state.players[1].total = leader;
  state.turn = scoringTurn([1, 5, 5]); // 200 points, two dice left.
  return state;
}

describe("bots adapt their targets to the score gap", () => {
  it.each<BotPersonality>(["cautious", "balanced", "reckless"])(
    "%s rejects a small bank when far behind",
    (personality) => {
      for (const [own, leader] of [
        [0, 900],
        [600, 2400],
        [0, 2800],
      ]) {
        const state = position(own, leader);
        expect(decide(state, { personality })).toEqual({ type: "ROLL" });
      }
    },
  );

  it("lets cautious bots protect the same points in a close race or when leading", () => {
    for (const [own, leader] of [
      [0, 0],
      [600, 900],
      [2400, 400],
    ]) {
      expect(decide(position(own, leader))).toEqual({ type: "BANK" });
    }
  });

  it("raises the target further as a leader with the same gap approaches the goal", () => {
    const early = position(300, 1200);
    const late = position(1900, 2800);
    early.turn = scoringTurn([1, 1, 1]);
    late.turn = scoringTurn([1, 1, 1]);
    expect(decide(early)).toEqual({ type: "BANK" });
    expect(decide(late)).toEqual({ type: "ROLL" });
  });

  it("scales the gap to a custom goal rather than treating every 900-point gap alike", () => {
    expect(decide(position(0, 900))).toEqual({ type: "ROLL" });
    expect(decide(position(0, 900, 9000))).toEqual({ type: "BANK" });
  });

  it("uses a reachable multi-turn target in the middle of a very high-goal game", () => {
    for (const [own, leader] of [
      [20000, 40000],
      [0, 60000],
    ]) {
      const state = position(own, leader, 100000);
      expect(decide(state)).toEqual({ type: "ROLL" });
      state.turn = scoringTurn([6, 6, 6]);
      expect(decide(state)).toEqual({ type: "BANK" });
    }
  });

  it("can bank after earning enough to close the gap", () => {
    const state = position(0, 900);
    state.turn = scoringTurn([6, 6, 6]);
    state.turn.carried = 500; // A previous straight cleared this turn.
    refreshTurn(state.turn);
    expect(decide(state)).toEqual({ type: "BANK" });
  });

  it("takes a guaranteed anchor win even when personality would normally push on", () => {
    const state = position(2800, 2900);
    state.order = [1, 0];
    state.turnPointer = 1;
    expect(decide(state, { personality: "reckless" })).toEqual({ type: "BANK" });
    expect(applyAction(state, { type: "BANK" }).winnerId).toBe("bot");
  });

  it("uses only the visible position without mutating state or consulting the seed", () => {
    const state = position(0, 2800);
    const before = structuredClone(state);
    const action = decide(state);
    expect(state).toEqual(before);
    for (const seed of [0, 42, 0xffffffff]) {
      expect(decide({ ...state, rng: seed, config: { ...state.config, seed } })).toEqual(action);
    }
  });
});
