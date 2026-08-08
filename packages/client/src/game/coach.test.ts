import { describe, expect, it } from "vitest";
import type { GameState } from "@greed/core";
import { coachHint } from "./coach.js";

function st(over: Record<string, unknown> = {}): GameState {
  return {
    phase: "playing",
    winnerId: null,
    players: [
      { id: "you", name: "You", isBot: false, total: 0 },
      { id: "b", name: "Bot", isBot: true, total: 0 },
    ],
    endgame: { triggered: false },
    turn: { playerIndex: 0, outcome: null, turnScore: 0, lastRoll: null, hotDice: false },
    ...over,
  } as unknown as GameState;
}

describe("coachHint", () => {
  it("prompts to roll at the start of your turn", () => {
    const h = coachHint(st(), true);
    expect(h?.tone).toBe("info");
    expect(h?.key).toBe("coach.rollToStart");
  });

  it("offers the roll-or-bank choice after scoring", () => {
    const h = coachHint(
      st({ turn: { playerIndex: 0, turnScore: 150, lastRoll: {}, hotDice: false } }),
      true,
    );
    expect(h?.key).toBe("coach.rollOrBank");
    expect(h?.params).toMatchObject({ points: 150 });
  });

  it("celebrates hot dice", () => {
    const h = coachHint(
      st({ turn: { playerIndex: 0, turnScore: 300, lastRoll: {}, hotDice: true } }),
      true,
    );
    expect(h?.tone).toBe("good");
    expect(h?.key).toBe("coach.hotDice");
  });

  it("explains a bust and a bank", () => {
    expect(coachHint(st({ turn: { playerIndex: 0, outcome: "busted" } }), true)?.tone).toBe("bad");
    const banked = coachHint(
      st({ turn: { playerIndex: 0, outcome: "banked", turnScore: 200 } }),
      true,
    );
    expect(banked?.tone).toBe("good");
    expect(banked?.key).toBe("coach.banked");
  });

  it("warns during the final round", () => {
    const h = coachHint(st({ endgame: { triggered: true } }), true);
    expect(h?.tone).toBe("warn");
    expect(h?.key).toBe("coach.finalRound");
  });

  it("narrates the opponent when it is not your turn", () => {
    const h = coachHint(st({ turn: { playerIndex: 1 } }), false);
    expect(h?.key).toBe("coach.watching");
    expect(h?.params).toMatchObject({ name: "Bot" });
  });

  it("announces the winner at game over", () => {
    const h = coachHint(st({ phase: "game-over", winnerId: "b" }), false);
    expect(h?.key).toBe("coach.gameOver");
    expect(h?.params).toMatchObject({ name: "Bot" });
  });
});
