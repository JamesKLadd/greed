import type { CSSProperties } from "react";
import {
  DICE_SKINS,
  DIE_SHAPE_VAR,
  TABLE_THEMES,
  diceSkinVars,
  isUnlocked,
} from "../game/cosmetics.js";
import type { Profile } from "../game/profile.js";
import { MASCOTS, FRAMES, BACKGROUNDS, NAMEPLATES, HATS, cleanBetaIdentity } from "@greed/protocol";
import { adventDoorFor, adventUnlocked } from "../game/advent.js";
import { holidayUnlocker } from "../game/holidayDice.js";
export { MASCOTS, FRAMES, BACKGROUNDS, NAMEPLATES, HATS };

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
  hat: string;
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
  hat: "none",
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
    hat: pick(p.hat, HATS, "none"),
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
/**
 * Whether a hat is the player's: a holiday hat comes with its holiday's badge,
 * an advent hat with its door. "none" is always theirs.
 */
export function hatUnlocked(hat: string, p: Profile): boolean {
  if (hat === "none") return true;
  if (adventDoorFor(hat) !== undefined) return adventUnlocked(hat, p);
  const badge = holidayUnlocker(hat);
  return badge !== undefined && p.achievements.includes(badge);
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
    HATS.includes(a.hat as (typeof HATS)[number]) &&
    hatUnlocked(a.hat, p) &&
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
    hat: hatUnlocked(identity.hat, p) ? identity.hat : "none",
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
/**
 * A felt's weave, drawn on the small tile the table repeats (10-14px). Only the
 * new look has the tile to draw it on; Classic shows the same felts as colour.
 */
const TABLE_PATTERNS: Record<string, string> = {
  afterhours: "radial-gradient(circle,#d1c1ff30 1px,transparent 1.5px)",
  // The holiday felts.
  "confetti-felt":
    "radial-gradient(circle at 25% 30%,#ffd76e66 1px,transparent 1.6px),radial-gradient(circle at 75% 70%,#ff8fc066 1px,transparent 1.6px)",
  "sweetheart-felt": "radial-gradient(circle,#ffc2cf33 1.4px,transparent 2px)",
  "clover-felt":
    "radial-gradient(circle at 30% 30%,#7ee08a40 1.5px,transparent 2px),radial-gradient(circle at 70% 70%,#7ee08a30 1px,transparent 1.5px)",
  "beach-towel-felt": "repeating-linear-gradient(90deg,#ffffff22 0 3px,transparent 3px 7px)",
  "haunted-felt":
    "repeating-linear-gradient(45deg,#bba6b91c 0 1px,transparent 1px 6px),repeating-linear-gradient(-45deg,#bba6b912 0 1px,transparent 1px 6px)",
  "harvest-felt":
    "repeating-linear-gradient(0deg,#f2b23c22 0 2px,transparent 2px 7px),repeating-linear-gradient(90deg,#00000022 0 2px,transparent 2px 7px)",
  "tartan-felt":
    "repeating-linear-gradient(0deg,#b8323c33 0 3px,transparent 3px 7px),repeating-linear-gradient(90deg,#b8323c33 0 3px,transparent 3px 7px),repeating-linear-gradient(90deg,#f2d27a22 0 1px,transparent 1px 7px)",
  // Behind the advent calendar's doors.
  "peppermint-felt": "repeating-linear-gradient(45deg,#ffffff1f 0 3px,transparent 3px 7px)",
  "snowfall-felt":
    "radial-gradient(circle at 30% 30%,#ffffff40 1px,transparent 1.6px),radial-gradient(circle at 75% 65%,#ffffff2a 0.8px,transparent 1.4px)",
  "fireside-felt": "repeating-linear-gradient(0deg,#00000018 0 2px,transparent 2px 6px)",
  "gift-wrap-felt":
    "repeating-linear-gradient(90deg,#d8b25a26 0 2px,transparent 2px 7px),radial-gradient(circle,#d7263d33 1.2px,transparent 1.8px)",
  "aurora-felt":
    "linear-gradient(120deg,#7fd6c218,transparent 60%),radial-gradient(circle,#ffffff22 0.8px,transparent 1.3px)",
};

export function appearanceVars(a: Appearance): CSSProperties {
  const skin = DICE_SKINS.find((c) => c.id === a.dice);
  const dice: Record<string, string> = skin
    ? (diceSkinVars(skin) as Record<string, string>)
    : {
        "--die-c1":
          a.dice === "circuit" ? "#123e4b" : a.dice === "volcanic" ? "#52382f" : "#fff4d6",
        "--die-c2":
          a.dice === "circuit" ? "#082632" : a.dice === "volcanic" ? "#231c21" : "#e6cf98",
        "--die-c3": "#151c22",
        "--die-pip": a.dice === "house" ? "#30281a" : "#effff7",
        "--die-pip2": "#cab77b",
        "--die-lip": "#ac8e56",
        // The sample sets are cubes, and must say so: see diceSkinVars.
        [DIE_SHAPE_VAR]: "cube",
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
      TABLE_PATTERNS[a.table] ??
      "repeating-linear-gradient(45deg,#ffffff04 0 1px,transparent 1px 5px)",
  } as CSSProperties;
}
