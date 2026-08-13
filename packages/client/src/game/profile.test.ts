import { beforeEach, describe, expect, it } from "vitest";
import type { GameState } from "@greed/core";
import {
  ACHIEVEMENTS,
  achievementScore,
  averageBank,
  awardAchievement,
  loadProfile,
  maxAchievementScore,
  recordGame,
  summarize,
  TIER_POINTS,
  type GameSummary,
} from "./profile.js";

// Minimal in-memory localStorage so the profile persists across recordGame calls.
class MemStore {
  private store = new Map<string, string>();
  getItem(k: string) {
    return this.store.has(k) ? this.store.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.store.set(k, String(v));
  }
  removeItem(k: string) {
    this.store.delete(k);
  }
  clear() {
    this.store.clear();
  }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemStore }).localStorage = new MemStore();
});

/** A hand-built game state exercising just the fields summarize reads. */
function fakeState(): GameState {
  return {
    winnerId: "you",
    config: { goal: 2000 },
    players: [
      { id: "you", name: "You", isBot: false, total: 2100 },
      { id: "b1", name: "Bot 1", isBot: true, botPersonality: "cautious", total: 900 },
      { id: "b2", name: "Bot 2", isBot: true, botPersonality: "reckless", total: 1500 },
    ],
    log: [
      { type: "bank", playerId: "you", gained: 300, total: 300 },
      { type: "hot-dice", playerId: "you" },
      { type: "bank", playerId: "you", gained: 1200, total: 1500 },
      { type: "bust", playerId: "you", lostPoints: 250 },
      { type: "bank", playerId: "b1", gained: 400, total: 400 }, // other player: ignored
      { type: "bank", playerId: "you", gained: 600, total: 2100 },
    ],
  } as unknown as GameState;
}

