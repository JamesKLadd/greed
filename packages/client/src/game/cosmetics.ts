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
      // Gold dice are already the colour a scoring die goes, so the usual
      // treatment would be invisible here. This set inverts instead: the face
      // that scored is struck dark with pale gold pips. Same idea — the scoring
      // face is the one that stopped looking like the others — reached from the
      // other direction, because on this skin that is the only direction left.
      "--score-1": "#6d4d16",
      "--score-2": "#402c09",
      "--score-3": "#241804",
      "--score-pip": "#f0cf80",
      "--score-pip2": "#fff6dd",
      "--score-lip": "rgba(0,0,0,0.45)",
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
  {
    id: "aurora",
    name: "Aurora",
    requirement: "Win from 1500 behind",
    unlock: (p) => p.achievements.includes("comeback"),
    vars: {
      "--die-c1": "#c9ffe9",
      "--die-c2": "#5fb6f0",
      "--die-c3": "#7a3fd0",
      "--die-pip": "#0a0a2e",
      "--die-pip2": "#e8faff",
      "--die-lip": "rgba(24,8,70,0.34)",
    },
  },
  {
    id: "platinum",
    name: "Platinum",
    requirement: "Win ten games in a row",
    unlock: (p) => p.achievements.includes("unstoppable"),
    vars: {
      "--die-c1": "#f6f9fc",
      "--die-c2": "#c3cdd8",
      "--die-c3": "#8b98a6",
      "--die-pip": "#1a2029",
      "--die-pip2": "#e8eef4",
      "--die-lip": "rgba(40,55,72,0.28)",
    },
  },
  // Streak rewards. Earned by coming back, not by any one good game, so they
  // run from first light through to a total eclipse.
  {
    id: "sunrise",
    name: "Sunrise",
    requirement: "Three days of dailies in a row",
    unlock: (p) => p.achievements.includes("daily-streak-3"),
    vars: {
      "--die-c1": "#ffe4c4",
      "--die-c2": "#ff9f68",
      "--die-c3": "#d2622f",
      "--die-pip": "#3a1405",
      "--die-pip2": "#fff1e2",
      "--die-lip": "rgba(100,40,10,0.3)",
    },
  },
  {
    id: "comet",
    name: "Comet",
    requirement: "Ten days of dailies in a row",
    unlock: (p) => p.achievements.includes("daily-streak-10"),
    vars: {
      "--die-c1": "#eaf4ff",
      "--die-c2": "#8fb4e8",
      "--die-c3": "#4a6bb0",
      "--die-pip": "#101a3a",
      "--die-pip2": "#ffffff",
      "--die-lip": "rgba(20,30,80,0.3)",
    },
  },
  {
    id: "eclipse",
    name: "Eclipse",
    // The longest ask in the game: twenty separate days.
    requirement: "Twenty days of dailies in a row",
    unlock: (p) => p.achievements.includes("daily-streak-20"),
    vars: {
      "--die-c1": "#2c2a33",
      "--die-c2": "#16151b",
      "--die-c3": "#08080b",
      "--die-pip": "#ffcf6b",
      "--die-pip2": "#fff0c4",
      "--die-lip": "rgba(0,0,0,0.6)",
      // A dark face with a burning corona: the usual pale-gold scoring wash
      // would erase the whole point of the skin, so a scoring die goes the
      // other way and lights up.
      "--score-1": "#ffdf9a",
      "--score-2": "#f0a83c",
      "--score-3": "#b35f10",
      "--score-pip": "#2a1500",
      "--score-pip2": "#fff3d4",
      "--score-lip": "rgba(90,45,0,0.4)",
    },
  },
  {
    id: "laurel",
    name: "Laurel",
    // Not a milestone: the only way in is to be on a daily board when its day
    // closes, which depends on everyone else who played it.
    requirement: "Top ten on a daily board at day's end",
    unlock: (p) => p.achievements.includes("daily-elite"),
    vars: {
      "--die-c1": "#f7f2df",
      "--die-c2": "#cbbd7e",
      "--die-c3": "#8d7c3a",
      "--die-pip": "#243018",
      "--die-pip2": "#fbf7e8",
      "--die-lip": "rgba(70,60,20,0.3)",
    },
  },
  // The weekly rewards. A week is won against everyone who spent it trying,
  // so its prize is the loudest thing in the locker.
  {
    id: "regalia",
    name: "Regalia",
    requirement: "Finish first on a weekly board",
    unlock: (p) => p.achievements.includes("weekly-champion"),
    vars: {
      "--die-c1": "#fff6da",
      "--die-c2": "#f0c65a",
      "--die-c3": "#a8791a",
      "--die-pip": "#3d2a02",
      "--die-pip2": "#fffaeb",
      "--die-lip": "rgba(90,64,4,0.34)",
    },
  },
  {
    id: "keystone",
    name: "Keystone",
    // Eight weeks running: the longest ask in the game, and the only one that
    // cannot be hurried by playing more in a day.
    requirement: "Eight weeks of weeklies in a row",
    unlock: (p) => p.achievements.includes("weekly-streak-8"),
    vars: {
      "--die-c1": "#eceff3",
      "--die-c2": "#9fa8b4",
      "--die-c3": "#5b6472",
      "--die-pip": "#161a20",
      "--die-pip2": "#f7f9fb",
      "--die-lip": "rgba(25,30,38,0.34)",
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
  {
    id: "ocean",
    name: "Ocean Deep",
    requirement: "Hot dice three times in one turn",
    unlock: (p) => p.achievements.includes("chain-reaction"),
    vars: {
      "--felt-1": "#0f5a63",
      "--felt-2": "#083c46",
      "--felt-edge": "#04242c",
      "--rail-1": "#8a7340",
      "--rail-2": "#463a20",
    },
  },
  {
    id: "daybreak",
    name: "Daybreak",
    requirement: "Five days of dailies in a row",
    unlock: (p) => p.achievements.includes("daily-streak-5"),
    vars: {
      "--felt-1": "#7a4a6a",
      "--felt-2": "#3e2a52",
      "--felt-edge": "#1e1430",
      "--rail-1": "#c98a5a",
      "--rail-2": "#6a4028",
    },
  },
  {
    id: "frost",
    name: "Frost",
    requirement: "Win a 3000+ game in five turns",
    unlock: (p) => p.achievements.includes("blitz"),
    vars: {
      "--felt-1": "#cfe3ee",
      "--felt-2": "#9fbccf",
      "--felt-edge": "#6b8ba0",
      "--rail-1": "#7c8894",
      "--rail-2": "#3c454e",
    },
  },
  {
    id: "longhall",
    name: "Long Hall",
    // The weekly's own mat: earned by standing on a board that has closed,
    // which depends on everyone who spent that week trying to beat you.
    requirement: "Top ten on a weekly board at week's end",
    unlock: (p) => p.achievements.includes("weekly-elite"),
    vars: {
      "--felt-1": "#2f5c52",
      "--felt-2": "#173630",
      "--felt-edge": "#0c1f1b",
      "--rail-1": "#9c7b46",
      "--rail-2": "#4e3c20",
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
  const table = find(TABLE_THEMES, profile.table);
  // Equipped-but-locked (e.g. after a reset) falls back to the default.
  const tableVars = isUnlocked(table, profile) ? table.vars : TABLE_THEMES[0].vars;
  return { ...equippedDiceVars(profile), ...tableVars } as CSSProperties;
}

/**
 * The dice half on its own, for screens that are not a table.
 *
 * The daily and weekly challenges are played on their own panel rather than on
 * the felt, so they want the player's dice without their table theme — the
 * skins were only ever visible in a game, which made the locker's dice a reward
 * you could not see in the mode you were most likely grinding for it.
 */
export function equippedDiceVars(profile: Profile): CSSProperties {
  const dice = find(DICE_SKINS, profile.dice);
  return { ...(isUnlocked(dice, profile) ? dice.vars : DICE_SKINS[0].vars) } as CSSProperties;
}

/**
 * Dice-only CSS variables (no table theme) for a given skin id. Used online: the
 * server broadcasts each player's equipped skin, and every client renders the
 * CURRENT player's dice with it (so a skin shows on its owner's turn for everyone).
 * Unknown ids fall back to the default; the mat comes from `tableVars` instead.
 */
export function diceVarsById(id: string): CSSProperties {
  const dice = DICE_SKINS.find((c) => c.id === id) ?? DICE_SKINS[0];
  return { ...dice.vars } as CSSProperties;
}

/**
 * Table-only CSS variables (no dice skin) for a profile.
 *
 * The mirror of `diceVarsById`, and online they answer two different questions.
 * The dice on the mat belong to whoever is throwing them, so they change hands
 * every turn. The mat is furniture: it is yours, it stays yours for the whole
 * game, and nobody else sees it — swapping the room's colour every time the turn
 * moved would make it flicker through five people's taste, and a player who
 * unlocked a theme would spend most of the game looking at somebody else's.
 *
 * Kept separate from `cosmeticVars` rather than filtered out of it, because a
 * dice skin may also set the scoring-die colours (see "eclipse"): spreading a
 * whole profile and then overriding the dice half would leave this viewer's
 * `--score-*` painted onto another player's dice.
 */
export function tableVars(profile: Profile): CSSProperties {
  const table = find(TABLE_THEMES, profile.table);
  // Equipped-but-locked (e.g. after a reset) falls back to the default.
  const vars = isUnlocked(table, profile) ? table.vars : TABLE_THEMES[0].vars;
  return { ...vars } as CSSProperties;
}
