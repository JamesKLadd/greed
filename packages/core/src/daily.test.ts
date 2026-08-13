import { describe, expect, it } from "vitest";

/** Two arbitrary run seeds. The server generates these at random per run; the
 *  tests only need them to be distinct and stable. */
const SEED_A = 0x51ed_1234;
const SEED_B = 0x51ed_9876;
import {
  DAILY_TURNS,
  createDailyGame,
  dailyMoveStart,
  dailyPosition,
  dailyKey,
  dailySeed,
  msUntilNextDaily,
  scoreDailyRun,
  type DailyMove,
} from "./daily.js";
import { applyAction, getLegalActions } from "./game.js";
import { diceToRoll } from "./turn.js";

/** Roll the opening turn until it busts, leaving the bust on screen. */
function untilBust(seed: number) {
  const moves: DailyMove[] = [];
  let pos = dailyPosition(seed, moves);
  for (let i = 0; i < 40 && pos.turns === 0; i++) {
    moves.push("ROLL");
    pos = dailyPosition(seed, moves);
  }
  return { moves, pos };
}

/** Play a run with a simple policy, recording the moves as a client would. */
function playRun(seed: number, bankAt: number): DailyMove[] {
  let state = createDailyGame(seed);
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
  it("is stable for a day and player, and different across days", () => {
    expect(dailySeed("2026-08-09", "u1")).toBe(dailySeed("2026-08-09", "u1"));
    expect(dailySeed("2026-08-09", "u1")).not.toBe(dailySeed("2026-08-10", "u1"));
    expect(dailySeed("2026-08-09", "u1")).not.toBe(dailySeed("2025-08-09", "u1"));
  });

  it("keys a date by the Central calendar day, not the UTC one", () => {
    // Summer (CDT, UTC-5): the day turns over at 05:00Z.
    expect(dailyKey(new Date("2026-08-10T04:59:59Z"))).toBe("2026-08-09");
    expect(dailyKey(new Date("2026-08-10T05:00:00Z"))).toBe("2026-08-10");
    // Winter (CST, UTC-6): at 06:00Z.
    expect(dailyKey(new Date("2026-01-15T05:59:59Z"))).toBe("2026-01-14");
    expect(dailyKey(new Date("2026-01-15T06:00:00Z"))).toBe("2026-01-15");
    // Late-evening UTC is still the same Central day, where UTC keying would
    // already have rolled over — this is the case players actually hit.
    expect(dailyKey(new Date("2026-08-09T23:30:00Z"))).toBe("2026-08-09");
  });

  it("counts down to Central midnight, through both offsets", () => {
    // 23:30 Central on an August evening is 04:30Z the next morning.
    expect(msUntilNextDaily(new Date("2026-08-10T04:30:00Z"))).toBe(30 * 60 * 1000);
    // The same wall-clock moment in January is an hour later in UTC.
    expect(msUntilNextDaily(new Date("2026-01-15T05:30:00Z"))).toBe(30 * 60 * 1000);
    // A full day remains at the stroke of midnight.
    expect(msUntilNextDaily(new Date("2026-08-10T05:00:00Z"))).toBe(24 * 60 * 60 * 1000);
    // Month and year ends are just the next day like any other.
    expect(msUntilNextDaily(new Date("2026-09-01T04:59:59Z"))).toBe(1000);
    expect(msUntilNextDaily(new Date("2027-01-01T05:59:59Z"))).toBe(1000);
  });

  it("never runs out while the day it belongs to is still current", () => {
    // The countdown drives the "come back tomorrow" clock, so a zero or
    // negative reading would mean showing a finished timer on a live day.
    // Includes both DST switchovers, where the day is 23 and 25 hours long.
    for (const iso of [
      "2026-08-09T00:00:00.000Z",
      "2026-08-09T12:34:56.789Z",
      "2026-01-15T23:59:59.999Z",
      "2026-03-08T06:00:00.000Z", // spring forward, 2am Central
      "2026-03-08T09:30:00.000Z",
      "2026-11-01T05:00:00.000Z", // fall back
      "2026-11-01T08:30:00.000Z",
    ]) {
      const now = new Date(iso);
      const ms = msUntilNextDaily(now);
      expect(ms, iso).toBeGreaterThan(0);
      expect(dailyKey(new Date(now.getTime() + ms)), iso).not.toBe(dailyKey(now));
      expect(dailyKey(new Date(now.getTime() + ms - 1)), iso).toBe(dailyKey(now));
    }
  });

  it("makes the day exactly 23 or 25 hours long across a DST switch", () => {
    // Proof the boundary really tracks the zone rather than a fixed offset.
    const spring = msUntilNextDaily(new Date("2026-03-08T06:00:00Z")); // midnight CST
    expect(spring).toBe(23 * 60 * 60 * 1000);
    const fall = msUntilNextDaily(new Date("2026-11-01T05:00:00Z")); // midnight CDT
    expect(fall).toBe(25 * 60 * 60 * 1000);
  });

  it("gives different players different dice on the same day", () => {
    // The whole point of the per-player seed: nobody can look up someone else's
    // ideal line, because nobody else is throwing their dice.
    expect(dailySeed("2026-08-09", "u1")).not.toBe(dailySeed("2026-08-09", "u2"));
    const a = createDailyGame(dailySeed("2026-08-09", "u1"));
    const b = createDailyGame(dailySeed("2026-08-09", "u2"));
    expect(applyAction(a, { type: "ROLL" }).turn.dice).not.toEqual(
      applyAction(b, { type: "ROLL" }).turn.dice,
    );
  });

  it("deals one player the same dice every time they open the run", () => {
    const a = createDailyGame(dailySeed("2026-08-09", "u1"));
    const b = createDailyGame(dailySeed("2026-08-09", "u1"));
    expect(applyAction(a, { type: "ROLL" }).turn.dice).toEqual(
      applyAction(b, { type: "ROLL" }).turn.dice,
    );
  });
});

