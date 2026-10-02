import { describe, expect, it } from "vitest";
import { isWinner, scoreFor, teamTotal } from "@greed/core";
import { summarize } from "../../game/profile.js";
import { createPolishMatch, createPolishSetup, createPolishTableEvent } from "./polishFixtures.js";

describe("polish review samples", () => {
  it.each([2, 3, 4, 5, 6, 7, 8])(
    "finishes a real %i-seat game without invented totals",
    (count) => {
      const { initial, completed } = createPolishMatch(createPolishSetup(count));
      expect(initial.players).toHaveLength(count);
      expect(initial.players.every((p) => p.total === 0)).toBe(true);
      expect(completed.phase).toBe("game-over");
      expect(completed.players.find((p) => p.id === completed.winnerId)?.total).toBe(
        Math.max(...completed.players.map((p) => p.total)),
      );
      for (const player of completed.players) {
        const earned = completed.log.reduce(
          (total, e) => total + (e.type === "bank" && e.playerId === player.id ? e.gained : 0),
          0,
        );
        expect(player.total).toBe(earned);
        expect(summarize(completed, player.id).finalTotal).toBe(earned);
      }
      expect(initial.log).toHaveLength(1);
    },
  );

  it.each([4, 6])("provides a real final round and team win for %i seats", (count) => {
    const { finalRound, completed } = createPolishMatch(createPolishSetup(count, true, true, true));
    expect(completed.teams?.map((side) => side.length)).toEqual([count / 2, count / 2]);
    expect(finalRound?.endgame.triggered).toBe(true);
    expect(finalRound?.phase).toBe("playing");
    const trigger = finalRound!.players.findIndex(
      (p) => p.id === finalRound!.endgame.triggerPlayerId,
    );
    expect(scoreFor(finalRound!, trigger)).toBeGreaterThanOrEqual(finalRound!.config.goal);
    expect(teamTotal(completed, completed.winnerTeam!)).toBe(
      Math.max(teamTotal(completed, 0), teamTotal(completed, 1)),
    );
    expect(completed.players.filter((p) => isWinner(completed, p.id))).toHaveLength(count / 2);
    expect(completed.players.every((p) => !p.isBot)).toBe(true);
  });

  it("replays bank, bust and hot dice scripts for the reviewed identities and sides", () => {
    const setup = createPolishSetup(4, true, true, true);
    const bank = createPolishTableEvent("bank", setup);
    expect(bank.turn.outcome).toBe("banked");
    expect(bank.players[bank.turn.playerIndex].total).toBe(100);
    expect(bank.players[0].name).toBe(setup.seats[0].name);
    expect(bank.teams).not.toBeNull();
    const bust = createPolishTableEvent("bust", setup);
    expect(bust.turn.outcome).toBe("busted");
    expect(bust.turn.turnScore).toBe(0);
    const hot = createPolishTableEvent("hot", setup);
    expect(hot.turn.hotDice).toBe(true);
    expect(hot.turn.locked.every(Boolean)).toBe(true);
    expect(hot.turn.rollCount).toBe(2);
  });

  it("rejects impossible reviewed tables instead of presenting a fake team result", () => {
    expect(() => createPolishSetup(1)).toThrow();
    expect(() => createPolishSetup(9)).toThrow();
    expect(() => createPolishSetup(8, true)).toThrow();
  });
});
