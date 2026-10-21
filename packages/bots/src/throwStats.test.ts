import { describe, expect, it } from "vitest";
import { runPosition, type RunMove } from "@greed/core";
import { rollStats } from "./probabilities.js";
import {
  ROLL_DATA_DAYS,
  ThrowCollector,
  cleanRollGame,
  cleanThrow,
  decodeThrows,
  encodeThrows,
  gamesCsv,
  oddsComparisons,
  rollGameFromState,
  tallyGame,
  throwEvents,
  throwOdds,
  throwsCsv,
  type RollGame,
} from "./throwStats.js";

const FRESH = 6 ** 5;

describe("throwOdds — exact, from the real scoring rules", () => {
  it("a fresh five busts exactly as often as the bots' model says", () => {
    expect(throwOdds("").bust).toBeCloseTo(rollStats(5).bustProb, 12);
  });

  it("matches the textbook counts for a fresh five", () => {
    // 2 runs × 5! orders; 6 faces; three or more alike counted by hand:
    // exactly three 6·C(5,3)·5² = 1500, exactly four 6·5·5 = 150, five 6.
    expect(throwOdds("").straight).toBeCloseTo(240 / FRESH, 12);
    expect(throwOdds("").five).toBeCloseTo(6 / FRESH, 12);
    expect(throwOdds("").triple).toBeCloseTo((1500 + 150 + 6) / FRESH, 12);
  });

  it("three dice make a triple 6 times in 216", () => {
    expect(throwOdds("66").triple).toBeCloseTo(6 / 216, 12);
  });

  it("held dice that cannot make a hand leave the plain odds for that many dice", () => {
    // Two 6s held: no straight can include them, and three thrown dice are the
    // only way to five 6s — which is a triple anyway.
    expect(throwOdds("66").bust).toBeCloseTo(rollStats(3).bustProb, 12);
  });

  it("counts a hand completed on the mat as a save, as the engine does", () => {
    // Holding 2,3,4,5: a 1 or 5 scores, a 6 completes the straight — 3 in 6.
    expect(throwOdds("2345").bust).toBeCloseTo(3 / 6, 12);
    expect(throwOdds("2345").straight).toBeCloseTo(2 / 6, 12);
    // Holding four 2s: 1 and 5 score, a 2 completes five of a kind.
    expect(throwOdds("2222").bust).toBeCloseTo(3 / 6, 12);
    expect(throwOdds("2222").five).toBeCloseTo(1 / 6, 12);
    // The order the held faces are given in does not matter.
    expect(throwOdds("5432")).toEqual(throwOdds("2345"));
  });

  it("reads a recorded throw the way the engine scored it", () => {
    expect(throwEvents({ held: "2345", faces: "6" })).toMatchObject({
      bust: false,
      straight: true,
      hot: true,
    });
    expect(throwEvents({ held: "", faces: "23462" })).toMatchObject({ bust: true, dice: 5 });
    expect(throwEvents({ held: "", faces: "44412" })).toMatchObject({
      bust: false,
      triple: true,
      hot: false,
    });
  });
});

/** A real run, replayed with the collector watching. */
function playRun(seed: number) {
  const moves: RunMove[] = [];
  for (let i = 0; i < 60; i++) moves.push("ROLL", "ROLL", "BANK");
  const collector = new ThrowCollector(["you"]);
  const position = runPosition(seed, moves, 10, (before, after) =>
    collector.observe(before, after),
  );
  return { position, throws: collector.throwsFor("you") };
}

describe("ThrowCollector on a replayed run", () => {
  it.each([1, 7, 42, 2026])("seed %i: every throw is recorded and agrees with the run", (seed) => {
    const { position, throws } = playRun(seed);
    const rolls = position.state.log.filter((e) => e.type === "roll");
    expect(throws).toHaveLength(rolls.length);
    expect(throws.map((r) => r.faces)).toEqual(rolls.map((e) => e.dice.join("")));

    const game = rollGameFromState("daily", position.state, "you", throws);
    const t = tallyGame(game);
    // Busts by dice count add up to the run's busts, and the five-dice ones
    // are exactly the super busts the challenges already count.
    expect(t.b1 + t.b2 + t.b3 + t.b4 + t.b5).toBe(position.result.busts);
    expect(t.b5).toBe(position.result.superBusts);
    expect(game.score).toBe(position.result.score);
    expect(game.turns).toBe(position.result.turns);
    expect(game.won).toBeNull();
    // Turns are numbered from 1 and the first throw of each is throw 1.
    expect(throws[0]).toMatchObject({ turn: 1, throw: 1, held: "" });
    expect(Math.max(...throws.map((r) => r.turn))).toBe(position.result.turns);
    // Points the throws added are what the turns were worth: banked plus lost.
    expect(t.gain).toBe(game.bankedPoints + game.lostPoints);
  });

  it("a fresh five's expected points are the model's expectation", () => {
    const { throws } = playRun(3);
    const first = throws[0];
    expect(first.expectedGain).toBeCloseTo(rollStats(5).expectedGain, 1);
  });
});

