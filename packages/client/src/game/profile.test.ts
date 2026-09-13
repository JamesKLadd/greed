import { beforeEach, describe, expect, it } from "vitest";
import type { GameState } from "@greed/core";
import { applyAction, BEST_TOTAL_CEILING, createGame, diceToRoll, GOAL_DEFAULT } from "@greed/core";
import {
  ACHIEVEMENTS,
  achievementScore,
  averageBank,
  awardAchievement,
  DAILY_STREAK_BADGES,
  loadProfile,
  maxAchievementScore,
  raiseBestTurn,
  raiseDailyWins,
  recordGame,
  summarize,
  TIER_POINTS,
  type GameSummary,
} from "./profile.js";
import { DICE_SKINS, TABLE_THEMES } from "./cosmetics.js";

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

describe("super busts", () => {
  /**
   * A bust is a super bust when the throw that busted was a full cup of five.
   * The log does not label it — the engine has no reason to — so summarize
   * reads the size of the throw immediately before the bust, which is the only
   * throw a bust can ever belong to.
   */
  function runOf(events: unknown[]): GameState {
    return {
      winnerId: "you",
      config: { goal: GOAL_DEFAULT },
      players: [
        { id: "you", name: "You", isBot: false, total: 0 },
        { id: "b1", name: "Bot 1", isBot: true, botPersonality: "cautious", total: 0 },
      ],
      log: events,
    } as unknown as GameState;
  }
  const roll = (playerId: string, n: number) => ({
    type: "roll",
    playerId,
    dice: Array.from({ length: n }, () => 2),
    result: { points: 0, isHotDice: false },
  });
  const bust = (playerId: string) => ({ type: "bust", playerId, lostPoints: 0 });

  it("counts a bust on the opening throw of a turn", () => {
    const s = summarize(runOf([roll("you", 5), bust("you")]), "you");
    expect(s.busts).toBe(1);
    expect(s.superBusts).toBe(1);
  });

  it("counts a bust on the fresh five off a cleared mat", () => {
    // Hot dice, then five new dice, then nothing: the other way a full cup is
    // thrown, and the one a player feels hardest.
    const s = summarize(
      runOf([roll("you", 5), { type: "hot-dice", playerId: "you" }, roll("you", 5), bust("you")]),
      "you",
    );
    expect(s.superBusts).toBe(1);
  });

  it("does not count a bust on a partial throw", () => {
    const s = summarize(runOf([roll("you", 5), roll("you", 2), bust("you")]), "you");
    expect(s.busts).toBe(1);
    expect(s.superBusts).toBe(0);
  });

  it("is not fooled by someone else's five", () => {
    // Another seat throwing a full cup between your throw and your bust must
    // not decide what your bust was: only your own throws are read.
    const s = summarize(runOf([roll("you", 3), roll("b1", 5), bust("you")]), "you");
    expect(s.superBusts).toBe(0);
  });

  it("adds up across a game and into the profile", () => {
    const state = runOf([
      roll("you", 5),
      bust("you"),
      roll("you", 1),
      bust("you"),
      roll("you", 5),
      bust("you"),
    ]);
    const s = summarize(state, "you");
    expect(s.busts).toBe(3);
    expect(s.superBusts).toBe(2);

    recordGame(s);
    expect(loadProfile().superBusts).toBe(2);
    recordGame(s);
    expect(loadProfile().superBusts).toBe(4);
  });
});

/**
 * The hand-built logs above assume the shape doRoll writes: a bust is always
 * preceded by its own throw. That assumption is the whole mechanism, so it is
 * checked against the real engine rather than against more fixtures.
 */
describe("super busts, counted off real games", () => {
  it("matches the throws that actually busted, across many seeds", () => {
    const players = [
      { id: "you", name: "You", isBot: false },
      { id: "b1", name: "Bot 1", isBot: true },
    ];
    let seen = 0;
    let withFullCup = 0;
    for (let seed = 1; seed <= 150; seed++) {
      let g = createGame(players, { goal: 100000, seed });
      // Roll relentlessly and never bank: the fastest way to a lot of busts.
      let expected = 0;
      for (let step = 0; step < 60; step++) {
        if (g.turn.outcome) {
          g = applyAction(g, { type: "ADVANCE" });
          continue;
        }
        const isYou = g.players[g.turn.playerIndex].id === "you";
        const cup = diceToRoll(g.turn).length;
        const after = applyAction(g, { type: "ROLL" });
        if (after === g) break; // nothing left to throw
        if (isYou && after.turn.busted && cup === 5) expected += 1;
        g = after;
      }
      const s = summarize(g, "you");
      expect(s.superBusts, `seed ${seed}`).toBe(expected);
      expect(s.superBusts).toBeLessThanOrEqual(s.busts);
      seen += s.busts;
      withFullCup += s.superBusts;
    }
    // The run has to actually contain both kinds, or it proves nothing.
    expect(seen).toBeGreaterThan(50);
    expect(withFullCup).toBeGreaterThan(0);
    expect(withFullCup).toBeLessThan(seen);
  });
});

