import { describe, expect, it } from "vitest";
import { createGame } from "@greed/core";
import { readTableFeedback } from "./tableFeedback.js";
import { readCelebration } from "./celebrations.js";

describe("banked score feedback", () => {
  const start = createGame(
    [
      { id: "a", name: "A", isBot: false },
      { id: "b", name: "B", isBot: false },
    ],
    { seed: 1, goal: 3000 },
  );
  it("targets the bank event's owner even if the turn has already advanced", () => {
    const after = {
      ...start,
      turn: { ...start.turn, playerIndex: 1 },
      log: [...start.log, { type: "bank", playerId: "a", gained: 650, total: 650 } as const],
    };
    expect(readTableFeedback(after, readCelebration(start).cursor).banked).toEqual({
      playerId: "a",
      points: 650,
      sequence: after.log.length,
    });
    expect(readTableFeedback(after)).toEqual({});
    expect(readTableFeedback(after, readCelebration(after).cursor)).toEqual({});
  });
  it("does not remove a banked total on bust or animate reconnect totals", () => {
    const after = {
      ...start,
      log: [...start.log, { type: "bust", playerId: "a", lostPoints: 600 } as const],
    };
    expect(readTableFeedback(after, readCelebration(start).cursor)).toEqual({ bustedId: "a" });
    const reconnect = { ...start, players: start.players.map((p) => ({ ...p, total: 1200 })) };
    expect(readTableFeedback(reconnect, readCelebration(start).cursor)).toEqual({});
  });
});
