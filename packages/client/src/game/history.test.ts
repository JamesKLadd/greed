import { describe, expect, it } from "vitest";
import type { DieValue, GameEvent, GameState, ScoreResult } from "@greed/core";
import { buildHistory } from "./history.js";

function result(points: number, hot = false): ScoreResult {
  return { points, scoringMask: [], isHotDice: hot, breakdown: [] };
}

function roll(playerId: string, dice: DieValue[], points: number, hot = false): GameEvent {
  return { type: "roll", playerId, dice, result: result(points, hot) };
}

function st(log: GameEvent[]): GameState {
  return {
    players: [
      { id: "you", name: "You", isBot: false, total: 0 },
      { id: "b", name: "Robo", isBot: true, total: 0 },
    ],
    log,
  } as unknown as GameState;
}

describe("buildHistory", () => {
  it("groups a run of rolls into a single banked turn", () => {
    const recs = buildHistory(
      st([
        { type: "game-start", startPlayerId: "you" },
        roll("you", [1, 5, 2, 3, 4], 150),
        roll("you", [1, 1, 6], 200),
        { type: "bank", playerId: "you", gained: 350, total: 350 },
      ]),
    );
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({
      index: 1,
      playerId: "you",
      playerName: "You",
      outcome: "banked",
      gained: 350,
      total: 350,
    });
    expect(recs[0].rolls).toHaveLength(2);
  });

  it("records a bust with the points lost and no total", () => {
    const recs = buildHistory(
      st([
        roll("b", [1, 5], 150),
        roll("b", [2, 3, 4], 0),
        { type: "bust", playerId: "b", lostPoints: 150 },
      ]),
    );
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({
      outcome: "busted",
      lost: 150,
      total: null,
      playerName: "Robo",
    });
  });

  it("numbers turns sequentially and separates players", () => {
    const recs = buildHistory(
      st([
        roll("you", [1], 100),
        { type: "bank", playerId: "you", gained: 100, total: 100 },
        roll("b", [5], 50),
        { type: "bank", playerId: "b", gained: 50, total: 50 },
      ]),
    );
    expect(recs.map((r) => r.index)).toEqual([1, 2]);
    expect(recs.map((r) => r.playerId)).toEqual(["you", "b"]);
  });

  it("flags a hot-dice roll", () => {
    const recs = buildHistory(
      st([
        roll("you", [1, 1, 1, 5, 5], 400, true),
        { type: "bank", playerId: "you", gained: 400, total: 400 },
      ]),
    );
    expect(recs[0].rolls[0].hot).toBe(true);
  });

  it("tags the turn that triggered the endgame", () => {
    const recs = buildHistory(
      st([
        roll("b", [1], 100),
        { type: "bank", playerId: "b", gained: 2000, total: 2000 },
        { type: "endgame-triggered", playerId: "b" },
      ]),
    );
    expect(recs[0].marker).toBe("endgame");
  });

  it("includes an unfinished final turn as in-progress", () => {
    const recs = buildHistory(st([roll("you", [1, 5], 150)]));
    expect(recs).toHaveLength(1);
    expect(recs[0].outcome).toBe("in-progress");
    expect(recs[0].total).toBeNull();
  });

  it("returns nothing for an empty log", () => {
    expect(buildHistory(st([{ type: "game-start", startPlayerId: "you" }]))).toEqual([]);
  });
});
