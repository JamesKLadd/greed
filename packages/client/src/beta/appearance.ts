import type { CSSProperties } from "react";
import { DICE_SKINS, TABLE_THEMES, isUnlocked } from "../game/cosmetics.js";
import type { Profile } from "../game/profile.js";
import { MASCOTS, FRAMES, BACKGROUNDS, NAMEPLATES, cleanBetaIdentity } from "@greed/protocol";
export { MASCOTS, FRAMES, BACKGROUNDS, NAMEPLATES };

export const APPEARANCE_KEY = "greed:visual-beta:appearance:v1";
export const SAMPLE_DICE = ["house", "circuit", "volcanic"] as const;
export const SAMPLE_TABLES = ["club", "afterhours"] as const;
export interface Appearance {
  version: 1;
  dice: string;
  table: string;
  mascot: string;
  frame: string;
  background: string;
  nameplate: string;
  badge: string;
}
export const DEFAULT_APPEARANCE: Appearance = {
  version: 1,
  dice: "house",
  table: "club",
  mascot: "fox",
  frame: "brass",
  background: "felt",
  nameplate: "classic",
  badge: "",
};
const pick = (value: unknown, ids: readonly string[], fallback: string) =>
  typeof value === "string" && ids.includes(value) ? value : fallback;
/** Unknown future IDs and malformed browser data resolve to readable defaults. */
export function normalizeAppearance(raw: unknown): Appearance {
  const p = raw && typeof raw === "object" ? (raw as Partial<Appearance>) : {};
  return {
    version: 1,
    dice: pick(p.dice, [...SAMPLE_DICE, ...DICE_SKINS.map((c) => c.id)], "house"),
    table: pick(p.table, [...SAMPLE_TABLES, ...TABLE_THEMES.map((c) => c.id)], "club"),
    mascot: pick(p.mascot, MASCOTS, "fox"),
    frame: pick(p.frame, FRAMES, "brass"),
    background: pick(p.background, BACKGROUNDS, "felt"),
    nameplate: pick(p.nameplate, NAMEPLATES, "classic"),
    badge: typeof p.badge === "string" && p.badge.length < 64 ? p.badge : "",
  };
}
export function readAppearance(storage: Pick<Storage, "getItem">): Appearance {
  try {
    return normalizeAppearance(JSON.parse(storage.getItem(APPEARANCE_KEY) ?? "null"));
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}
export function writeAppearance(storage: Pick<Storage, "setItem">, value: Appearance): void {
  try {
    storage.setItem(APPEARANCE_KEY, JSON.stringify(normalizeAppearance(value)));
  } catch {
    /* The provider keeps the selection in memory. */
  }
}
export function canEquipAppearance(a: Appearance, p: Profile): boolean {
  return (
    a.version === 1 &&
    (a.dice === "house" || DICE_SKINS.some((c) => c.id === a.dice && isUnlocked(c, p))) &&
    (a.table === "club" || TABLE_THEMES.some((c) => c.id === a.table && isUnlocked(c, p))) &&
    MASCOTS.includes(a.mascot as (typeof MASCOTS)[number]) &&
    FRAMES.includes(a.frame as (typeof FRAMES)[number]) &&
    BACKGROUNDS.includes(a.background as (typeof BACKGROUNDS)[number]) &&
    NAMEPLATES.includes(a.nameplate as (typeof NAMEPLATES)[number]) &&
    (!a.badge || p.achievements.includes(a.badge))
  );
}

/**
 * Account equipment wins over the former session samples. Keep portrait choices,
 * but never turn a preview into an earned cosmetic or change progression on load.
 */
export function resolveEquippedAppearance(
  p: Profile,
  previous: Appearance = DEFAULT_APPEARANCE,
): Appearance {
  const identity = normalizeAppearance({ ...previous, ...p.visualBeta });
  const dice = DICE_SKINS.find((c) => c.id === p.dice);
  const table = TABLE_THEMES.find((c) => c.id === p.table);
  return {
    ...identity,
    dice: dice && dice.id !== "ivory" && isUnlocked(dice, p) ? dice.id : "house",
    table: table && table.id !== "classic" && isUnlocked(table, p) ? table.id : "club",
    badge: p.achievements.includes(identity.badge) ? identity.badge : "",
  };
}

/** Validate the entire selection before producing a profile for the equip action. */
export function profileWithAppearance(a: Appearance, p: Profile): Profile | null {
  if (!canEquipAppearance(a, p)) return null;
  return {
    ...p,
    dice: a.dice === "house" ? "ivory" : a.dice,
    table: a.table === "club" ? "classic" : a.table,
    visualBeta: cleanBetaIdentity(a),
  };
}
export function appearanceVars(a: Appearance): CSSProperties {
  const dice = DICE_SKINS.find((c) => c.id === a.dice)?.vars ?? {
    "--die-c1": a.dice === "circuit" ? "#123e4b" : a.dice === "volcanic" ? "#52382f" : "#fff4d6",
    "--die-c2": a.dice === "circuit" ? "#082632" : a.dice === "volcanic" ? "#231c21" : "#e6cf98",
    "--die-c3": "#151c22",
    "--die-pip": a.dice === "house" ? "#30281a" : "#effff7",
    "--die-pip2": "#cab77b",
    "--die-lip": "#ac8e56",
  };
  const table = TABLE_THEMES.find((c) => c.id === a.table)?.vars ?? {
    "--felt-1": a.table === "afterhours" ? "#262b58" : "#10523f",
    "--felt-2": a.table === "afterhours" ? "#10182e" : "#07352e",
    "--felt-edge": "#051d20",
  };
  const patterns: Record<string, string> = {
    house: "repeating-linear-gradient(45deg,transparent 0 9px,#8a65231c 9px 10px)",
    circuit:
      "repeating-linear-gradient(90deg,transparent 0 9px,#31ffe538 9px 10px),repeating-linear-gradient(0deg,transparent 0 9px,#31ffe538 9px 10px)",
    volcanic:
      "linear-gradient(32deg,transparent 43%,#ff7a3870 44%,#ffb36d 45%,transparent 47%),linear-gradient(123deg,transparent 60%,#ff633e 61%,transparent 64%)",
    obsidian:
      "conic-gradient(from 20deg at 20% 30%,#ffffff18,transparent 100deg,#ffffff10 190deg,transparent 280deg)",
    gold: "repeating-linear-gradient(0deg,#fff3 0 1px,transparent 1px 4px)",
    neon: "repeating-linear-gradient(90deg,transparent 0 9px,#fff5 9px 10px)",
    molten:
      "linear-gradient(135deg,transparent 35%,#ffb84180 36%,transparent 39%,transparent 60%,#ffb84160 61%,transparent 64%)",
  };
  return {
    ...dice,
    ...table,
    "--beta-die-pattern": patterns[a.dice] ?? "none",
    "--beta-particle-radius":
      a.dice === "house" ? "50%" : a.dice === "volcanic" ? "70% 0 70% 0" : "1px",
    "--beta-particle-ms":
      a.dice === "volcanic" ? "1300ms" : a.dice === "circuit" ? "700ms" : "950ms",
    "--beta-effect-color":
      a.dice === "circuit" ? "#65ffe8" : a.dice === "volcanic" ? "#ff9765" : "#ffe5a5",
    "--beta-table-pattern":
      a.table === "afterhours"
        ? "radial-gradient(circle,#d1c1ff30 1px,transparent 1.5px)"
        : "repeating-linear-gradient(45deg,#ffffff04 0 1px,transparent 1px 5px)",
  } as CSSProperties;
}
