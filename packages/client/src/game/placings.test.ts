import { describe, expect, it } from "vitest";
import type { GameState } from "@greed/core";
import { placings } from "./placings.js";

const label = (side: number) => `Side ${side}`;

/** A table of four, scores supplied. `teams` pairs seats 0+2 against 1+3. */
function table(totals: number[], teams = false): GameState {
  return {
    players: totals.map((total, i) => ({
      id: `p${i}`,
      name: `P${i}`,
      isBot: i > 0,
      total,
      team: teams ? i % 2 : undefined,
    })),
    teams: teams
      ? [
          totals.map((_, i) => i).filter((i) => i % 2 === 0),
          totals.map((_, i) => i).filter((i) => i % 2 === 1),
        ]
      : null,
  } as unknown as GameState;
}

describe("placings", () => {
  it("ranks players by banked total, best first", () => {
    const rows = placings(table([300, 1200, 0, 800]), "p0", label);
    expect(rows.map((r) => r.name)).toEqual(["P1", "P3", "P0", "P2"]);
    expect(rows.map((r) => r.place)).toEqual([1, 2, 3, 4]);
    expect(rows.map((r) => r.score)).toEqual([1200, 800, 300, 0]);
  });

  it("reports the gap to the leader on every line but the leader's", () => {
    const rows = placings(table([300, 1200, 0, 800]), "p0", label);
    expect(rows.map((r) => r.behind)).toEqual([0, 400, 900, 1200]);
  });

  it("gives level scores the same place, and skips the ones they use up", () => {
    // Otherwise a fresh table (everyone on 0) shows an arbitrary 1-2-3-4 that
    // reshuffles on the first bank.
    const rows = placings(table([500, 500, 500, 100]), "p0", label);
    expect(rows.map((r) => r.place)).toEqual([1, 1, 1, 4]);
  });

  it("keeps level lines in seat order rather than reshuffling them", () => {
    const rows = placings(table([0, 0, 0, 0]), "p0", label);
    expect(rows.map((r) => r.name)).toEqual(["P0", "P1", "P2", "P3"]);
  });

  it("marks the viewer's own line", () => {
    const rows = placings(table([300, 1200, 0, 800]), "p2", label);
    expect(rows.filter((r) => r.isYou).map((r) => r.name)).toEqual(["P2"]);
  });

  it("places a team game by side, not by seat", () => {
    // The bug this guards: a player's own total is only their contribution, so
    // ranking seats in a team game shows a player leading a game their side is
    // losing. Side 0 = seats 0+2 = 100+200 = 300; side 1 = seats 1+3 = 1000.
    const rows = placings(table([100, 1000, 200, 0], true), "p0", label);
    expect(rows.map((r) => r.name)).toEqual(["Side 1", "Side 0"]);
    expect(rows.map((r) => r.score)).toEqual([1000, 300]);
    expect(rows.map((r) => r.behind)).toEqual([0, 700]);
  });

  it("lists a side's members by contribution, and yours is your side's", () => {
    const rows = placings(table([100, 1000, 200, 0], true), "p0", label);
    const mine = rows.find((r) => r.isYou);
    expect(mine?.name).toBe("Side 0"); // your side, though you are last on it
    expect(mine?.members.map((m) => m.name)).toEqual(["P2", "P0"]);
    expect(mine?.members.map((m) => m.isYou)).toEqual([false, true]);
  });
});
