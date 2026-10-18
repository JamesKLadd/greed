import { describe, expect, it } from "vitest";
import {
  applyAction,
  createGame,
  createTurn,
  refreshTurn,
  type GameState,
  type TurnState,
} from "@greed/core";
import { decide } from "./strategies.js";

function game(teams = false): GameState {
  const n = teams ? 4 : 3;
  return createGame(
    Array.from({ length: n }, (_, i) => ({
      id: String(i),
      name: `Bot ${i}`,
      isBot: true,
      botPersonality: "balanced" as const,
      ...(teams ? { team: i % 2 } : {}),
    })),
    { goal: 3000, seed: 7, order: Array.from({ length: n }, (_, i) => i) },
  );
}

function bankAndAdvance(state: GameState, points: number): GameState {
  const banked = applyAction(
    { ...state, turn: { ...state.turn, turnScore: points } },
    { type: "BANK" },
  );
  return applyAction(banked, { type: "ADVANCE" });
}

function hotTurn(playerIndex: number): TurnState {
  // Four fives scored across separate throws plus a one: a legal 300-point
  // clear, rather than the 650 that all five faces in one throw would earn.
  const turn: TurnState = {
    ...createTurn(playerIndex),
    dice: [1, 5, 5, 5, 5],
    locked: [true, true, true, true, true],
    awards: [
      { kind: "ones", face: 1, dice: [0], points: 100 },
      ...[1, 2, 3, 4].map((i) => ({
        kind: "fives" as const,
        face: 5 as const,
        dice: [i],
        points: 50,
      })),
    ],
    rollCount: 3,
    awaitingDecision: true,
  };
  refreshTurn(turn);
  return turn;
}

function oneDieTurn(playerIndex: number): TurnState {
  const turn: TurnState = {
    ...createTurn(playerIndex),
    dice: [1, 1, 1, 1, 2],
    locked: [true, true, true, true, false],
    awards: [0, 1, 2, 3].map((i) => ({
      kind: "ones",
      face: 1,
      dice: [i],
      points: 100,
    })),
    rollCount: 1,
    awaitingDecision: true,
  };
  refreshTurn(turn);
  return turn;
}

function suddenDeath(): GameState {
  let state = game();
  state = bankAndAdvance(state, 3000);
  state = bankAndAdvance(state, 3000);
  state = applyAction(state, { type: "SKIP" });
  state = applyAction(state, { type: "ADVANCE" });
  expect(state.phase).toBe("sudden-death");
  expect(state.suddenDeath?.contenders).toEqual([0, 1]);
  return state;
}

describe("bots play the remaining final-round turns", () => {
  it("keeps evaluating a hot-dice lead when another opponent still has a response", () => {
    let state = game();
    [2600, 2800, 2700].forEach((total, i) => (state.players[i].total = total));
    state = bankAndAdvance(state, 400);
    expect(state.endgame.triggered).toBe(true);
    expect(state.turn.playerIndex).toBe(1);
    state.turn = hotTurn(1); // Banking would lead 3100 to 3000, before seat 2 acts.
    expect(decide(state)).toEqual({ type: "ROLL" });
  });

  it("does not immediately bank the first sudden-death contender's positive throw", () => {
    const state = suddenDeath();
    state.turn = hotTurn(0);
    expect(decide(state)).toEqual({ type: "ROLL" });
  });

  it("secures a sudden-death win at the last active contender, not the original anchor", () => {
    let state = suddenDeath();
    state = bankAndAdvance(state, 100);
    expect(state.turn.playerIndex).toBe(1);
    expect(state.order.at(-1)).toBe(2);
    state.turn = hotTurn(1); // 3300 beats 3100; no active opponent remains.
    expect(decide(state, { personality: "reckless" })).toEqual({ type: "BANK" });
  });

  it("can improve a tie on hot dice instead of automatically repeating sudden death", () => {
    let state = suddenDeath();
    state = bankAndAdvance(state, 300);
    state.turn = hotTurn(1); // 3300 ties the contender who already finished.
    expect(decide(state)).toEqual({ type: "ROLL" });
  });

  it("can protect a tie with one risky die rather than being forced to roll", () => {
    let state = suddenDeath();
    state = bankAndAdvance(state, 400);
    state.turn = oneDieTurn(1); // 3400 ties; banking guarantees another chance.
    expect(decide(state)).toEqual({ type: "BANK" });
  });
});

describe("bots play for the team's shared score", () => {
  it("banks an anchor's guaranteed win when partners together reach the goal", () => {
    const state = game(true);
    [1400, 2700, 1400, 100].forEach((total, i) => (state.players[i].total = total));
    state.turnPointer = 3;
    state.turn = hotTurn(3); // Own 100+2700+300 reaches 3100; personal total is only 400.
    expect(decide(state, { personality: "reckless" })).toEqual({ type: "BANK" });
    expect(applyAction(state, { type: "BANK" }).winnerTeam).toBe(1);
  });

  it("chases the opposing team's combined total in the final round", () => {
    let state = game(true);
    [1000, 1300, 1000, 1600].forEach((total, i) => (state.players[i].total = total));
    state = applyAction(state, { type: "SKIP" });
    state = applyAction(state, { type: "ADVANCE" });
    state = bankAndAdvance(state, 300); // Opposing side reaches 3200 and triggers.
    state.turn = oneDieTurn(2); // 2400 still trails, despite leading either rival's 1600.
    expect(state.endgame.triggered).toBe(true);
    expect(decide(state, { personality: "cautious" })).toEqual({ type: "ROLL" });
  });

  it("does not treat a leading teammate as a rival to catch", () => {
    const state = game(true);
    [0, 1000, 2200, 1100].forEach((total, i) => (state.players[i].total = total));
    state.turn = oneDieTurn(0);
    expect(decide(state, { personality: "cautious" })).toEqual({ type: "BANK" });
  });
});
