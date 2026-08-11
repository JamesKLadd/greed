import type { BotPersonality, GameState } from "@greed/core";

/**
 * Local, single-player progression: lifetime stats and achievements persisted to
 * localStorage. Recorded only for solo games (one human vs. bots) so wins and
 * streaks attribute cleanly. No network, no engine changes.
 */

const STORAGE_KEY = "greed:profile";

export interface Profile {
  gamesPlayed: number;
  wins: number;
  currentStreak: number;
  bestStreak: number;
  /** Biggest single banked turn, ever. */
  bestTurn: number;
  /** Highest final total, ever. */
  bestTotal: number;
  /** For the average-bank stat. */
  totalBanks: number;
  totalBankedPoints: number;
  hotDiceTotal: number;
  /** Unlocked achievement ids. */
  achievements: string[];
  /** Equipped cosmetic ids. */
  dice: string;
  table: string;
  /** Equipped avatar id, or "" to let it be derived from the player's name. */
  avatar: string;
}

/** One completed solo game, from the human's perspective. */
export interface GameSummary {
  won: boolean;
  finalTotal: number;
  bestTurn: number;
  banks: number;
  busts: number;
  hotDice: number;
  turns: number;
  bankedPoints: number;
  opponents: number;
  /** The nerviest temperament at the table, for the Giant Slayer badge. */
  boldestOpponent?: BotPersonality;
}

export interface Achievement {
  id: string;
  icon: string;
  title: string;
  desc: string;
  /** True when this game (with the already-updated profile) earns it. */
  earned: (s: GameSummary, p: Profile) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first-win",
    icon: "🥇",
    title: "First Blood",
    desc: "Win your first game.",
    earned: (s) => s.won,
  },
  {
    id: "hot-hand",
    icon: "🔥",
    title: "Hot Hand",
    desc: "Score hot dice (all five) in a turn.",
    earned: (s) => s.hotDice >= 1,
  },
  {
    id: "big-turn",
    icon: "💰",
    title: "Big Spender",
    desc: "Bank 1000+ in a single turn.",
    earned: (s) => s.bestTurn >= 1000,
  },
  {
    id: "flawless",
    icon: "✨",
    title: "Flawless",
    desc: "Win a game without busting once.",
    earned: (s) => s.won && s.busts === 0,
  },
  {
    id: "high-roller",
    icon: "🎩",
    title: "High Roller",
    desc: "Finish a game with 3000+ points.",
    earned: (s) => s.finalTotal >= 3000,
  },
  {
    id: "hat-trick",
    icon: "🎯",
    title: "Hat Trick",
    desc: "Win three games in a row.",
    earned: (_s, p) => p.currentStreak >= 3,
  },
  {
    id: "giant-slayer",
    icon: "🐉",
    title: "Giant Slayer",
    desc: "Beat a reckless bot.",
    earned: (s) => s.won && s.boldestOpponent === "reckless",
  },
  {
    id: "veteran",
    icon: "🎖️",
    title: "Veteran",
    desc: "Play 10 games.",
    earned: (_s, p) => p.gamesPlayed >= 10,
  },
  {
    id: "inferno",
    icon: "🌋",
    title: "Inferno",
    desc: "Score hot dice twice in one game.",
    earned: (s) => s.hotDice >= 2,
  },
  {
    id: "moonshot",
    icon: "🚀",
    title: "Moonshot",
    desc: "Bank 1500+ in a single turn.",
    earned: (s) => s.bestTurn >= 1500,
  },
  {
    id: "landslide",
    icon: "🏔️",
    title: "Landslide",
    desc: "Finish a game with 5000+ points.",
    earned: (s) => s.finalTotal >= 5000,
  },
  {
    id: "on-fire",
    icon: "⚡",
    title: "On Fire",
    desc: "Win five games in a row.",
    earned: (_s, p) => p.currentStreak >= 5,
  },
  {
    id: "dedicated",
    icon: "🎮",
    title: "Dedicated",
    desc: "Play 25 games.",
    earned: (_s, p) => p.gamesPlayed >= 25,
  },
  {
    id: "champion",
    icon: "👑",
    title: "Champion",
    desc: "Win 25 games.",
    earned: (_s, p) => p.wins >= 25,
  },
  {
    id: "full-table",
    icon: "👥",
    title: "Full Table",
    desc: "Win a game with four or more opponents.",
    earned: (s) => s.won && s.opponents >= 4,
  },
  {
    id: "marathon",
    icon: "🏃",
    title: "Marathon",
    desc: "Play a game lasting 20 or more turns.",
    earned: (s) => s.turns >= 20,
  },
  {
    id: "untouchable",
    icon: "🛡️",
    title: "Untouchable",
    desc: "Beat a reckless bot without busting once.",
    earned: (s) => s.won && s.busts === 0 && s.boldestOpponent === "reckless",
  },
  {
    id: "big-banker",
    icon: "🏦",
    title: "Big Banker",
    desc: "Bank 25,000 points across all your games.",
    earned: (_s, p) => p.totalBankedPoints >= 25000,
  },
];

