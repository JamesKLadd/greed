import type { CSSProperties } from "react";
import type { Profile } from "./profile.js";
import { adventDoorFor, adventUnlocked } from "./advent.js";

/**
 * Unlockable cosmetics: dice skins and table themes. Each carries a set of CSS
 * custom-property overrides (applied inline on the in-game root) and an optional
 * unlock condition against the local profile. Purely visual — no engine effect.
 */

/**
 * The body a set of dice is cast in. Every skin but the holiday ones is a cube;
 * those are drawn by Die.tsx (DieShell.tsx) as a standing token in the same
 * square a cube occupies.
 */
export type DieShape =
  | "cube"
  | "pumpkin"
  | "ornament"
  | "beach-ball"
  | "disco-ball"
  | "heart"
  | "pot-of-gold"
  | "acorn"
  | "gift-box";

export const DIE_SHAPES: readonly DieShape[] = [
  "cube",
  "pumpkin",
  "ornament",
  "beach-ball",
  "disco-ball",
  "heart",
  "pot-of-gold",
  "acorn",
  "gift-box",
];

/**
 * The custom property that carries a skin's shape alongside its colours.
 *
 * A skin reaches the dice as inline custom properties on whatever contains them
 * — the table, the online tray (which changes hands every turn), a challenge
 * panel, a locker card — and Die.tsx reads its shape back off the same cascade.
 * Riding along with the colours means the shape goes everywhere they go, and a
 * screen that applies a skin cannot forget half of it. Deliberately not
 * `--die-*`: those are the six colours a skin is held to (styles.contract.test).
 */
export const DIE_SHAPE_VAR = "--dice-shape";

export function isDieShape(value: unknown): value is DieShape {
  return DIE_SHAPES.some((shape) => shape === value);
}

export interface Cosmetic {
  id: string;
  name: string;
  vars: Record<string, string>;
  /** Dice only: the body the dice are cast in (omit for the usual cube). */
  shape?: DieShape;
  /** Human-readable unlock requirement (omit for always-available items). */
  requirement?: string;
  /** True when the profile has earned it (omit => free from the start). */
  unlock?: (p: Profile) => boolean;
}

