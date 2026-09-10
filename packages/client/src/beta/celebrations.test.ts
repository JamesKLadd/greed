import { describe, expect, it } from "vitest";
import { createGame, type GameEvent, type GameState } from "@greed/core";
import { readCelebration } from "./celebrations.js";

function game(): GameState {
  return createGame(
    [
      { id: "a", name: "Alice", isBot: false },
      { id: "b", name: "Bob", isBot: false },
    ],
    { goal: 3000, seed: 1, startIndex: 0 },
  );
}
const roll = (points = 100): GameEvent => ({
  type: "roll",
  playerId: "a",
  dice: [1],
  result: { points, isHotDice: false },
});
function add(s: GameState, ...events: GameEvent[]): GameState {
  return { ...s, log: [...s.log, ...events] };
}
function completeFive(s: GameState): GameState {
  return {
    ...s,
    turn: {
      ...s.turn,
      dice: [2, 2, 2, 2, 2],
      locked: [true, true, true, true, true],
      turnScore: 1000,
      hotDice: true,
      lastRoll: { points: 0, scoringMask: [false], breakdown: [], isHotDice: false },
    },
  };
}

describe("beta celebration ordering and recovery", () => {
  it("does not celebrate history on initial mount or a reconnect burst", () => {
    const start = game();
    const historical = add(start, roll(), { type: "bank", playerId: "a", gained: 100, total: 100 });
    expect(readCelebration(historical).cue).toBeNull();
    expect(
      readCelebration(
        add(start, ...Array.from({ length: 8 }, () => roll())),
        readCelebration(start).cursor,
      ).cue,
    ).toBeNull();
  });
  it("recognizes five across throws even when the final throw pays zero individually", () => {
    const before = add(game(), roll(200));
    const snapshot = completeFive(add(before, roll(0), { type: "hot-dice", playerId: "a" }));
    const result = readCelebration(snapshot, readCelebration(before).cursor);
    expect(result.cue).toEqual({ kind: "five", player: "Alice" });
    expect(snapshot.turn.turnScore).toBe(1000);
    expect(readCelebration(structuredClone(snapshot), result.cursor).cue).toBeNull();
    const unheld = {
      ...snapshot,
      turn: { ...snapshot.turn, locked: [true, true, true, true, false] },
    };
    const next = readCelebration(unheld, result.cursor);
    expect(readCelebration(snapshot, next.cursor).cue).toBeNull();
  });
  it("allows the next hot-dice hand to celebrate again", () => {
    const initial = game();
    const first = completeFive(add(initial, roll(), { type: "hot-dice", playerId: "a" }));
    const cursor = readCelebration(first, readCelebration(initial).cursor).cursor;
    const next = completeFive(add(first, roll(), { type: "hot-dice", playerId: "a" }));
    expect(readCelebration(next, cursor).cue?.kind).toBe("five");
  });
  it("chooses one victory cue over banking and auto-win", () => {
    const s = game();
    const finish = add(
      s,
      { type: "bank", playerId: "a", gained: 1500, total: 3000 },
      { type: "auto-win", playerId: "a" },
      { type: "game-over", winnerId: "a" },
    );
    expect(readCelebration(finish, readCelebration(s).cursor).cue).toEqual({
      kind: "win",
      player: "Alice",
    });
  });
  it("keeps ordinary hot dice, banks and busts distinct", () => {
    const s = game();
    const cursor = readCelebration(s).cursor;
    expect(
      readCelebration(add(s, roll(), { type: "hot-dice", playerId: "a" }), cursor).cue?.kind,
    ).toBe("hot");
    expect(
      readCelebration(add(s, { type: "bank", playerId: "a", gained: 900, total: 900 }), cursor).cue
        ?.kind,
    ).toBe("bank");
    expect(
      readCelebration(add(s, { type: "bank", playerId: "a", gained: 1000, total: 1000 }), cursor)
        .cue?.kind,
    ).toBe("bigBank");
    expect(
      readCelebration(add(s, { type: "bust", playerId: "a", lostPoints: 500 }), cursor).cue,
    ).toEqual({ kind: "bust", points: 500, player: "Alice" });
  });
  it("resynchronizes rematches without applauding the previous hand", () => {
    const s = add(game(), roll(), roll());
    const fresh = game();
    const reset = readCelebration(fresh, readCelebration(s).cursor);
    expect(reset.cue).toBeNull();
    expect(readCelebration(add(fresh, roll()), reset.cursor).cue?.kind).toBe("score");
  });
});