function emptyProfile(): Profile {
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
  };
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyProfile();
    return { ...emptyProfile(), ...(JSON.parse(raw) as Partial<Profile>) };
  } catch {
    return emptyProfile();
  }
}

function saveProfile(p: Profile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore storage failures */
  }
}

export function resetProfile(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Overwrite the whole saved profile (used when adopting a synced account profile). */
export function replaceProfile(p: Profile): void {
  saveProfile({ ...emptyProfile(), ...p });
}

/**
 * Merge two profiles without losing progress — the same monotonic rule the server
 * uses: cumulative counters and bests take the maximum, achievements union, and
 * the live streak + equipped cosmetics take the second (more recent) profile.
 * Used to reconcile local progress with an account on sign-in.
 */
export function mergeProfiles(a: Profile, b: Profile): Profile {
  const max = (x: number, y: number) => Math.max(x || 0, y || 0);
  return {
    gamesPlayed: max(a.gamesPlayed, b.gamesPlayed),
    wins: max(a.wins, b.wins),
    currentStreak: b.currentStreak ?? a.currentStreak,
    bestStreak: max(a.bestStreak, b.bestStreak),
    bestTurn: max(a.bestTurn, b.bestTurn),
    bestTotal: max(a.bestTotal, b.bestTotal),
    totalBanks: max(a.totalBanks, b.totalBanks),
    totalBankedPoints: max(a.totalBankedPoints, b.totalBankedPoints),
    hotDiceTotal: max(a.hotDiceTotal, b.hotDiceTotal),
    achievements: [...new Set([...a.achievements, ...b.achievements])],
    dice: b.dice || a.dice,
    table: b.table || a.table,
    avatar: b.avatar || a.avatar,
  };
}

/** Equip a cosmetic (dice skin, table theme or avatar); returns the updated profile. */
export function equipCosmetic(kind: "dice" | "table" | "avatar", id: string): Profile {
  const p = loadProfile();
  p[kind] = id;
  saveProfile(p);
  return p;
}

/** Average points per banked turn (0 when no turns banked yet). */
export function averageBank(p: Profile): number {
  return p.totalBanks > 0 ? Math.round(p.totalBankedPoints / p.totalBanks) : 0;
}

/** Nerve order, so "the boldest bot at the table" is well defined. */
const NERVE_ORDER: BotPersonality[] = ["cautious", "balanced", "reckless"];

/** Build this game's summary for the given human player from the event log. */
export function summarize(state: GameState, youId: string): GameSummary {
  let bestTurn = 0;
  let banks = 0;
  let busts = 0;
  let hotDice = 0;
  let bankedPoints = 0;

  for (const e of state.log) {
    if (e.type === "bank" && e.playerId === youId) {
      banks += 1;
      bankedPoints += e.gained;
      if (e.gained > bestTurn) bestTurn = e.gained;
    } else if (e.type === "bust" && e.playerId === youId) {
      busts += 1;
    } else if (e.type === "hot-dice" && e.playerId === youId) {
      hotDice += 1;
    }
  }

  const you = state.players.find((p) => p.id === youId);
  const bots = state.players.filter((p) => p.isBot);
  let boldest: BotPersonality | undefined;
  for (const b of bots) {
    if (!b.botPersonality) continue;
    if (!boldest || NERVE_ORDER.indexOf(b.botPersonality) > NERVE_ORDER.indexOf(boldest)) {
      boldest = b.botPersonality;
    }
  }

  return {
    won: state.winnerId === youId,
    finalTotal: you?.total ?? 0,
    bestTurn,
    banks,
    busts,
    hotDice,
    turns: banks + busts,
    bankedPoints,
    opponents: bots.length,
    boldestOpponent: boldest,
  };
}

/** Fold a finished game into the saved profile; returns any newly-earned badges. */
export function recordGame(summary: GameSummary): { profile: Profile; unlocked: Achievement[] } {
  const p = loadProfile();
  p.gamesPlayed += 1;
  if (summary.won) {
    p.wins += 1;
    p.currentStreak += 1;
    p.bestStreak = Math.max(p.bestStreak, p.currentStreak);
  } else {
    p.currentStreak = 0;
  }
  p.bestTurn = Math.max(p.bestTurn, summary.bestTurn);
  p.bestTotal = Math.max(p.bestTotal, summary.finalTotal);
  p.totalBanks += summary.banks;
  p.totalBankedPoints += summary.bankedPoints;
  p.hotDiceTotal += summary.hotDice;

  const unlocked: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    if (p.achievements.includes(a.id)) continue;
    if (a.earned(summary, p)) {
      p.achievements.push(a.id);
      unlocked.push(a);
    }
  }

  saveProfile(p);
  return { profile: p, unlocked };
}
