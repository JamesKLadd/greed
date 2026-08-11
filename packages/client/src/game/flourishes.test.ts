import { describe, expect, it } from "vitest";
import type { GameState, GameEvent, TurnState } from "@greed/core";
import { bigBankers, streakFlames, streakStep } from "./flourishes.js";

function turn(over: Partial<TurnState> = {}): TurnState {
  return { playerIndex: 0, rollCount: 0, ...over } as unknown as TurnState;
}

function st(log: GameEvent[], over: Record<string, unknown> = {}): GameState {
  return {
    phase: "playing",
    winnerId: null,
    players: [
      { id: "you", name: "You", isBot: false, total: 0 },
      { id: "b", name: "Bot", isBot: true, total: 0 },
    ],
    turn: turn({ playerIndex: 0 }),
    log,
    ...over,
  } as unknown as GameState;
}

describe("streak flames", () => {
  it("stays cold until the fourth roll of a turn", () => {
    expect(streakFlames(turn({ rollCount: 0 }))).toBe(0);
    expect(streakFlames(turn({ rollCount: 3 }))).toBe(0);
    expect(streakFlames(turn({ rollCount: 4 }))).toBe(1);
  });

  it("adds a flame per roll but stops short of crowding the number out", () => {
    expect(streakFlames(turn({ rollCount: 6 }))).toBe(3);
    expect(streakFlames(turn({ rollCount: 20 }))).toBe(5);
  });

  it("keeps escalating the sound after the flames have capped", () => {
    // The audio climbing past the visual cap is deliberate: a 12-roll turn
    // should still sound bigger than an 8-roll one.
    expect(streakStep(4)).toBe(0);
    expect(streakStep(9)).toBe(5);
    expect(streakStep(1)).toBe(0);
  });
});

describe("big bankers", () => {
  const bank = (playerId: string, gained: number): GameEvent =>
    ({ type: "bank", playerId, gained, total: gained }) as GameEvent;
  const bust = (playerId: string): GameEvent =>
    ({ type: "bust", playerId, lostPoints: 0 }) as GameEvent;

  it("badges a player who banked big and is now waiting", () => {
    // Seat 0 is on the clock, so the badge belongs to seat 1.
    expect([...bigBankers(st([bank("b", 1200)]))]).toEqual(["b"]);
  });

  it("ignores a bank under the threshold", () => {
    expect(bigBankers(st([bank("b", 950)])).size).toBe(0);
    // The threshold itself counts.
    expect(bigBankers(st([bank("b", 1000)])).has("b")).toBe(true);
  });

  it("drops the badge once that player's next turn starts", () => {
    const log = [bank("b", 1500)];
    expect(bigBankers(st(log)).has("b")).toBe(true);
    const theirTurn = st(log, { turn: turn({ playerIndex: 1 }) });
    expect(bigBankers(theirTurn).has("b")).toBe(false);
  });

  it("only looks at each player's most recent turn", () => {
    // A big bank two turns ago is old news once they've had another turn.
    expect(bigBankers(st([bank("b", 1200), bust("b")])).has("b")).toBe(false);
    expect(bigBankers(st([bust("b"), bank("b", 1200)])).has("b")).toBe(true);
  });

  it("keeps the badge on at game over, when nobody is on the clock", () => {
    const over = st([bank("you", 1100)], { phase: "game-over", winnerId: "you" });
    expect(bigBankers(over).has("you")).toBe(true);
  });
});