describe("summarize", () => {
  it("aggregates the human's turns from the log", () => {
    const s = summarize(fakeState(), "you");
    expect(s.won).toBe(true);
    expect(s.finalTotal).toBe(2100);
    expect(s.banks).toBe(3);
    expect(s.busts).toBe(1);
    expect(s.hotDice).toBe(1);
    expect(s.bestTurn).toBe(1200);
    expect(s.bankedPoints).toBe(2100);
    expect(s.opponents).toBe(2);
    expect(s.boldestOpponent).toBe("reckless"); // boldest of cautious/reckless
  });

  it("marks a loss when someone else won", () => {
    const s = summarize(fakeState(), "b1");
    expect(s.won).toBe(false);
    expect(s.finalTotal).toBe(900);
  });

  it("tracks the deepest hole you were ever in", () => {
    const state = {
      winnerId: "you",
      config: { goal: 3000 },
      players: [
        { id: "you", name: "You", isBot: false, total: 3100 },
        { id: "b1", name: "Bot 1", isBot: true, botPersonality: "balanced", total: 2600 },
      ],
      log: [
        { type: "bank", playerId: "b1", gained: 900, total: 900 },
        { type: "bust", playerId: "you", lostPoints: 400 },
        { type: "bank", playerId: "b1", gained: 800, total: 1700 }, // you 0, gap 1700
        { type: "bank", playerId: "you", gained: 1000, total: 1000 }, // gap back to 700
        { type: "bank", playerId: "b1", gained: 900, total: 2600 },
        { type: "bank", playerId: "you", gained: 2100, total: 3100 },
      ],
    } as unknown as GameState;
    expect(summarize(state, "you").maxDeficit).toBe(1700);
    // Symmetric: the bot was never behind at all.
    expect(summarize(state, "b1").maxDeficit).toBe(500);
  });

  it("measures the deficit by SIDE in a team game, not by seat", () => {
    // The bug this pins: Comeback Kid was handed out for a hole nobody was ever
    // in. Your side leads from the first turn, but you personally trail your own
    // partner by 1800 — and seat-by-seat that read as a 1800-point recovery,
    // counting a TEAMMATE as the leader you climbed back past.
    const state = {
      winnerId: "mate",
      winnerTeam: 0,
      config: { goal: 2000 },
      teams: [
        [0, 2],
        [1, 3],
      ],
      players: [
        { id: "you", name: "You", isBot: false, total: 200, team: 0 },
        { id: "b1", name: "Bot 1", isBot: true, botPersonality: "balanced", total: 900, team: 1 },
        {
          id: "mate",
          name: "Partner",
          isBot: true,
          botPersonality: "cautious",
          total: 2000,
          team: 0,
        },
        { id: "b2", name: "Bot 2", isBot: true, botPersonality: "reckless", total: 700, team: 1 },
      ],
      log: [
        { type: "bank", playerId: "mate", gained: 2000, total: 2000 }, // your side 2000-0
        { type: "bank", playerId: "b1", gained: 900, total: 900 }, // 2000-900
        { type: "bank", playerId: "you", gained: 200, total: 200 }, // 2200-900
        { type: "bank", playerId: "b2", gained: 700, total: 700 }, // 2200-1600
      ],
    } as unknown as GameState;
    const s = summarize(state, "you");
    // Your side was never behind, so there is no comeback to celebrate.
    expect(s.maxDeficit).toBe(0);
    // A partner's win is still your win — that part was always right.
    expect(s.won).toBe(true);
  });

  it("still credits a real team deficit to everyone who dug out of it", () => {
    const state = {
      winnerId: "you",
      winnerTeam: 0,
      config: { goal: 3000 },
      teams: [
        [0, 2],
        [1, 3],
      ],
      players: [
        { id: "you", name: "You", isBot: false, total: 1800, team: 0 },
        { id: "b1", name: "Bot 1", isBot: true, botPersonality: "balanced", total: 1000, team: 1 },
        {
          id: "mate",
          name: "Partner",
          isBot: true,
          botPersonality: "cautious",
          total: 1400,
          team: 0,
        },
        { id: "b2", name: "Bot 2", isBot: true, botPersonality: "reckless", total: 1200, team: 1 },
      ],
      log: [
        { type: "bank", playerId: "b1", gained: 1000, total: 1000 },
        { type: "bank", playerId: "b2", gained: 1200, total: 1200 }, // 0 vs 2200
        { type: "bank", playerId: "you", gained: 1800, total: 1800 },
        { type: "bank", playerId: "mate", gained: 1400, total: 1400 }, // 3200 vs 2200
      ],
    } as unknown as GameState;
    expect(summarize(state, "you").maxDeficit).toBe(2200);
    // The whole side climbed out of it together, so the partner's is the same.
    expect(summarize(state, "mate").maxDeficit).toBe(2200);
  });

  it("counts hot dice per turn, not just per game", () => {
    const state = {
      winnerId: "you",
      config: { goal: 3000 },
      players: [{ id: "you", name: "You", isBot: false, total: 3000 }],
      log: [
        { type: "hot-dice", playerId: "you" },
        { type: "hot-dice", playerId: "you" },
        { type: "bank", playerId: "you", gained: 1600, total: 1600 },
        { type: "hot-dice", playerId: "you" }, // new turn: streak restarts
        { type: "bust", playerId: "you", lostPoints: 700 },
      ],
    } as unknown as GameState;
    const s = summarize(state, "you");
    expect(s.hotDice).toBe(3);
    expect(s.bestHotStreak).toBe(2);
  });
});

