import { beforeEach, describe, expect, it } from "vitest";
import type { GameState } from "@greed/core";
import { averageBank, loadProfile, recordGame, summarize, type GameSummary } from "./profile.js";

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
      { id: "b1", name: "Bot 1", isBot: true, botDifficulty: "medium", total: 900 },
      { id: "b2", name: "Bot 2", isBot: true, botDifficulty: "expert", total: 1500 },
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
    expect(s.hardestOpponent).toBe("expert"); // hardest of medium/expert
  });

  it("marks a loss when someone else won", () => {
    const s = summarize(fakeState(), "b1");
    expect(s.won).toBe(false);
    expect(s.finalTotal).toBe(900);
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

  it("unlocks Giant Slayer only when beating an expert", () => {
    const notExpert = recordGame(summaryOf({ won: true, hardestOpponent: "hard" }));
    expect(notExpert.unlocked.map((a) => a.id)).not.toContain("giant-slayer");
    const expert = recordGame(summaryOf({ won: true, hardestOpponent: "expert" }));
    expect(expert.unlocked.map((a) => a.id)).toContain("giant-slayer");
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
    });
    expect(averageBank(loadProfile())).toBe(333); // 1000 / 3, rounded
  });
});
