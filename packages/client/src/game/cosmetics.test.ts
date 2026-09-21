import { describe, expect, it } from "vitest";
import type { Profile } from "./profile.js";
import { ACHIEVEMENTS } from "./profile.js";
import {
  DICE_SKINS,
  TABLE_THEMES,
  cosmeticVars,
  equippedDiceVars,
  isUnlocked,
  tableVars,
} from "./cosmetics.js";

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

describe("equippedDiceVars", () => {
  const unlockAll = (p: ReturnType<typeof profile>) => ({
    ...p,
    gamesPlayed: 100000,
    wins: 100000,
    bestTurn: 100000,
    bestTotal: 4000,
    bestStreak: 1000,
    hotDiceTotal: 100000,
    dailyWins: 100000,
    weeklyWins: 100000,
    achievements: ACHIEVEMENTS.map((a) => a.id),
  });

  it("gives the dice half of a look without its table", () => {
    // The challenges are played on a panel rather than on the felt, so they
    // want the player's dice and nothing else.
    // Every property a table theme can set, so "no table" is checked against
    // the real list rather than against a naming convention — the gold skin
    // sets `--score-*` as well as `--die-*`, and a prefix test called that a
    // table variable.
    const tableKeys = new Set(TABLE_THEMES.flatMap((t) => Object.keys(t.vars)));
    for (const skin of DICE_SKINS) {
      const p = unlockAll(profile({ dice: skin.id }));
      const vars = equippedDiceVars(p) as Record<string, string>;
      expect(vars, skin.id).toEqual(skin.vars);
      expect(
        Object.keys(vars).filter((k) => tableKeys.has(k)),
        skin.id,
      ).toEqual([]);
    }
  });

  it("agrees with the dice half of the full look", () => {
    // One definition: cosmeticVars is built on this, so a skin can never look
    // one way at the table and another in a challenge.
    const p = unlockAll(profile({ dice: DICE_SKINS[DICE_SKINS.length - 1].id }));
    const full = cosmeticVars(p) as Record<string, string>;
    for (const [k, v] of Object.entries(equippedDiceVars(p) as Record<string, string>)) {
      expect(full[k], k).toBe(v);
    }
  });

  it("falls back to the default when the equipped skin is locked", () => {
    // Equipping something and then resetting your stats leaves a skin you no
    // longer own; the table already handled that and so must this.
    const locked = DICE_SKINS.find((s) => s.unlock);
    if (!locked) throw new Error("no lockable dice skin to test with");
    const p = profile({ dice: locked.id });
    expect(isUnlocked(locked, p)).toBe(false);
    expect(equippedDiceVars(p)).toEqual(DICE_SKINS[0].vars);
  });

  it("falls back to the default for a skin that does not exist", () => {
    expect(equippedDiceVars(profile({ dice: "no-such-skin" }))).toEqual(DICE_SKINS[0].vars);
  });
});
