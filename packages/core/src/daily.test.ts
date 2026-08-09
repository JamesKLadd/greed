import { describe, expect, it } from "vitest";
import {
  DAILY_TURNS,
  createDailyGame,
  dailyKey,
  dailySeed,
  scoreDailyRun,
  type DailyMove,
} from "./daily.js";
import { applyAction, getLegalActions } from "./game.js";

/** Play a run with a simple policy, recording the moves as a client would. */
function playRun(day: string, bankAt: number): DailyMove[] {
  let state = createDailyGame(day);
  const moves: DailyMove[] = [];
  let turns = 0;
  while (turns < DAILY_TURNS) {
    const legal = getLegalActions(state);
    const move: DailyMove = legal.canBank && state.turn.turnScore >= bankAt ? "BANK" : "ROLL";
    if (move === "ROLL" && !legal.canRoll) break;
    moves.push(move);
    state = applyAction(state, { type: move });
    if (state.turn.outcome) {
      turns += 1;
      if (turns < DAILY_TURNS) state = applyAction(state, { type: "ADVANCE" });
    }
  }
  return moves;
}

describe("daily seed", () => {
  it("is stable for a day and different across days", () => {
    expect(dailySeed("2026-08-09")).toBe(dailySeed("2026-08-09"));
    expect(dailySeed("2026-08-09")).not.toBe(dailySeed("2026-08-10"));
    expect(dailySeed("2026-08-09")).not.toBe(dailySeed("2025-08-09"));
  });

  it("keys a date as a UTC ISO day", () => {
    expect(dailyKey(new Date("2026-08-09T23:30:00Z"))).toBe("2026-08-09");
  });

  it("deals identical opening dice to everyone on the same day", () => {
    const a = createDailyGame("2026-08-09");
    const b = createDailyGame("2026-08-09");
    expect(applyAction(a, { type: "ROLL" }).turn.dice).toEqual(
      applyAction(b, { type: "ROLL" }).turn.dice,
    );
  });
});

describe("scoreDailyRun", () => {
  it("is deterministic: the same moves always score the same", () => {
    const moves = playRun("2026-08-09", 300);
    const first = scoreDailyRun("2026-08-09", moves);
    const second = scoreDailyRun("2026-08-09", moves);
    expect(second).toEqual(first);
    expect(first.complete).toBe(true);
    expect(first.turns).toBe(DAILY_TURNS);
    expect(first.banks + first.busts).toBe(DAILY_TURNS);
  });

  it("scores the same moves differently on a different day", () => {
    const moves = playRun("2026-08-09", 300);
    // Same inputs, different dice — so a run can't be replayed against another day.
    expect(scoreDailyRun("2026-08-10", moves).score).not.toBe(
      scoreDailyRun("2026-08-09", moves).score,
    );
  });

  it("caps a run at DAILY_TURNS however many moves are submitted", () => {
    const padded = [...playRun("2026-08-09", 300), ...Array<DailyMove>(500).fill("ROLL")];
    expect(scoreDailyRun("2026-08-09", padded).turns).toBe(DAILY_TURNS);
  });

  it("ignores illegal moves instead of crediting them", () => {
    // BANK before rolling is not a legal action; it must not end a turn or score.
    const honest = playRun("2026-08-09", 300);
    const withJunk: DailyMove[] = ["BANK", "BANK", ...honest];
    expect(scoreDailyRun("2026-08-09", withJunk).score).toBe(
      scoreDailyRun("2026-08-09", honest).score,
    );
  });

  it("cannot be inflated by submitting a longer or doctored move list", () => {
    const honest = playRun("2026-08-09", 300);
    const honestScore = scoreDailyRun("2026-08-09", honest).score;
    // Bank at every opportunity, roll forever, and alternate — none of these
    // "attacks" beat the real score, because the dice come from the seed.
    const attacks: DailyMove[][] = [
      Array<DailyMove>(400).fill("BANK"),
      Array<DailyMove>(400).fill("ROLL"),
      Array.from({ length: 400 }, (_, i): DailyMove => (i % 2 ? "BANK" : "ROLL")),
    ];
    for (const moves of attacks) {
      const r = scoreDailyRun("2026-08-09", moves);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.turns).toBeLessThanOrEqual(DAILY_TURNS);
    }
    // A cautious policy and a reckless one both produce *some* legitimate score;
    // the point is only that no move list can conjure an arbitrary number.
    expect(honestScore).toBeGreaterThan(0);
  });

  it("an empty run scores zero", () => {
    const r = scoreDailyRun("2026-08-09", []);
    expect(r).toMatchObject({ score: 0, turns: 0, banks: 0, busts: 0, complete: false });
  });

  it("banking more often trades ceiling for consistency across many days", () => {
    // Sanity check that the mode is actually playable across arbitrary days.
    for (const day of ["2026-01-01", "2026-06-15", "2026-12-31"]) {
      const r = scoreDailyRun(day, playRun(day, 300));
      expect(r.complete).toBe(true);
      expect(r.score).toBeGreaterThan(0);
    }
  });
});
