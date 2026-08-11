import { describe, expect, it } from "vitest";
import type { Profile } from "./profile.js";
import { DICE_SKINS, TABLE_THEMES, cosmeticVars, isUnlocked } from "./cosmetics.js";

function profile(over: Partial<Profile> = {}): Profile {
  return {
    gamesPlayed: 0,
    wins: 0,
    currentStreak: 0,
    bestStreak: 0,
    bestTurn: 0,
    bestTotal: 0,
    totalBanks: 0,
    totalBankedPoints: 0,
    hotDiceTotal: 0,
    achievements: [],
    dice: "ivory",
    table: "classic",
    avatar: "",
    ...over,
  };
}

describe("isUnlocked", () => {
  it("free defaults are always unlocked", () => {
    const p = profile();
    expect(isUnlocked(DICE_SKINS[0], p)).toBe(true); // ivory
    expect(isUnlocked(TABLE_THEMES[0], p)).toBe(true); // classic
  });

  it("gated cosmetics respect the profile", () => {
    const crimson = DICE_SKINS.find((c) => c.id === "crimson")!;
    expect(isUnlocked(crimson, profile())).toBe(false);
    expect(isUnlocked(crimson, profile({ achievements: ["first-win"] }))).toBe(true);

    const midnight = TABLE_THEMES.find((c) => c.id === "midnight")!;
    expect(isUnlocked(midnight, profile({ wins: 4 }))).toBe(false);
    expect(isUnlocked(midnight, profile({ wins: 5 }))).toBe(true);
  });
});

describe("cosmeticVars", () => {
  it("merges the equipped dice + table variables", () => {
    const vars = cosmeticVars(profile({ dice: "ivory", table: "classic" })) as Record<
      string,
      string
    >;
    expect(vars["--die-c1"]).toBeDefined();
    expect(vars["--felt-1"]).toBeDefined();
  });

  it("falls back to defaults when the equipped item is locked", () => {
    // Equip obsidian (needs 10 games) with a fresh profile → should fall back to ivory.
    const equippedLocked = cosmeticVars(profile({ dice: "obsidian" })) as Record<string, string>;
    const ivory = cosmeticVars(profile({ dice: "ivory" })) as Record<string, string>;
    expect(equippedLocked["--die-c1"]).toBe(ivory["--die-c1"]);
  });
});