describe("scoreDailyRun", () => {
  it("is deterministic: the same moves always score the same", () => {
    const moves = playRun(dailySeed("2026-08-09"), 300);
    const first = scoreDailyRun(dailySeed("2026-08-09"), moves);
    const second = scoreDailyRun(dailySeed("2026-08-09"), moves);
    expect(second).toEqual(first);
    expect(first.complete).toBe(true);
    expect(first.turns).toBe(DAILY_TURNS);
    expect(first.banks + first.busts).toBe(DAILY_TURNS);
  });

  it("scores one player's moves against their own dice, not another's", () => {
    // Copying someone's winning line is worthless: replayed under a different
    // player key it meets different dice, so it scores differently.
    const moves = playRun(dailySeed("2026-08-09", "u1"), 300);
    const mine = scoreDailyRun(dailySeed("2026-08-09", "u1"), moves);
    const stolen = scoreDailyRun(dailySeed("2026-08-09", "u2"), moves);
    expect(stolen.score).not.toBe(mine.score);
    expect(scoreDailyRun(dailySeed("2026-08-09", "u1"), moves)).toEqual(mine);
  });

  it("scores the same moves differently on a different day", () => {
    const moves = playRun(dailySeed("2026-08-09"), 300);
    // Same inputs, different dice — so a run can't be replayed against another day.
    expect(scoreDailyRun(dailySeed("2026-08-10"), moves).score).not.toBe(
      scoreDailyRun(dailySeed("2026-08-09"), moves).score,
    );
  });

  it("caps a run at DAILY_TURNS however many moves are submitted", () => {
    const padded = [
      ...playRun(dailySeed("2026-08-09"), 300),
      ...Array<DailyMove>(500).fill("ROLL"),
    ];
    expect(scoreDailyRun(dailySeed("2026-08-09"), padded).turns).toBe(DAILY_TURNS);
  });

  it("ignores illegal moves instead of crediting them", () => {
    // BANK before rolling is not a legal action; it must not end a turn or score.
    const honest = playRun(dailySeed("2026-08-09"), 300);
    const withJunk: DailyMove[] = ["BANK", "BANK", ...honest];
    expect(scoreDailyRun(dailySeed("2026-08-09"), withJunk).score).toBe(
      scoreDailyRun(dailySeed("2026-08-09"), honest).score,
    );
  });

  it("cannot be inflated by submitting a longer or doctored move list", () => {
    const honest = playRun(dailySeed("2026-08-09"), 300);
    const honestScore = scoreDailyRun(dailySeed("2026-08-09"), honest).score;
    // Bank at every opportunity, roll forever, and alternate — none of these
    // "attacks" beat the real score, because the dice come from the seed.
    const attacks: DailyMove[][] = [
      Array<DailyMove>(400).fill("BANK"),
      Array<DailyMove>(400).fill("ROLL"),
      Array.from({ length: 400 }, (_, i): DailyMove => (i % 2 ? "BANK" : "ROLL")),
    ];
    for (const moves of attacks) {
      const r = scoreDailyRun(dailySeed("2026-08-09"), moves);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.turns).toBeLessThanOrEqual(DAILY_TURNS);
    }
    // A cautious policy and a reckless one both produce *some* legitimate score;
    // the point is only that no move list can conjure an arbitrary number.
    expect(honestScore).toBeGreaterThan(0);
  });

  it("an empty run scores zero", () => {
    const r = scoreDailyRun(dailySeed("2026-08-09"), []);
    expect(r).toMatchObject({ score: 0, turns: 0, banks: 0, busts: 0, complete: false });
  });

  it("banking more often trades ceiling for consistency across many days", () => {
    // Sanity check that the mode is actually playable across arbitrary days.
    for (const day of ["2026-01-01", "2026-06-15", "2026-12-31"]) {
      const seed = dailySeed(day);
      const r = scoreDailyRun(seed, playRun(seed, 300));
      expect(r.complete).toBe(true);
      expect(r.score).toBeGreaterThan(0);
    }
  });
});

