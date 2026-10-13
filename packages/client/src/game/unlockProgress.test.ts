import { describe, expect, it } from "vitest";
import { DICE_SKINS, TABLE_THEMES, isUnlocked } from "./cosmetics.js";
import { loadProfile } from "./profile.js";
import { achievementUnlockProgress, cosmeticUnlockProgress } from "./unlockProgress.js";

describe("locker unlock progress", () => {
  it.each([
    { id: "slate", field: "gamesPlayed", target: 5, metric: "games", list: TABLE_THEMES },
    { id: "midnight", field: "wins", target: 5, metric: "wins", list: TABLE_THEMES },
    { id: "sapphire", field: "wins", target: 10, metric: "wins", list: DICE_SKINS },
  ] as const)("shows the real counter at the $id unlock boundary", (item) => {
    const cosmetic = item.list.find((c) => c.id === item.id)!;
    const before = { ...loadProfile(), [item.field]: item.target - 1 };
    const earned = { ...before, [item.field]: item.target };
    expect(cosmeticUnlockProgress(item.id, before)).toEqual({
      kind: "counter",
      metric: item.metric,
      current: item.target - 1,
      target: item.target,
    });
    expect(isUnlocked(cosmetic, before)).toBe(false);
    expect(isUnlocked(cosmetic, earned)).toBe(true);
  });

  it("uses best winning streak so a later loss does not erase earned progress", () => {
    const profile = { ...loadProfile(), currentStreak: 0, bestStreak: 4 };
    expect(cosmeticUnlockProgress("amethyst", profile)).toEqual({
      kind: "counter",
      metric: "bestStreak",
      current: 4,
      target: 5,
    });
    expect(cosmeticUnlockProgress("peacock", profile)).toMatchObject({ current: 4, target: 10 });
  });

  it("shares achievement progress across the cosmetic and avatar earned by it", () => {
    const profile = { ...loadProfile(), bestTurn: 1350 };
    expect(cosmeticUnlockProgress("molten", profile)).toEqual(
      cosmeticUnlockProgress("whale", profile),
    );
    expect(cosmeticUnlockProgress("whale", profile)).toEqual({
      kind: "counter",
      metric: "bestTurn",
      current: 1350,
      target: 1500,
    });
  });

  it("does not grant badges or claim completion from a challenge best turn", () => {
    const profile = { ...loadProfile(), bestTurn: 1600 };
    const before = structuredClone(profile);
    const molten = DICE_SKINS.find((c) => c.id === "molten")!;
    expect(cosmeticUnlockProgress("molten", profile)).toBeNull();
    expect(isUnlocked(molten, profile)).toBe(false);
    expect(profile).toEqual(before);
  });

  it("uses lifetime banked points, not the best individual bank", () => {
    const profile = { ...loadProfile(), totalBankedPoints: 17250, bestTurn: 2000 };
    expect(cosmeticUnlockProgress("rosewood", profile)).toEqual({
      kind: "counter",
      metric: "banked",
      current: 17250,
      target: 25000,
    });
  });

  it("does not guess challenge streaks from previously earned badges or game streaks", () => {
    const profile = { ...loadProfile(), bestStreak: 10, achievements: ["daily-streak-3"] };
    expect(cosmeticUnlockProgress("comet", profile)).toEqual({
      kind: "hint",
      hint: "dailyStreak",
    });
    expect(cosmeticUnlockProgress("keystone", profile)).toEqual({
      kind: "hint",
      hint: "weeklyStreak",
    });
  });

  it("does not turn lifetime totals into progress for one-game feats", () => {
    const profile = { ...loadProfile(), hotDiceTotal: 200, bestTotal: 3950 };
    expect(cosmeticUnlockProgress("ocean", profile)).toEqual({
      kind: "hint",
      hint: "singleGame",
    });
    expect(cosmeticUnlockProgress("sunset", profile)).toEqual({
      kind: "hint",
      hint: "singleGame",
    });
    expect(achievementUnlockProgress("inferno", profile)).toEqual({
      kind: "hint",
      hint: "singleGame",
    });
  });

  it("needs no progress for free, unknown or already earned items", () => {
    const profile = { ...loadProfile(), achievements: ["veteran"] };
    expect(cosmeticUnlockProgress("obsidian", profile)).toBeNull();
    expect(cosmeticUnlockProgress("ivory", profile)).toBeNull();
    expect(cosmeticUnlockProgress("future-item", profile)).toBeNull();
  });
});