describe("comparisons", () => {
  it("are centred on expectation: luck balances out over many runs", () => {
    let total = tallyGame(rollGameFromState("daily", playRun(1).position.state, "you", []));
    for (let seed = 1; seed <= 300; seed++) {
      const { position, throws } = playRun(seed);
      const t = tallyGame(rollGameFromState("daily", position.state, "you", throws));
      total = Object.fromEntries(
        Object.entries(total).map(([k, v]) => [k, v + (t as Record<string, number>)[k]]),
      ) as typeof total;
    }
    for (const row of oddsComparisons(total)) {
      if (row.chances < 50 || row.z === null) continue;
      // Real dice from the real RNG, so this is a statistical test: allow the
      // tail, but a systematic error in the odds would sit far outside it.
      expect(Math.abs(row.z), row.key).toBeLessThan(4.5);
    }
  });
});

describe("storage and validation", () => {
  const sample = (): RollGame => {
    const { position, throws } = playRun(11);
    return rollGameFromState("daily", position.state, "you", throws, new Date());
  };

  it("round-trips a game's throws through the compact encoding", () => {
    const game = sample();
    expect(decodeThrows(encodeThrows(game.throws))).toEqual(game.throws);
  });

  it("rejects throws that could not have happened", () => {
    expect(cleanThrow([1, 1, "", "12345", 0, 500, 300])).not.toBeNull();
    expect(cleanThrow([1, 1, "", "1234", 0, 0, 0])).toBeNull(); // four dice, nothing held
    expect(cleanThrow([1, 1, "7", "1234", 0, 0, 0])).toBeNull(); // no such face
    expect(cleanThrow([1, 1, "", "23462", 0, 50, 0])).toBeNull(); // a bust that paid
    expect(cleanThrow([0, 1, "", "12345", 0, 500, 300])).toBeNull(); // turn 0
    expect(cleanThrow("nonsense")).toBeNull();
  });

  it("accepts an uploaded solo game only inside the kept window", () => {
    const game = { ...sample(), throws: JSON.parse(encodeThrows(sample().throws)) as unknown };
    expect(cleanRollGame(game, "local")?.mode).toBe("local");
    // A fast device clock is read as "just now", not refused: the game was real.
    const future = { ...game, playedAt: new Date(Date.now() + 3_600_000).toISOString() };
    const cleaned = cleanRollGame(future, "local");
    expect(cleaned).not.toBeNull();
    expect(Date.parse(cleaned!.playedAt)).toBeLessThanOrEqual(Date.now());
    const old = {
      ...game,
      playedAt: new Date(Date.now() - (ROLL_DATA_DAYS + 1) * 86_400_000).toISOString(),
    };
    expect(cleanRollGame(old, "local")).toBeNull();
    expect(cleanRollGame({ ...game, score: -5 }, "local")).toBeNull();
  });

  it("writes CSV a spreadsheet can read: one line per game, one per throw", () => {
    const game = sample();
    const games = gamesCsv([{ game }]).trim().split("\n");
    expect(games).toHaveLength(2);
    expect(games[0].split(",")[0]).toBe("played_at");
    expect(games[0].split(",")).toHaveLength(games[1].split(",").length);
    const throws = throwsCsv([{ game, player: "p1" }])
      .trim()
      .split("\n");
    expect(throws).toHaveLength(game.throws.length + 1);
    expect(throws[0].startsWith("player,played_at")).toBe(true);
  });
});

// ------------------------------------------------------------- decisions etc.

import {
  createRunGame,
  getLegalActions,
  applyAction as apply,
  runMoveStart,
  type GameState as State,
} from "@greed/core";
import { rollEdge } from "./strategies.js";
import {
  emptyTally,
  mergeTallies,
  chiSquareFair,
  decisionsCsv,
  decodeDecisions,
  encodeDecisions,
  tableFaces,
} from "./throwStats.js";

