import { describe, expect, it } from "vitest";
import { applyAction, diceToRoll, getLegalActions, isFiveOfAKind, scoreRoll } from "@greed/core";
import { readCelebration } from "../../beta/celebrations.js";
import { rollCall } from "../../game/rollCall.js";
import { createTableEventFixture, TABLE_EVENTS } from "./tableEventFixtures.js";

describe("deterministic Table D review transitions", () => {
  for (const count of [2, 3, 4, 5, 6, 7, 8]) {
    it(`replays every fixture through legal core actions for ${count} seats`, () => {
      for (const { id } of TABLE_EVENTS) {
        const fixture = createTableEventFixture(id, count);
        let before = fixture.initial;
        for (const action of fixture.setupActions) before = applyAction(before, action);
        expect(before).toEqual(fixture.before);
        const legal = getLegalActions(before);
        expect(fixture.action.type === "ROLL" ? legal.canRoll : legal.canBank).toBe(true);
        expect(applyAction(before, fixture.action)).toEqual(fixture.after);
        expect(fixture.after.log.slice(0, before.log.length)).toEqual(before.log);
        expect(fixture.after.turn.dice).toHaveLength(5);
        expect(fixture.after.turn.locked).toHaveLength(5);
        expect(fixture.after.players).toHaveLength(count);
        expect(fixture.after.order[fixture.after.turnPointer]).toBe(fixture.after.turn.playerIndex);
        expect(readCelebration(fixture.after, readCelebration(before).cursor).cue?.kind).toBe(
          fixture.expected,
        );
        // Opening a fixture on an already-finished snapshot remains silent,
        // matching mount/reconnect behavior in the real game.
        expect(readCelebration(fixture.after).cue).toBeNull();
      }
    });
  }

  it("has real current-throw triples, including 1s paid as three hundreds", () => {
    const triple = createTableEventFixture("triple").after;
    expect(triple.turn.lastRoll?.breakdown.find((b) => b.kind === "triple")?.face).toBe(2);
    const ones = createTableEventFixture("ones").after;
    expect(ones.turn.dice.filter((d) => d === 1)).toHaveLength(3);
    expect(ones.turn.turnScore).toBe(300);
    expect(ones.turn.lastRoll?.breakdown.some((b) => b.kind === "triple")).toBe(false);
    expect(rollCall(ones.turn)).toBe("triple");
  });

  it("keeps the straight as the main title when it also clears all five dice", () => {
    const { before, after } = createTableEventFixture("straight");
    expect(new Set(after.turn.dice).size).toBe(5);
    expect(after.turn.lastRoll?.breakdown[0].kind).toBe("straight");
    expect(after.turn.turnScore).toBe(500);
    expect(after.turn.hotDice).toBe(true);
    expect(after.log.slice(before.log.length).map((e) => e.type)).toEqual(["roll", "hot-dice"]);
  });

  it("builds five 2s over two throws without falsely busting on the completing die", () => {
    const { before, after } = createTableEventFixture("fiveAcross");
    expect(before.turn.dice.filter((d, i) => d === 2 && before.turn.locked[i])).toHaveLength(4);
    expect(diceToRoll(before.turn)).toEqual([1]);
    expect(before.turn.rollCount).toBe(1);
    expect(after.turn.rollCount).toBe(2);
    expect(after.turn.lastRoll?.points).toBe(0);
    expect(isFiveOfAKind(after.turn)).toBe(true);
    expect(after.turn.turnScore).toBe(1000);
    expect(after.turn.busted).toBe(false);
  });

  it("clears two successive mats and carries the first hand into the next", () => {
    const { initial, before, after } = createTableEventFixture("hot");
    expect(before.turn.hotDice).toBe(true);
    expect(after.turn.hotDice).toBe(true);
    expect(diceToRoll(before.turn)).toEqual([0, 1, 2, 3, 4]);
    expect(after.turn.carried).toBe(before.turn.turnScore);
    expect(after.turn.turnScore).toBe(before.turn.turnScore + scoreRoll(after.turn.dice).points);
    expect(after.log.filter((e) => e.type === "hot-dice")).toHaveLength(2);
    const first = readCelebration(before, readCelebration(initial).cursor);
    expect(first.cue).not.toBeNull();
    const second = readCelebration(after, first.cursor);
    expect(second.cue?.kind).toBe("hot");
    expect(readCelebration(after, second.cursor).cue).toBeNull();
  });

  it("forfeits only the risked amount on a real second-roll bust", () => {
    const { before, after } = createTableEventFixture("bust");
    expect(before.turn.turnScore).toBeGreaterThan(0);
    expect(after.turn.lastRoll?.points).toBe(0);
    expect(after.turn.outcome).toBe("busted");
    expect(after.turn.turnScore).toBe(0);
    expect(after.players.map((p) => p.total)).toEqual(before.players.map((p) => p.total));
    expect(after.log.at(-1)).toMatchObject({ type: "bust", lostPoints: before.turn.turnScore });
  });

  it.each(["bank", "bigBank", "victory"] as const)(
    "credits only the active player for %s",
    (id) => {
      const { before, after } = createTableEventFixture(id);
      after.players.forEach((player, index) => {
        expect(player.total - before.players[index].total).toBe(
          index === before.turn.playerIndex ? before.turn.turnScore : 0,
        );
      });
      expect(after.turn.outcome).toBe("banked");
      if (id === "victory") {
        expect(after.phase).toBe("game-over");
        expect(after.winnerId).toBe(after.players[after.order.at(-1)!].id);
        expect(after.log.slice(before.log.length).map((e) => e.type)).toEqual([
          "bank",
          "auto-win",
          "game-over",
        ]);
      }
    },
  );
});
