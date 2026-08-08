import { describe, it, expect } from "vitest";
import {
  applyAction,
  createGame,
  type BotDifficulty,
  type BotPersonality,
  type GameState,
} from "@greed/core";
import { rollModel, rollStats } from "./probabilities.js";
import { decide } from "./strategies.js";

/** Deterministic PRNG so bot "mistakes" are reproducible in tests. */
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), s | 1) + 0x6d2b79f5) >>> 0;
    return s / 4294967296;
  };
}

function playMatch(seed: number, difficulties: BotDifficulty[]): GameState {
  const rand = seededRandom(seed * 2654435761);
  let g = createGame(
    difficulties.map((d, i) => ({
      id: String.fromCharCode(65 + i),
      name: d,
      isBot: true,
      botDifficulty: d,
    })),
    { goal: 2000, seed },
  );
  let guard = 0;
  while (g.phase !== "game-over" && guard++ < 200000) {
    if (g.turn.outcome) {
      g = applyAction(g, { type: "ADVANCE" });
      continue;
    }
    const d = g.players[g.turn.playerIndex].botDifficulty!;
    g = applyAction(g, decide(g, d, { random: rand }));
  }
  return g;
}

/**
 * Head-to-head win rate of difficulty `a` vs `b`. Each seed is played twice —
 * once with each bot going first — to cancel the first-player advantage, so a
 * result near 50% means "equal skill" and >50% means `a` is genuinely stronger.
 */
function duelWinRate(a: BotDifficulty, b: BotDifficulty, seeds: number): number {
  let aWins = 0;
  let games = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    for (const aFirst of [true, false]) {
      const rand = seededRandom(seed * 2654435761 + (aFirst ? 1 : 2));
      let g = createGame(
        [
          { id: "A", name: "a", isBot: true, botDifficulty: a },
          { id: "B", name: "b", isBot: true, botDifficulty: b },
        ],
        { goal: 2000, seed, order: aFirst ? [0, 1] : [1, 0] },
      );
      let guard = 0;
      while (g.phase !== "game-over" && guard++ < 200000) {
        if (g.turn.outcome) {
          g = applyAction(g, { type: "ADVANCE" });
          continue;
        }
        const d = g.players[g.turn.playerIndex].botDifficulty!;
        g = applyAction(g, decide(g, d, { random: rand }));
      }
      if (g.winnerId === "A") aWins++;
      games++;
    }
  }
  return aWins / games;
}

/** Solo push profile: average banked turn size and bust rate for a personality. */
function pushProfile(personality: BotPersonality, seeds: number) {
  let banks = 0;
  let busts = 0;
  let banked = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    let g = createGame(
      [
        { id: "A", name: "a", isBot: true, botDifficulty: "expert", botPersonality: personality },
        { id: "B", name: "b", isBot: true, botDifficulty: "expert", botPersonality: personality },
      ],
      { goal: 1_000_000, seed, order: [0, 1] }, // unreachable goal: pure turn behavior
    );
    let turns = 0;
    while (turns < 40) {
      if (g.turn.outcome) {
        if (g.turn.outcome === "banked") banks++;
        else busts++;
        turns++;
        g = applyAction(g, { type: "ADVANCE" });
        continue;
      }
      const before = g.turn.turnScore;
      const act = decide(g, "expert");
      if (act.type === "BANK") banked += before;
      g = applyAction(g, act);
    }
  }
  return { bustRate: busts / (banks + busts), avgBank: banked / Math.max(1, banks) };
}

describe("roll statistics", () => {
  it("bust probability falls as more dice are thrown", () => {
    const p1 = rollStats(1).bustProb;
    const p5 = rollStats(5).bustProb;
    expect(p1).toBeGreaterThan(p5);
    expect(p5).toBeLessThan(0.2);
  });

  it("single die: bust 2/3, expected-if-scored 75", () => {
    const s = rollStats(1);
    expect(s.bustProb).toBeCloseTo(4 / 6, 10);
    expect(s.expectedGainIfScored).toBeCloseTo(75, 10);
  });
});

describe("roll transition model", () => {
  it("probabilities are consistent with the roll statistics", () => {
    for (let k = 1; k <= 5; k++) {
      const model = rollModel(k);
      const stats = rollStats(k);
      const pSum = model.transitions.reduce((s, t) => s + t.p, 0);
      // Scoring outcomes + bust cover the whole probability space.
      expect(pSum + model.bustProb).toBeCloseTo(1, 10);
      // Expected gain reconstructed from the model matches the direct statistic.
      const eGain = model.transitions.reduce((s, t) => s + t.p * t.gain, 0);
      expect(eGain).toBeCloseTo(stats.expectedGain, 6);
      // Every transition leaves a legal number of dice for the next throw.
      for (const t of model.transitions) {
        expect(t.gain).toBeGreaterThan(0);
        expect(t.kNext).toBeGreaterThanOrEqual(1);
        expect(t.kNext).toBeLessThanOrEqual(5);
      }
    }
  });
});

describe("bots always produce terminating games", () => {
  it("every difficulty (incl. expert) finishes with a valid winner", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g = playMatch(seed, ["easy", "medium", "hard", "expert"]);
      expect(g.phase).toBe("game-over");
      expect(g.winnerId).not.toBeNull();
    }
  });
});

describe("difficulty forms a strength ladder", () => {
  // Symmetric duels, so ~50% is a tie and >50% is a real edge.
  it("medium clearly beats easy", () => {
    expect(duelWinRate("medium", "easy", 150)).toBeGreaterThan(0.55);
  });
  it("hard beats medium", () => {
    expect(duelWinRate("hard", "medium", 150)).toBeGreaterThan(0.52);
  });
  it("expert beats medium and is at least hard's equal", () => {
    expect(duelWinRate("expert", "medium", 150)).toBeGreaterThan(0.52);
    // Expert and hard are both near-optimal; expert must not be worse than hard.
    expect(duelWinRate("expert", "hard", 150)).toBeGreaterThan(0.44);
  });
  it("the strong bots dominate easy", () => {
    expect(duelWinRate("hard", "easy", 150)).toBeGreaterThan(0.58);
    expect(duelWinRate("expert", "easy", 150)).toBeGreaterThan(0.58);
  });
});

describe("personalities change how far a bot pushes", () => {
  it("reckless pushes further and busts more than cautious", () => {
    const cautious = pushProfile("cautious", 120);
    const balanced = pushProfile("balanced", 120);
    const reckless = pushProfile("reckless", 120);

    // Average banked turn grows from cautious -> balanced -> reckless.
    expect(balanced.avgBank).toBeGreaterThan(cautious.avgBank);
    expect(reckless.avgBank).toBeGreaterThan(balanced.avgBank);

    // And the extra greed shows up as a higher bust rate.
    expect(reckless.bustRate).toBeGreaterThan(cautious.bustRate + 0.1);
  });
});
