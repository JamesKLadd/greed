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
  {
    id: "sapphire",
    name: "Sapphire",
    requirement: "Win 10 games",
    unlock: (p) => p.wins >= 10,
    vars: {
      "--die-c1": "#a9c7ff",
      "--die-c2": "#4f7fe0",
      "--die-c3": "#274fb0",
      "--die-pip": "#071026",
      "--die-pip2": "#cfe0ff",
      "--die-lip": "rgba(10,20,60,0.32)",
    },
  },
  {
    id: "emerald",
    name: "Emerald",
    requirement: "Play 25 games",
    unlock: (p) => p.achievements.includes("dedicated"),
    vars: {
      "--die-c1": "#a8f0c8",
      "--die-c2": "#34c07a",
      "--die-c3": "#1a8f52",
      "--die-pip": "#052015",
      "--die-pip2": "#d6ffe8",
      "--die-lip": "rgba(6,50,30,0.3)",
    },
  },
  {
    id: "amethyst",
    name: "Amethyst",
    requirement: "Win five games in a row",
    unlock: (p) => p.achievements.includes("on-fire"),
    vars: {
      "--die-c1": "#dcb6ff",
      "--die-c2": "#a24be0",
      "--die-c3": "#6f1fb0",
      "--die-pip": "#1a0630",
      "--die-pip2": "#f0d6ff",
      "--die-lip": "rgba(40,0,60,0.32)",
    },
  },
  {
    id: "rose-gold",
    name: "Rose Gold",
    requirement: "Win 25 games",
    unlock: (p) => p.achievements.includes("champion"),
    vars: {
      "--die-c1": "#ffd9d0",
      "--die-c2": "#e6a08c",
      "--die-c3": "#c9776a",
      "--die-pip": "#3a1410",
      "--die-pip2": "#fff0ec",
      "--die-lip": "rgba(120,60,50,0.3)",
    },
  },
  {
    id: "molten",
    name: "Molten",
    requirement: "Bank 1500+ in one turn",
    unlock: (p) => p.achievements.includes("moonshot"),
    vars: {
      "--die-c1": "#ffd08a",
      "--die-c2": "#ff7a3c",
      "--die-c3": "#d23a1f",
      "--die-pip": "#2a0a04",
      "--die-pip2": "#ffe3c0",
      "--die-lip": "rgba(80,20,5,0.32)",
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
  {
    id: "sunset",
    name: "Sunset",
    requirement: "Finish a game with 5000+",
    unlock: (p) => p.achievements.includes("landslide"),
    vars: {
      "--felt-1": "#a4472e",
      "--felt-2": "#5a2440",
      "--felt-edge": "#2e1020",
      "--rail-1": "#8a5a3a",
      "--rail-2": "#43301c",
    },
  },
  {
    id: "emerald-felt",
    name: "Emerald Table",
    requirement: "Play a 20+ turn game",
    unlock: (p) => p.achievements.includes("marathon"),
    vars: {
      "--felt-1": "#147a4a",
      "--felt-2": "#0a5230",
      "--felt-edge": "#063620",
      "--rail-1": "#7a6a30",
      "--rail-2": "#43401c",
    },
  },
  {
    id: "sand",
    name: "Desert Sand",
    requirement: "Win with 4+ opponents",
    unlock: (p) => p.achievements.includes("full-table"),
    vars: {
      "--felt-1": "#c9a95f",
      "--felt-2": "#9a7d3f",
      "--felt-edge": "#6a5426",
      "--rail-1": "#7a5330",
      "--rail-2": "#43301c",
    },
  },
  {
    id: "obsidian-felt",
    name: "Obsidian Table",
    requirement: "Beat an expert clean",
    unlock: (p) => p.achievements.includes("untouchable"),
    vars: {
      "--felt-1": "#22232a",
      "--felt-2": "#141419",
      "--felt-edge": "#08080b",
      "--rail-1": "#4a4a55",
      "--rail-2": "#24242b",
    },
  },
  {
    id: "rosewood",
    name: "Rosewood",
    requirement: "Bank 25,000 lifetime",
    unlock: (p) => p.achievements.includes("big-banker"),
    vars: {
      "--felt-1": "#7a3050",
      "--felt-2": "#4a1c33",
      "--felt-edge": "#2a0e1d",
      "--rail-1": "#6a4a3a",
      "--rail-2": "#3a241c",
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

/**
 * Dice-only CSS variables (no table theme). Used online, where a player's dice
 * skin is shown only while it's their turn — the shared felt stays the default
 * so everyone sees the same table.
 */
export function diceCosmeticVars(profile: Profile): CSSProperties {
  const dice = find(DICE_SKINS, profile.dice);
  const diceVars = isUnlocked(dice, profile) ? dice.vars : DICE_SKINS[0].vars;
  return { ...diceVars } as CSSProperties;
}