/** Play a ten-turn run with a chosen policy, watching every throw and bank. */
function playPolicy(seed: number, shouldRoll: (s: State) => boolean) {
  const collector = new ThrowCollector(["you"]);
  let state = createRunGame(seed);
  let turns = 0;
  while (turns < 10) {
    state = runMoveStart(state);
    const legal = getLegalActions(state);
    const roll = legal.canRoll && (!legal.canBank || shouldRoll(state));
    const before = state;
    state = apply(state, { type: roll ? "ROLL" : "BANK" });
    collector.observe(before, state);
    if (state.turn.outcome) turns += 1;
  }
  return rollGameFromState("daily", state, "you", collector.throwsFor("you"), new Date(), {
    decisions: collector.decisionsFor("you"),
  });
}

describe("decisions", () => {
  it("records every choice: each throw after the first, and each bank", () => {
    const game = playPolicy(9, (s) => s.turn.turnScore < 400);
    const voluntary = game.throws.filter((r) => r.throw > 1).length;
    expect(game.decisions.filter((d) => d.choice === "roll")).toHaveLength(voluntary);
    expect(game.decisions.filter((d) => d.choice === "bank")).toHaveLength(game.banks);
  });

  it("a player who follows the model makes only good calls", () => {
    let total = emptyTally();
    for (let seed = 1; seed <= 40; seed++) {
      const t = tallyGame(playPolicy(seed, (s) => rollEdge(s.turn) > 0));
      total = mergeTallies(total, t);
    }
    expect(total.dec).toBeGreaterThan(50);
    expect(total.decGood).toBe(total.dec);
    expect(total.costGreedy + total.costCautious).toBe(0);
  });

  it("a player who never stops is called greedy, at a cost in points", () => {
    let total = emptyTally();
    for (let seed = 1; seed <= 40; seed++)
      total = mergeTallies(total, tallyGame(playPolicy(seed, () => true)));
    expect(total.decGreedy).toBeGreaterThan(0);
    expect(total.costGreedy).toBeGreaterThan(0);
    expect(total.decCautious).toBe(0);
  });

  it("counts per game only over games that recorded decisions", () => {
    const game = playPolicy(5, (s) => s.turn.turnScore < 350);
    // A game filed before decisions were kept has none to offer.
    const total = mergeTallies(tallyGame(game), tallyGame({ ...game, decisions: [] }));
    expect(total.games).toBe(2);
    expect(total.decGames).toBe(1);
  });

  it("round-trips decisions through the compact encoding", () => {
    const game = playPolicy(3, (s) => s.turn.turnScore < 350);
    expect(decodeDecisions(encodeDecisions(game.decisions))).toEqual(game.decisions);
    expect(decisionsCsv([{ game }]).trim().split("\n")).toHaveLength(game.decisions.length + 1);
  });
});

describe("point sources and the table's dice", () => {
  it("credits every scored point to exactly one kind of score", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const t = tallyGame(playPolicy(seed, (s) => s.turn.turnScore < 500));
      const credited = t.pOnes + t.pFives + t.pTriple + t.pStraight + t.pFive;
      expect(credited).toBeCloseTo(t.gain, 6);
    }
  });

  it("counts every die anyone threw", () => {
    const game = playPolicy(5, () => false);
    // A run has one player, so the table's dice are that player's.
    let state = createRunGame(5);
    const faces = tableFaces(state);
    expect(faces).toEqual([0, 0, 0, 0, 0, 0]);
    state = apply(runMoveStart(state), { type: "ROLL" });
    expect(tableFaces(state).reduce((a, b) => a + b, 0)).toBe(5);
    expect(game.throws.length).toBeGreaterThan(0);
  });
});

describe("unfinished games", () => {
  it("count their throws but not their score or result", () => {
    const done = playPolicy(4, (s) => s.turn.turnScore < 300);
    const left = { ...done, finished: false, won: null };
    const t = tallyGame(left);
    expect(t.games).toBe(1);
    expect(t.finished).toBe(0);
    expect(t.scoreSum).toBe(0);
    expect(t.throws).toBe(done.throws.length);
  });
});

describe("chiSquareFair", () => {
  it("matches the textbook table for five degrees of freedom", () => {
    // 11.07 is the 5% critical value; 1.61 the 90% one.
    const at = (chi2: number) => {
      // Build counts with a known statistic: n per face, one face shifted.
      const n = 6000;
      const d = Math.sqrt((chi2 * (n / 6)) / (1 + 1 / 5));
      const counts = [n / 6 + d, ...Array(5).fill(n / 6 - d / 5)];
      return chiSquareFair(counts)!;
    };
    expect(at(11.07).p).toBeCloseTo(0.05, 3);
    expect(at(1.61).p).toBeCloseTo(0.9, 2);
    expect(chiSquareFair([10, 10, 10, 10, 10, 10])!.p).toBeCloseTo(1, 10);
    expect(chiSquareFair([0, 0, 0, 0, 0, 0])).toBeNull();
  });
});