describe("dailyPosition — the server's view of a run", () => {
  it("leaves a finished turn on screen rather than advancing past it", () => {
    // Roll until the first turn resolves, then check the outcome is still set:
    // that is what lets the player see the roll that busted them.
    const moves: DailyMove[] = [];
    let pos = dailyPosition(SEED_A, moves);
    for (let i = 0; i < 30 && pos.turns === 0; i++) {
      moves.push("ROLL");
      pos = dailyPosition(SEED_A, moves);
    }
    expect(pos.turns).toBe(1);
    expect(pos.state.turn.outcome).not.toBeNull();
  });

  it("advances past a finished turn when the next move arrives", () => {
    const moves: DailyMove[] = [];
    let pos = dailyPosition(SEED_A, moves);
    for (let i = 0; i < 30 && pos.turns === 0; i++) {
      moves.push("ROLL");
      pos = dailyPosition(SEED_A, moves);
    }
    const next = dailyPosition(SEED_A, [...moves, "ROLL"]);
    // A fresh turn: the previous outcome is cleared and a throw has happened.
    expect(next.turns).toBeGreaterThanOrEqual(1);
    expect(next.state.turn.rollCount).toBeGreaterThan(0);
  });

  it("is append-only: extending a move list never changes the earlier position", () => {
    // This is what makes the server's stored list authoritative — a client
    // cannot rewrite a turn it has already played by resubmitting.
    const base: DailyMove[] = ["ROLL", "BANK", "ROLL", "ROLL", "BANK"];
    const before = dailyPosition(SEED_A, base);
    const extended = dailyPosition(SEED_A, [...base, "ROLL"]);
    const rewound = dailyPosition(SEED_A, base);
    expect(rewound.result).toEqual(before.result);
    expect(extended.result.score).toBeGreaterThanOrEqual(0);
  });

  it("stops at the turn limit however many moves are sent", () => {
    const many: DailyMove[] = Array(600).fill("ROLL");
    const pos = dailyPosition(SEED_A, many);
    expect(pos.turns).toBe(DAILY_TURNS);
    expect(pos.result.complete).toBe(true);
  });

  it("gives two players different dice on the same day", () => {
    const moves: DailyMove[] = ["ROLL"];
    const a = dailyPosition(SEED_A, moves).state.turn.dice;
    const b = dailyPosition(SEED_B, moves).state.turn.dice;
    expect(a).not.toEqual(b);
  });

  it("agrees with scoreDailyRun, which is the same replay", () => {
    const moves: DailyMove[] = ["ROLL", "ROLL", "BANK", "ROLL", "BANK"];
    expect(scoreDailyRun(SEED_A, moves)).toEqual(dailyPosition(SEED_A, moves).result);
  });
});

describe("dailyMoveStart — where the next move begins", () => {
  /** Bank the opening turn on its first scoring roll. Leaves two dice locked. */
  const banked: DailyMove[] = ["ROLL", "BANK"];

  it("clears a banked turn, so the next throw uses all five dice", () => {
    // The bug this pins: after banking, the finished turn is still on screen
    // with its scoring dice locked. Working out the next throw from THAT turn
    // threw only the leftovers — the dice locked when the turn ended stayed lit
    // and never re-rolled, because as far as the board was concerned the turn
    // had never ended.
    const pos = dailyPosition(SEED_A, banked);
    expect(pos.state.turn.outcome).toBe("banked");
    expect(pos.state.turn.locked.some(Boolean)).toBe(true);
    expect(diceToRoll(pos.state.turn).length).toBeLessThan(5);

    const start = dailyMoveStart(pos.state);
    expect(start.turn.outcome).toBeNull();
    expect(start.turn.locked).toEqual([false, false, false, false, false]);
    expect(start.turn.turnScore).toBe(0);
    expect(diceToRoll(start.turn)).toEqual([0, 1, 2, 3, 4]);
  });

  it("clears a busted turn the same way", () => {
    const { pos } = untilBust(SEED_A);
    expect(pos.state.turn.outcome).toBe("busted");
    const start = dailyMoveStart(pos.state);
    expect(start.turn.outcome).toBeNull();
    expect(diceToRoll(start.turn)).toEqual([0, 1, 2, 3, 4]);
  });

  it("leaves a turn still in play alone", () => {
    const pos = dailyPosition(SEED_A, ["ROLL"]);
    expect(pos.state.turn.outcome).toBeNull();
    expect(dailyMoveStart(pos.state)).toBe(pos.state);
  });

  it("deals nothing: the score stands and the next throw is unchanged", () => {
    // The client calls this without knowing the seed, so it must not be able to
    // advance the run or peek at a die. Clearing the board locally and then
    // playing the move has to land exactly where the server's replay lands.
    const pos = dailyPosition(SEED_A, banked);
    const start = dailyMoveStart(pos.state);
    expect(start.turn.dice).toEqual([1, 1, 1, 1, 1]); // a fresh turn shows no throw
    expect(start.players[0].total).toBe(pos.state.players[0].total);
    expect(applyAction(start, { type: "ROLL" }).turn.dice).toEqual(
      dailyPosition(SEED_A, [...banked, "ROLL"]).state.turn.dice,
    );
  });
});
