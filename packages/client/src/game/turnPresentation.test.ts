import { describe, expect, it } from "vitest";
import { applyAction, canToggleLock } from "@greed/core";
import { createTableEventFixture } from "../dev/tablePrototype/tableEventFixtures.js";
import { pointsAtRisk, shownHeldDie } from "./turnPresentation.js";

describe("resolved versus unbanked table points", () => {
  it("removes a banked hand from risk without changing its recorded bank or total", () => {
    const { before, after } = createTableEventFixture("bank");
    expect(pointsAtRisk(before)).toBe(100);
    expect(after.turn.turnScore).toBe(100);
    expect(pointsAtRisk(after)).toBe(0);
    expect(after.players[after.turn.playerIndex].total).toBe(100);
  });
  it("does not present a bust's lost points as an amount still available to bank", () => {
    const { before, after } = createTableEventFixture("bust");
    expect(pointsAtRisk(before)).toBeGreaterThan(0);
    expect(after.turn.outcome).toBe("busted");
    expect(pointsAtRisk(after)).toBe(0);
    expect(after.players.map((p) => p.total)).toEqual(before.players.map((p) => p.total));
  });
  it("clears the risk readout for a won game", () => {
    const { after } = createTableEventFixture("victory");
    expect(after.phase).toBe("game-over");
    expect(pointsAtRisk(after)).toBe(0);
  });
});

describe("hot-dice held indicators", () => {
  it("matches the held hand and allows a die to be released before taking fresh dice", () => {
    const { after } = createTableEventFixture("straight");
    expect(after.turn.hotDice).toBe(true);
    expect(after.turn.dice.map((_, i) => shownHeldDie(after.turn, i, false))).toEqual(
      after.turn.locked,
    );
    expect(canToggleLock(after.turn, 0)).toBe(true);
    const released = applyAction(after, { type: "TOGGLE_LOCK", index: 0 });
    expect(shownHeldDie(released.turn, 0, false)).toBe(false);
    expect(shownHeldDie(released.turn, 1, false)).toBe(true);
  });
  it("clears a hot hand's markers during the fresh five roll but retains normal held dice", () => {
    const hot = createTableEventFixture("straight").after.turn;
    expect(hot.dice.map((_, i) => shownHeldDie(hot, i, true))).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
    const held = createTableEventFixture("bank").before.turn;
    expect(held.dice.map((_, i) => shownHeldDie(held, i, true))).toEqual(held.locked);
  });
});
