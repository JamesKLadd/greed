import type { CSSProperties } from "react";
import type { Profile } from "./profile.js";

/**
 * Unlockable cosmetics: dice skins and table themes. Each carries a set of CSS
 * custom-property overrides (applied inline on the in-game root) and an optional
 * unlock condition against the local profile. Purely visual — no engine effect.
 */

export interface Cosmetic {
  id: string;
  name: string;
  vars: Record<string, string>;
  /** Human-readable unlock requirement (omit for always-available items). */
  requirement?: string;
  /** True when the profile has earned it (omit => free from the start). */
  unlock?: (p: Profile) => boolean;
}

export const DICE_SKINS: Cosmetic[] = [
  {
    id: "ivory",
    name: "Ivory",
    vars: {
      "--die-c1": "#ffffff",
      "--die-c2": "#f4ecd8",
      "--die-c3": "#e4d8bd",
      "--die-pip": "#201709",
      "--die-pip2": "#6a5942",
      "--die-lip": "rgba(120,100,60,0.22)",
    },
  },
  {
    id: "crimson",
    name: "Crimson",
    requirement: "Win your first game",
    unlock: (p) => p.achievements.includes("first-win"),
    vars: {
      "--die-c1": "#ff6b63",
      "--die-c2": "#d23b34",
      "--die-c3": "#a52822",
      "--die-pip": "#2a0a08",
      "--die-pip2": "#ff9d97",
      "--die-lip": "rgba(80,10,10,0.3)",
    },
  },
  {
    id: "obsidian",
    name: "Obsidian",
    requirement: "Play 10 games",
    unlock: (p) => p.achievements.includes("veteran"),
    vars: {
      "--die-c1": "#4a4a55",
      "--die-c2": "#2b2b33",
      "--die-c3": "#17171d",
      "--die-pip": "#f0f0f8",
      "--die-pip2": "#9a9ab0",
      "--die-lip": "rgba(0,0,0,0.45)",
    },
  },
  {
    id: "gold",
    name: "Gold",
    requirement: "Finish a game with 3000+",
    unlock: (p) => p.achievements.includes("high-roller"),
    vars: {
      "--die-c1": "#ffe9a8",
      "--die-c2": "#f5c451",
      "--die-c3": "#c9971f",
      "--die-pip": "#4a3410",
      "--die-pip2": "#fff3cf",
      "--die-lip": "rgba(120,80,10,0.32)",
    },
  },
  {
    id: "neon",
    name: "Neon",
    requirement: "Bank 1000+ in one turn",
    unlock: (p) => p.achievements.includes("big-turn"),
    vars: {
      "--die-c1": "#b6ffe6",
      "--die-c2": "#4be0c0",
      "--die-c3": "#1fb8ff",
      "--die-pip": "#06263a",
      "--die-pip2": "#d6fff5",
      "--die-lip": "rgba(0,40,60,0.3)",
    },
  },
];

export const TABLE_THEMES: Cosmetic[] = [
  {
    id: "classic",
    name: "Classic Green",
    vars: {
      "--felt-1": "#0f5132",
      "--felt-2": "#0a3d26",
      "--felt-edge": "#062a1a",
      "--rail-1": "#7a5330",
      "--rail-2": "#43301c",
    },
  },
  {
    id: "slate",
    name: "Slate",
    requirement: "Play 5 games",
    unlock: (p) => p.gamesPlayed >= 5,
    vars: {
      "--felt-1": "#2a3138",
      "--felt-2": "#1b2026",
      "--felt-edge": "#0f1215",
      "--rail-1": "#5a6068",
      "--rail-2": "#2a3138",
    },
  },
  {
    id: "midnight",
    name: "Midnight Blue",
    requirement: "Win 5 games",
    unlock: (p) => p.wins >= 5,
    vars: {
      "--felt-1": "#14315a",
      "--felt-2": "#0c1f3d",
      "--felt-edge": "#060f22",
      "--rail-1": "#4a5a7a",
      "--rail-2": "#1c2740",
    },
  },
  {
    id: "crimson-felt",
    name: "Crimson Felt",
    requirement: "Win without busting",
    unlock: (p) => p.achievements.includes("flawless"),
    vars: {
      "--felt-1": "#5a1414",
      "--felt-2": "#3d0c0c",
      "--felt-edge": "#220606",
      "--rail-1": "#7a4a30",
      "--rail-2": "#43241c",
    },
  },
  {
    id: "royal",
    name: "Royal Purple",
    requirement: "Win three in a row",
    unlock: (p) => p.achievements.includes("hat-trick"),
    vars: {
      "--felt-1": "#3a1f5a",
      "--felt-2": "#26123d",
      "--felt-edge": "#150622",
      "--rail-1": "#6a4a7a",
      "--rail-2": "#3a2440",
    },
  },
];

export function isUnlocked(item: Cosmetic, profile: Profile): boolean {
  return !item.unlock || item.unlock(profile);
}

function find(list: Cosmetic[], id: string): Cosmetic {
  return list.find((c) => c.id === id) ?? list[0];
}

/** Combined CSS-variable style for the profile's equipped dice + table (with fallbacks). */
export function cosmeticVars(profile: Profile): CSSProperties {
  const dice = find(DICE_SKINS, profile.dice);
  const table = find(TABLE_THEMES, profile.table);
  // Equipped-but-locked (e.g. after a reset) falls back to the default.
  const diceVars = isUnlocked(dice, profile) ? dice.vars : DICE_SKINS[0].vars;
  const tableVars = isUnlocked(table, profile) ? table.vars : TABLE_THEMES[0].vars;
  return { ...diceVars, ...tableVars } as CSSProperties;
}