describe("recordGame + achievements", () => {
  function summaryOf(over: Partial<GameSummary>): GameSummary {
    return {
      won: false,
      finalTotal: 0,
      bestTurn: 0,
      banks: 0,
      busts: 0,
      hotDice: 0,
      turns: 0,
      bankedPoints: 0,
      opponents: 1,
      maxDeficit: 0,
      bestHotStreak: 0,
      ...over,
    };
  }

  it("unlocks First Blood on a win and tracks the streak", () => {
    const r = recordGame(summaryOf({ won: true, finalTotal: 2000 }));
    expect(r.profile.wins).toBe(1);
    expect(r.profile.currentStreak).toBe(1);
    expect(r.unlocked.map((a) => a.id)).toContain("first-win");
  });

  it("unlocks Hat Trick only after three straight wins", () => {
    recordGame(summaryOf({ won: true }));
    recordGame(summaryOf({ won: true }));
    const third = recordGame(summaryOf({ won: true }));
    expect(third.profile.currentStreak).toBe(3);
    expect(third.unlocked.map((a) => a.id)).toContain("hat-trick");
  });

  it("resets the streak on a loss", () => {
    recordGame(summaryOf({ won: true }));
    const loss = recordGame(summaryOf({ won: false }));
    expect(loss.profile.currentStreak).toBe(0);
  });

  it("unlocks Giant Slayer only when beating a reckless bot", () => {
    const tame = recordGame(summaryOf({ won: true, boldestOpponent: "balanced" }));
    expect(tame.unlocked.map((a) => a.id)).not.toContain("giant-slayer");
    const reckless = recordGame(summaryOf({ won: true, boldestOpponent: "reckless" }));
    expect(reckless.unlocked.map((a) => a.id)).toContain("giant-slayer");
  });

  it("awards Blitz only for a fast win at a real goal", () => {
    // A short win at a tiny custom goal must not count — that's the whole point
    // of the 3000 floor.
    const cheap = recordGame(summaryOf({ won: true, finalTotal: 600, turns: 2 }));
    expect(cheap.unlocked.map((a) => a.id)).not.toContain("blitz");
    const real = recordGame(summaryOf({ won: true, finalTotal: 3200, turns: 5 }));
    expect(real.unlocked.map((a) => a.id)).toContain("blitz");
  });

  it("awards Comeback Kid only when the deficit was survived AND won", () => {
    const lost = recordGame(summaryOf({ won: false, maxDeficit: 2000 }));
    expect(lost.unlocked.map((a) => a.id)).not.toContain("comeback");
    const won = recordGame(summaryOf({ won: true, maxDeficit: 1500 }));
    expect(won.unlocked.map((a) => a.id)).toContain("comeback");
  });

  it("needs a ten-win streak for Unstoppable", () => {
    for (let i = 0; i < 9; i++) {
      expect(recordGame(summaryOf({ won: true })).unlocked.map((a) => a.id)).not.toContain(
        "unstoppable",
      );
    }
    expect(recordGame(summaryOf({ won: true })).unlocked.map((a) => a.id)).toContain("unstoppable");
  });

  it("does not award the same achievement twice", () => {
    recordGame(summaryOf({ won: true }));
    const second = recordGame(summaryOf({ won: true }));
    expect(second.unlocked.map((a) => a.id)).not.toContain("first-win");
  });
});

describe("averageBank", () => {
  it("is zero with no banked turns and rounds otherwise", () => {
    expect(averageBank(loadProfile())).toBe(0);
    recordGame({
      won: true,
      finalTotal: 900,
      bestTurn: 500,
      banks: 3,
      busts: 0,
      hotDice: 0,
      turns: 3,
      bankedPoints: 1000,
      opponents: 1,
      maxDeficit: 0,
      bestHotStreak: 0,
    });
    expect(averageBank(loadProfile())).toBe(333); // 1000 / 3, rounded
  });
});

describe("achievement tiers", () => {
  it("gives every badge a tier", () => {
    for (const a of ACHIEVEMENTS) expect(TIER_POINTS[a.tier], a.id).toBeGreaterThan(0);
  });

  it("scores a profile by tier weight, not badge count", () => {
    expect(achievementScore(loadProfile())).toBe(0);
    const bronze = ACHIEVEMENTS.find((a) => a.tier === "bronze")!;
    const gold = ACHIEVEMENTS.find((a) => a.tier === "gold")!;
    awardAchievement(bronze.id);
    expect(achievementScore(loadProfile())).toBe(TIER_POINTS.bronze);
    awardAchievement(gold.id);
    expect(achievementScore(loadProfile())).toBe(TIER_POINTS.bronze + TIER_POINTS.gold);
    // Two badges, but not two equal badges.
    expect(TIER_POINTS.gold).toBeGreaterThan(TIER_POINTS.bronze);
  });

  it("caps at the maximum when everything is unlocked", () => {
    for (const a of ACHIEVEMENTS) awardAchievement(a.id);
    expect(achievementScore(loadProfile())).toBe(maxAchievementScore());
  });
});

describe("awardAchievement", () => {
  it("grants a badge that no game can earn, once", () => {
    const first = awardAchievement("daily-elite");
    expect(first?.id).toBe("daily-elite");
    expect(loadProfile().achievements).toContain("daily-elite");
    expect(awardAchievement("daily-elite")).toBeNull();
  });

  it("ignores an unknown id", () => {
    expect(awardAchievement("no-such-badge")).toBeNull();
  });

  it("keeps the daily badge out of the game-driven path", () => {
    // It has no `earned` predicate, so no combination of results can unlock it.
    expect(ACHIEVEMENTS.find((a) => a.id === "daily-elite")!.earned).toBeUndefined();
  });
});