/** "Open advent door 5": the requirement every advent item states. */
function adventRequirement(id: string): string {
  return `Open advent door ${adventDoorFor(id)}`;
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
  // The holiday dice (holidayDice.ts). Earned by playing on the day, and the
  // only skins that change the dice's SHAPE as well as their colour. Their
  // colours are the body's: they drive the art's own gradients, and they are
  // what a die falls back to if it is ever drawn as a plain cube (the small
  // dice in the turn history and the rules, which are read rather than watched).
  {
    id: "pumpkin",
    name: "Jack-o'-Lantern",
    shape: "pumpkin",
    requirement: "Play on Halloween",
    unlock: (p) => p.achievements.includes("trick-or-treat"),
    vars: {
      "--die-c1": "#ffc163",
      "--die-c2": "#f07d1a",
      "--die-c3": "#b4460a",
      "--die-pip": "#2c1003",
      "--die-pip2": "#7a3409",
      "--die-lip": "rgba(92,32,2,0.34)",
    },
  },
  {
    id: "ornament",
    name: "Tree Ornament",
    shape: "ornament",
    requirement: "Play on Christmas Day",
    unlock: (p) => p.achievements.includes("deck-the-halls"),
    vars: {
      "--die-c1": "#ff7b86",
      "--die-c2": "#d21f37",
      "--die-c3": "#76091b",
      "--die-pip": "#c8901f",
      "--die-pip2": "#fff2c6",
      "--die-lip": "rgba(70,0,12,0.36)",
    },
  },
  {
    id: "beach-ball",
    name: "Beach Ball",
    shape: "beach-ball",
    requirement: "Play during the summer season",
    unlock: (p) => p.achievements.includes("beach-day"),
    vars: {
      "--die-c1": "#ffffff",
      "--die-c2": "#f1f4f8",
      "--die-c3": "#cdd7e3",
      "--die-pip": "#10264b",
      "--die-pip2": "#3f619b",
      "--die-lip": "rgba(20,40,80,0.24)",
    },
  },
  {
    id: "disco-ball",
    name: "Mirror Ball",
    shape: "disco-ball",
    requirement: "Play on New Year's Eve or Day",
    unlock: (p) => p.achievements.includes("happy-new-year"),
    vars: {
      "--die-c1": "#ffffff",
      "--die-c2": "#c9d0dc",
      "--die-c3": "#6f7889",
      "--die-pip": "#151a2b",
      "--die-pip2": "#4a5470",
      "--die-lip": "rgba(20,25,45,0.28)",
    },
  },
  {
    id: "candy-heart",
    name: "Candy Heart",
    shape: "heart",
    requirement: "Play on Valentine's Day",
    unlock: (p) => p.achievements.includes("be-mine"),
    vars: {
      "--die-c1": "#ffb3c7",
      "--die-c2": "#ff5c8a",
      "--die-c3": "#c21e56",
      "--die-pip": "#fbe3ea",
      "--die-pip2": "#ffffff",
      "--die-lip": "rgba(110,0,35,0.3)",
    },
  },
  {
    id: "pot-of-gold",
    name: "Pot of Gold",
    shape: "pot-of-gold",
    requirement: "Play on St. Patrick's Day",
    unlock: (p) => p.achievements.includes("luck-of-the-irish"),
    vars: {
      "--die-c1": "#5d646d",
      "--die-c2": "#33383f",
      "--die-c3": "#15181c",
      "--die-pip": "#c9961c",
      "--die-pip2": "#fff1a8",
      "--die-lip": "rgba(0,0,0,0.35)",
    },
  },
  {
    id: "acorn",
    name: "Acorn",
    shape: "acorn",
    requirement: "Play on Thanksgiving",
    unlock: (p) => p.achievements.includes("gobble-gobble"),
    vars: {
      "--die-c1": "#e3a865",
      "--die-c2": "#b06d30",
      "--die-c3": "#6e3f17",
      "--die-pip": "#2c1606",
      "--die-pip2": "#6b3b14",
      "--die-lip": "rgba(60,30,5,0.32)",
    },
  },
  // The trophy dice: each holiday set again, in gold, for whoever won that
  // holiday's Daily or Weekly. Their one condition is the trophy badge, which
  // only the server hands out (see holidayDice.ts).
  {
    id: "gold-disco-ball",
    name: "Golden Mirror Ball",
    shape: "disco-ball",
    requirement: "Win the New Year's Daily or Weekly",
    unlock: (p) => p.achievements.includes("newyear-champion"),
    vars: {
      "--die-c1": "#fff2b3",
      "--die-c2": "#e9b93f",
      "--die-c3": "#8c5e0b",
      "--die-pip": "#3b2604",
      "--die-pip2": "#86601a",
      "--die-lip": "rgba(90,60,5,0.34)",
    },
  },
  {
    id: "gold-heart",
    name: "Golden Heart",
    shape: "heart",
    requirement: "Win the Valentine's Daily or Weekly",
    unlock: (p) => p.achievements.includes("valentines-champion"),
    vars: {
      "--die-c1": "#fff2b3",
      "--die-c2": "#e9b93f",
      "--die-c3": "#8c5e0b",
      "--die-pip": "#3b2604",
      "--die-pip2": "#86601a",
      "--die-lip": "rgba(90,60,5,0.34)",
    },
  },
  {
    id: "gold-pot",
    name: "Solid Gold Pot",
    shape: "pot-of-gold",
    requirement: "Win the St. Patrick's Daily or Weekly",
    unlock: (p) => p.achievements.includes("stpatricks-champion"),
    vars: {
      "--die-c1": "#fff2b3",
      "--die-c2": "#e9b93f",
      "--die-c3": "#8c5e0b",
      "--die-pip": "#3b2604",
      "--die-pip2": "#86601a",
      "--die-lip": "rgba(90,60,5,0.34)",
    },
  },
  {
    id: "gold-beach-ball",
    name: "Golden Beach Ball",
    shape: "beach-ball",
    requirement: "Win the Fourth of July Daily or Weekly",
    unlock: (p) => p.achievements.includes("summer-champion"),
    vars: {
      "--die-c1": "#fff2b3",
      "--die-c2": "#e9b93f",
      "--die-c3": "#8c5e0b",
      "--die-pip": "#3b2604",
      "--die-pip2": "#86601a",
      "--die-lip": "rgba(90,60,5,0.34)",
    },
  },
  {
    id: "gold-pumpkin",
    name: "Golden Pumpkin",
    shape: "pumpkin",
    requirement: "Win the Halloween Daily or Weekly",
    unlock: (p) => p.achievements.includes("halloween-champion"),
    vars: {
      "--die-c1": "#fff2b3",
      "--die-c2": "#e9b93f",
      "--die-c3": "#8c5e0b",
      "--die-pip": "#3b2604",
      "--die-pip2": "#86601a",
      "--die-lip": "rgba(90,60,5,0.34)",
    },
  },
  {
    id: "gold-acorn",
    name: "Golden Acorn",
    shape: "acorn",
    requirement: "Win the Thanksgiving Daily or Weekly",
    unlock: (p) => p.achievements.includes("thanksgiving-champion"),
    vars: {
      "--die-c1": "#fff2b3",
      "--die-c2": "#e9b93f",
      "--die-c3": "#8c5e0b",
      "--die-pip": "#3b2604",
      "--die-pip2": "#86601a",
      "--die-lip": "rgba(90,60,5,0.34)",
    },
  },
  {
    id: "gold-ornament",
    name: "Golden Ornament",
    shape: "ornament",
    requirement: "Win the Christmas Daily or Weekly",
    unlock: (p) => p.achievements.includes("christmas-champion"),
    vars: {
      "--die-c1": "#fff2b3",
      "--die-c2": "#e9b93f",
      "--die-c3": "#8c5e0b",
      "--die-pip": "#3b2604",
      "--die-pip2": "#86601a",
      "--die-lip": "rgba(90,60,5,0.34)",
    },
  },
  // Behind the advent calendar's doors (advent.ts), one a day in December.
  {
    id: "candy-cane",
    name: "Candy Cane",
    requirement: adventRequirement("candy-cane"),
    unlock: (p) => adventUnlocked("candy-cane", p),
    vars: {
      "--die-c1": "#ffffff",
      "--die-c2": "#f3e9ea",
      "--die-c3": "#d9c3c6",
      "--die-pip": "#c8102e",
      "--die-pip2": "#ff6b7f",
      "--die-lip": "rgba(150,20,40,0.25)",
    },
  },
  {
    id: "gingerbread",
    name: "Gingerbread",
    requirement: adventRequirement("gingerbread"),
    unlock: (p) => adventUnlocked("gingerbread", p),
    vars: {
      "--die-c1": "#e0a46a",
      "--die-c2": "#b8743c",
      "--die-c3": "#8a4f22",
      "--die-pip": "#fff7ec",
      "--die-pip2": "#ffffff",
      "--die-lip": "rgba(90,45,10,0.3)",
    },
  },
  {
    id: "mistletoe",
    name: "Mistletoe",
    requirement: adventRequirement("mistletoe"),
    unlock: (p) => adventUnlocked("mistletoe", p),
    vars: {
      "--die-c1": "#8fd19e",
      "--die-c2": "#4f9f62",
      "--die-c3": "#2d6b3d",
      "--die-pip": "#f7f7f2",
      "--die-pip2": "#ffffff",
      "--die-lip": "rgba(20,60,30,0.3)",
    },
  },
  {
    id: "silver-bells",
    name: "Silver Bells",
    requirement: adventRequirement("silver-bells"),
    unlock: (p) => adventUnlocked("silver-bells", p),
    vars: {
      "--die-c1": "#f4f6f9",
      "--die-c2": "#c3cad4",
      "--die-c3": "#8c95a3",
      "--die-pip": "#1e2533",
      "--die-pip2": "#5c6680",
      "--die-lip": "rgba(40,50,70,0.25)",
    },
  },
  {
    id: "frosted-glass",
    name: "Frosted Glass",
    requirement: adventRequirement("frosted-glass"),
    unlock: (p) => adventUnlocked("frosted-glass", p),
    vars: {
      "--die-c1": "#e9f6ff",
      "--die-c2": "#b8dcf2",
      "--die-c3": "#7fb2d6",
      "--die-pip": "#0f3a5a",
      "--die-pip2": "#4f86b0",
      "--die-lip": "rgba(20,70,110,0.22)",
    },
  },
  {
    id: "cranberry",
    name: "Cranberry",
    requirement: adventRequirement("cranberry"),
    unlock: (p) => adventUnlocked("cranberry", p),
    vars: {
      "--die-c1": "#e05a6e",
      "--die-c2": "#a3203a",
      "--die-c3": "#6a0f22",
      "--die-pip": "#fff1f3",
      "--die-pip2": "#ffffff",
      "--die-lip": "rgba(60,0,15,0.35)",
    },
  },
  {
    id: "evergreen",
    name: "Evergreen",
    requirement: adventRequirement("evergreen"),
    unlock: (p) => adventUnlocked("evergreen", p),
    vars: {
      "--die-c1": "#3f8a5a",
      "--die-c2": "#22603a",
      "--die-c3": "#123d24",
      "--die-pip": "#f2d16b",
      "--die-pip2": "#fff3c2",
      "--die-lip": "rgba(5,35,15,0.35)",
    },
  },
  {
    id: "snowdrift",
    name: "Snowdrift",
    requirement: adventRequirement("snowdrift"),
    unlock: (p) => adventUnlocked("snowdrift", p),
    vars: {
      "--die-c1": "#ffffff",
      "--die-c2": "#eef4fa",
      "--die-c3": "#c7d6e6",
      "--die-pip": "#6f8fb3",
      "--die-pip2": "#a9c3e0",
      "--die-lip": "rgba(70,100,140,0.22)",
    },
  },
  {
    id: "gift-box",
    name: "Wrapped Gift",
    shape: "gift-box",
    requirement: adventRequirement("gift-box"),
    unlock: (p) => adventUnlocked("gift-box", p),
    vars: {
      "--die-c1": "#f0505a",
      "--die-c2": "#c92131",
      "--die-c3": "#861320",
      "--die-pip": "#fff7f0",
      "--die-pip2": "#ffffff",
      "--die-lip": "rgba(90,10,20,0.32)",
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
  // The holiday felts (holidayDice.ts), part of each holiday's set.
  {
    id: "confetti-felt",
    name: "Midnight Confetti",
    requirement: "Play on New Year's Eve or Day",
    unlock: (p) => p.achievements.includes("happy-new-year"),
    vars: {
      "--felt-1": "#232a52",
      "--felt-2": "#131733",
      "--felt-edge": "#090b1a",
      "--rail-1": "#c9a54b",
      "--rail-2": "#6b5320",
    },
  },
  {
    id: "sweetheart-felt",
    name: "Sweetheart Velvet",
    requirement: "Play on Valentine's Day",
    unlock: (p) => p.achievements.includes("be-mine"),
    vars: {
      "--felt-1": "#8a2346",
      "--felt-2": "#5a1530",
      "--felt-edge": "#330a1b",
      "--rail-1": "#d9a0a8",
      "--rail-2": "#7a4450",
    },
  },
  {
    id: "clover-felt",
    name: "Clover Field",
    requirement: "Play on St. Patrick's Day",
    unlock: (p) => p.achievements.includes("luck-of-the-irish"),
    vars: {
      "--felt-1": "#1f7a3c",
      "--felt-2": "#125528",
      "--felt-edge": "#093316",
      "--rail-1": "#c9a54b",
      "--rail-2": "#5f4a1c",
    },
  },
  {
    id: "beach-towel-felt",
    name: "Beach Towel",
    requirement: "Play during the summer season",
    unlock: (p) => p.achievements.includes("beach-day"),
    vars: {
      "--felt-1": "#1b8ba0",
      "--felt-2": "#0f6273",
      "--felt-edge": "#073c47",
      "--rail-1": "#f2d3a0",
      "--rail-2": "#a07a4c",
    },
  },
  {
    id: "haunted-felt",
    name: "Haunted Parlor",
    requirement: "Play on Halloween",
    unlock: (p) => p.achievements.includes("trick-or-treat"),
    vars: {
      "--felt-1": "#3c2450",
      "--felt-2": "#24163a",
      "--felt-edge": "#120b20",
      "--rail-1": "#a8784a",
      "--rail-2": "#4a2f20",
    },
  },
  {
    id: "harvest-felt",
    name: "Harvest Plaid",
    requirement: "Play on Thanksgiving",
    unlock: (p) => p.achievements.includes("gobble-gobble"),
    vars: {
      "--felt-1": "#8a4a1e",
      "--felt-2": "#5e3013",
      "--felt-edge": "#361a08",
      "--rail-1": "#c9935a",
      "--rail-2": "#5c3a1c",
    },
  },
  {
    id: "tartan-felt",
    name: "Christmas Tartan",
    requirement: "Play on Christmas Day",
    unlock: (p) => p.achievements.includes("deck-the-halls"),
    vars: {
      "--felt-1": "#1d5c3c",
      "--felt-2": "#123d28",
      "--felt-edge": "#082416",
      "--rail-1": "#b8323c",
      "--rail-2": "#5e1a20",
    },
  },
  // Behind the advent calendar's doors (advent.ts).
  {
    id: "peppermint-felt",
    name: "Peppermint",
    requirement: adventRequirement("peppermint-felt"),
    unlock: (p) => adventUnlocked("peppermint-felt", p),
    vars: {
      "--felt-1": "#b3283a",
      "--felt-2": "#7d1726",
      "--felt-edge": "#4a0c16",
      "--rail-1": "#f4f0ea",
      "--rail-2": "#b9b0a6",
    },
  },
  {
    id: "snowfall-felt",
    name: "Snowfall",
    requirement: adventRequirement("snowfall-felt"),
    unlock: (p) => adventUnlocked("snowfall-felt", p),
    vars: {
      "--felt-1": "#2b4a6b",
      "--felt-2": "#1a3049",
      "--felt-edge": "#0d1a2a",
      "--rail-1": "#dfe8f2",
      "--rail-2": "#8a9bb0",
    },
  },
  {
    id: "fireside-felt",
    name: "Fireside",
    requirement: adventRequirement("fireside-felt"),
    unlock: (p) => adventUnlocked("fireside-felt", p),
    vars: {
      "--felt-1": "#7a3a1e",
      "--felt-2": "#4e2412",
      "--felt-edge": "#2c1308",
      "--rail-1": "#c98a4a",
      "--rail-2": "#5c3416",
    },
  },
  {
    id: "gift-wrap-felt",
    name: "Gift Wrap",
    requirement: adventRequirement("gift-wrap-felt"),
    unlock: (p) => adventUnlocked("gift-wrap-felt", p),
    vars: {
      "--felt-1": "#1f6a52",
      "--felt-2": "#144a39",
      "--felt-edge": "#0a2c22",
      "--rail-1": "#d8b25a",
      "--rail-2": "#6e5520",
    },
  },
  {
    id: "aurora-felt",
    name: "Northern Lights",
    requirement: adventRequirement("aurora-felt"),
    unlock: (p) => adventUnlocked("aurora-felt", p),
    vars: {
      "--felt-1": "#14455a",
      "--felt-2": "#0d2c40",
      "--felt-edge": "#06162a",
      "--rail-1": "#7fd6c2",
      "--rail-2": "#2f6a72",
    },
  },
];

export function isUnlocked(item: Cosmetic, profile: Profile): boolean {
  return !item.unlock || item.unlock(profile);
}

/**
 * A dice skin as inline custom properties: its colours plus its shape.
 *
 * Every skin states its shape, cubes included. Skins nest — another player's
 * dice on a profile card inside your own table, the online tray inside a
 * viewer's room — and a cube that said nothing would inherit the pumpkin
 * around it.
 */
export function diceSkinVars(skin: Cosmetic): CSSProperties {
  return { ...skin.vars, [DIE_SHAPE_VAR]: skin.shape ?? "cube" } as CSSProperties;
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
  return diceSkinVars(isUnlocked(dice, profile) ? dice : DICE_SKINS[0]);
}

/**
 * Dice-only CSS variables (no table theme) for a given skin id. Used online: the
 * server broadcasts each player's equipped skin, and every client renders the
 * CURRENT player's dice with it (so a skin shows on its owner's turn for everyone).
 * Unknown ids fall back to the default; the mat comes from `tableVars` instead.
 */
export function diceVarsById(id: string): CSSProperties {
  return diceSkinVars(DICE_SKINS.find((c) => c.id === id) ?? DICE_SKINS[0]);
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
