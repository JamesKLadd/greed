import { describe, it, expect } from "vitest";
import {
  applyAction,
  createGame,
  getLegalActions,
  type BotPersonality,
  type GameAction,
  type GameState,
} from "@greed/core";
import { rollModel, rollStats } from "./probabilities.js";
import { decide } from "./strategies.js";

type Policy = (state: GameState) => GameAction;

/** A naive human-ish policy: roll until the turn is worth `bankAt`, then stop. */
function threshold(bankAt: number): Policy {
  return (g) => {
    const legal = getLegalActions(g);
    if (!legal.canBank) return { type: "ROLL" };
    return g.turn.turnScore >= bankAt ? { type: "BANK" } : { type: "ROLL" };
  };
}

/**
 * Play `turnsPerSeed` turns per seed with the given policy against an
 * unreachable goal, so the endgame never fires and what's measured is pure
 * turn behaviour.
 */
function turnProfile(policy: Policy, personality: BotPersonality, seeds: number, turns = 40) {
  let banks = 0;
  let busts = 0;
  let banked = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    let g = createGame(
      [
        { id: "A", name: "a", isBot: true, botPersonality: personality },
        { id: "B", name: "b", isBot: true, botPersonality: personality },
      ],
      { goal: 1_000_000, seed, order: [0, 1] },
    );
    let played = 0;
    while (played < turns) {
      if (g.turn.outcome) {
        if (g.turn.outcome === "banked") banks++;
        else busts++;
        played++;
        g = applyAction(g, { type: "ADVANCE" });
        continue;
      }
      const before = g.turn.turnScore;
      const act = policy(g);
      if (act.type === "BANK") banked += before;
      g = applyAction(g, act);
    }
  }
  return {
    bustRate: busts / (banks + busts),
    avgBank: banked / Math.max(1, banks),
    /** Points earned per turn attempted — busts included, so this is the honest one. */
    pointsPerTurn: banked / Math.max(1, banks + busts),
  };
}

/** A full game of mixed personalities, played to completion. */
function playMatch(seed: number, personalities: BotPersonality[]): GameState {
  let g = createGame(
    personalities.map((p, i) => ({
      id: String.fromCharCode(65 + i),
      name: p,
      isBot: true,
      botPersonality: p,
    })),
    { goal: 2000, seed },
  );
  let guard = 0;
  while (g.phase !== "game-over" && guard++ < 200000) {
    g = applyAction(g, g.turn.outcome ? { type: "ADVANCE" } : decide(g));
  }
  return g;
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
  it("any mix of personalities finishes with a valid winner", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g = playMatch(seed, ["cautious", "balanced", "reckless"]);
      expect(g.phase).toBe("game-over");
      expect(g.winnerId).not.toBeNull();
    }
  });
});

describe("the standard skill level is genuinely strong", () => {
  // Measured as points per turn attempted (busts included) over thousands of
  // turns — far more stable than a head-to-head win rate, and it is the
  // quantity a bot is actually trying to maximise.
  it("out-earns naive threshold play, timid or greedy", () => {
    const standard = turnProfile((g) => decide(g), "balanced", 60);
    const timid = turnProfile(threshold(150), "balanced", 60);
    const greedy = turnProfile(threshold(1200), "balanced", 60);

    expect(standard.pointsPerTurn).toBeGreaterThan(timid.pointsPerTurn);
    expect(standard.pointsPerTurn).toBeGreaterThan(greedy.pointsPerTurn);
  });
});

describe("personality is what distinguishes one bot from another", () => {
  it("cautious protects a turn, reckless chases it", () => {
    const cautious = turnProfile((g) => decide(g), "cautious", 120);
    const balanced = turnProfile((g) => decide(g), "balanced", 120);
    const reckless = turnProfile((g) => decide(g), "reckless", 120);

    // Average banked turn grows from cautious -> balanced -> reckless.
    expect(balanced.avgBank).toBeGreaterThan(cautious.avgBank);
    expect(reckless.avgBank).toBeGreaterThan(balanced.avgBank);

    // And the extra greed shows up as a higher bust rate.
    expect(cautious.bustRate).toBeLessThan(balanced.bustRate);
    expect(reckless.bustRate).toBeGreaterThan(cautious.bustRate + 0.15);
  });

  it("splits on the same position: cautious banks it, reckless rolls on", () => {
    const base = createGame(
      [
        { id: "A", name: "a", isBot: true, botPersonality: "balanced" },
        { id: "B", name: "b", isBot: true, botPersonality: "balanced" },
      ],
      { goal: 1_000_000, seed: 7, order: [0, 1] },
    );
    // A turn worth 300 with two dice left to throw — the classic hard call.
    const position: GameState = {
      ...base,
      turn: {
        ...base.turn,
        turnScore: 300,
        dice: [1, 1, 1, 2, 3],
        awards: [{ kind: "ones", face: 1, dice: [0, 1, 2], points: 300 }],
        rollCount: 2,
        locked: [true, true, true, false, false],
        awaitingDecision: true,
      },
    };
    // The seat itself is balanced, and takes the money at this size.
    expect(decide(position)).toEqual({ type: "BANK" });
    expect(decide(position, { personality: "cautious" })).toEqual({ type: "BANK" });
    // Reckless is still under its floor, so the context personality overrides
    // the seat's and it rolls into the risk.
    expect(decide(position, { personality: "reckless" })).toEqual({ type: "ROLL" });
  });
});