describe("recordGame + achievements", () => {
  function summaryOf(over: Partial<GameSummary>): GameSummary {
    return {
      won: false,
      finalTotal: 0,
      goal: GOAL_DEFAULT,
      bestTurn: 0,
      banks: 0,
      busts: 0,
      superBusts: 0,
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

  describe("best total is a standard-game figure", () => {
    it("records a total from a game at the standard goal", () => {
      const r = recordGame(summaryOf({ finalTotal: 3200, goal: GOAL_DEFAULT }));
      expect(r.profile.bestTotal).toBe(3200);
    });

    it("ignores a total from a game with the goal set elsewhere", () => {
      // The whole exploit: set the goal high, play on, post a career best no
      // standard game could ever reach.
      const r = recordGame(summaryOf({ finalTotal: 50000, goal: 100000 }));
      expect(r.profile.bestTotal).toBe(0);
    });

    it("ignores a short game too — the rule is the standard goal, not a range", () => {
      const r = recordGame(summaryOf({ finalTotal: 1100, goal: 1000 }));
      expect(r.profile.bestTotal).toBe(0);
    });

    it("keeps an earlier standard-game best when a rigged game follows", () => {
      recordGame(summaryOf({ finalTotal: 3400, goal: GOAL_DEFAULT }));
      const r = recordGame(summaryOf({ finalTotal: 90000, goal: 90000 }));
      expect(r.profile.bestTotal).toBe(3400);
    });

    it("voids a stored total from before the rule, on the way out of storage", () => {
      // A monotonic merge would otherwise push this straight back up to the
      // server after every clean-up.
      const saved = { ...loadProfile(), bestTotal: BEST_TOTAL_CEILING + 1 };
      localStorage.setItem("greed:profile", JSON.stringify(saved));
      expect(loadProfile().bestTotal).toBe(0);
    });

    it("leaves a believable stored total alone", () => {
      const saved = { ...loadProfile(), bestTotal: BEST_TOTAL_CEILING };
      localStorage.setItem("greed:profile", JSON.stringify(saved));
      expect(loadProfile().bestTotal).toBe(BEST_TOTAL_CEILING);
    });
  });
});

describe("averageBank", () => {
  it("is zero with no banked turns and rounds otherwise", () => {
    expect(averageBank(loadProfile())).toBe(0);
    recordGame({
      won: true,
      finalTotal: 900,
      goal: GOAL_DEFAULT,
      bestTurn: 500,
      banks: 3,
      busts: 0,
      superBusts: 0,
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

describe("daily streak badges", () => {
  it("names badges that actually exist, and none a game could win", () => {
    for (const b of DAILY_STREAK_BADGES) {
      const a = ACHIEVEMENTS.find((x) => x.id === b.id);
      expect(a, b.id).toBeDefined();
      // Awarded from the server's streak count, like the podium one — a
      // predicate here would let a local game hand out a daily badge.
      expect(a!.earned, b.id).toBeUndefined();
    }
  });

  it("asks for more days as it goes up", () => {
    const days = DAILY_STREAK_BADGES.map((b) => b.days);
    expect([...days].sort((a, b) => a - b)).toEqual(days);
    expect(new Set(days).size).toBe(days.length);
  });

  it("puts something in the locker behind every one of them", () => {
    // A badge with no reward attached is the sort of thing that only shows up
    // when somebody earns it, which is the worst time to find out.
    const gated = [...DICE_SKINS, ...TABLE_THEMES].flatMap((c) =>
      DAILY_STREAK_BADGES.filter((b) => c.unlock?.({ ...loadProfile(), achievements: [b.id] })).map(
        (b) => b.id,
      ),
    );
    for (const b of DAILY_STREAK_BADGES) expect(gated, b.id).toContain(b.id);
  });
});

describe("raiseDailyWins", () => {
  it("takes a higher count and reports the move", () => {
    expect(raiseDailyWins(2)).toBe(true);
    expect(loadProfile().dailyWins).toBe(2);
  });

  it("never lowers one, however often it is told to", () => {
    raiseDailyWins(5);
    expect(raiseDailyWins(3)).toBe(false);
    expect(raiseDailyWins(5)).toBe(false);
    expect(loadProfile().dailyWins).toBe(5);
  });
});

describe("raiseBestTurn", () => {
  it("takes a bigger turn from outside a recorded game", () => {
    // A daily run's best turn: no game to record, but a turn all the same.
    expect(raiseBestTurn(1400)).toBe(true);
    expect(loadProfile().bestTurn).toBe(1400);
  });

  it("never lowers what is already there, and says when it did nothing", () => {
    raiseBestTurn(1400);
    expect(raiseBestTurn(900)).toBe(false);
    expect(raiseBestTurn(1400)).toBe(false);
    expect(loadProfile().bestTurn).toBe(1400);
  });
});
