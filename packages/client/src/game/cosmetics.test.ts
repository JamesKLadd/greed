import { describe, expect, it } from "vitest";
import type { Profile } from "./profile.js";
import { DICE_SKINS, TABLE_THEMES, cosmeticVars, isUnlocked, tableVars } from "./cosmetics.js";

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
    superBusts: 0,
    dailyWins: 0,
    weeklyWins: 0,
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

describe("tableVars", () => {
  /** The themes a fresh profile can equip, for picking a locked one. */
  const locked = TABLE_THEMES.find((c) => c.unlock)!;

  it("returns the mat without any of the dice skin", () => {
    // Online this is composed with ANOTHER player's dice vars, so anything
    // die-shaped leaking out of here would repaint their dice with this
    // viewer's colours — including the scoring-die overrides "eclipse" sets.
    const vars = tableVars(profile({ table: "midnight", dice: "eclipse" })) as Record<
      string,
      string
    >;
    for (const key of Object.keys(vars)) {
      expect(key.startsWith("--felt") || key.startsWith("--rail"), key).toBe(true);
    }
  });

  it("falls back to the default mat when the equipped one is not unlocked", () => {
    const equipped = tableVars(profile({ table: locked.id })) as Record<string, string>;
    const fallback = tableVars(profile({ table: TABLE_THEMES[0].id })) as Record<string, string>;
    expect(equipped).toEqual(fallback);
  });

  it("agrees with cosmeticVars about the mat", () => {
    // Offline reads the whole profile through cosmeticVars; online reads the mat
    // through here. The two must not drift, or the felt would change when you
    // moved between a local game and an online one.
    const p = profile({ table: "midnight" });
    const whole = cosmeticVars(p) as Record<string, string>;
    for (const [key, value] of Object.entries(tableVars(p) as Record<string, string>)) {
      expect(whole[key], key).toBe(value);
    }
  });
});
