import type { BotPersonality, GameState } from "@greed/core";
import { isWinner } from "@greed/core";

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
  /** Deepest hole you climbed out of: the biggest gap to the leader, ever, this game. */
  maxDeficit: number;
  /** Most hot-dice clears inside a single one of your turns. */
  bestHotStreak: number;
  /** The nerviest temperament at the table, for the Giant Slayer badge. */
  boldestOpponent?: BotPersonality;
}

/**
 * How hard a badge is to get. Purely a weighting for the profile score and a
 * colour in the grid — the unlock conditions themselves are unchanged.
 */
export type AchievementTier = "bronze" | "silver" | "gold";

/** What each tier is worth toward the profile score. */
export const TIER_POINTS: Record<AchievementTier, number> = {
  bronze: 10,
  silver: 25,
  gold: 50,
};

export interface Achievement {
  id: string;
  icon: string;
  title: string;
  desc: string;
  tier: AchievementTier;
  /**
   * True when this game (with the already-updated profile) earns it. Badges
   * that cannot be won by playing a game (the daily-leaderboard one) have no
   * predicate and are granted through `awardAchievement` instead.
   */
  earned?: (s: GameSummary, p: Profile) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first-win",
    icon: "🥇",
    title: "First Blood",
    desc: "Win your first game.",
    tier: "bronze",
    earned: (s) => s.won,
  },
  {
    id: "hot-hand",
    icon: "🔥",
    title: "Hot Hand",
    desc: "Score hot dice (all five) in a turn.",
    tier: "bronze",
    earned: (s) => s.hotDice >= 1,
  },
  {
    id: "big-turn",
    icon: "💰",
    title: "Big Spender",
    desc: "Bank 1000+ in a single turn.",
    tier: "bronze",
    earned: (s) => s.bestTurn >= 1000,
  },
  {
    id: "flawless",
    icon: "✨",
    title: "Flawless",
    desc: "Win a game without busting once.",
    tier: "bronze",
    earned: (s) => s.won && s.busts === 0,
  },
  {
    id: "high-roller",
    icon: "🎩",
    title: "High Roller",
    desc: "Finish a game with 3000+ points.",
    tier: "silver",
    earned: (s) => s.finalTotal >= 3000,
  },
  {
    id: "hat-trick",
    icon: "🎯",
    title: "Hat Trick",
    desc: "Win three games in a row.",
    tier: "silver",
    earned: (_s, p) => p.currentStreak >= 3,
  },
  {
    id: "giant-slayer",
    icon: "🐉",
    title: "Giant Slayer",
    desc: "Beat a reckless bot.",
    tier: "silver",
    earned: (s) => s.won && s.boldestOpponent === "reckless",
  },
  {
    id: "veteran",
    icon: "🎖️",
    title: "Veteran",
    desc: "Play 10 games.",
    tier: "bronze",
    earned: (_s, p) => p.gamesPlayed >= 10,
  },
  {
    id: "inferno",
    icon: "🌋",
    title: "Inferno",
    desc: "Score hot dice twice in one game.",
    tier: "silver",
    earned: (s) => s.hotDice >= 2,
  },
  {
    id: "moonshot",
    icon: "🚀",
    title: "Moonshot",
    desc: "Bank 1500+ in a single turn.",
    tier: "silver",
    earned: (s) => s.bestTurn >= 1500,
  },
  {
    id: "landslide",
    icon: "🏔️",
    title: "Landslide",
    desc: "Finish a game with 5000+ points.",
    tier: "gold",
    earned: (s) => s.finalTotal >= 5000,
  },
  {
    id: "on-fire",
    icon: "⚡",
    title: "On Fire",
    desc: "Win five games in a row.",
    tier: "gold",
    earned: (_s, p) => p.currentStreak >= 5,
  },
  {
    id: "dedicated",
    icon: "🎮",
    title: "Dedicated",
    desc: "Play 25 games.",
    tier: "silver",
    earned: (_s, p) => p.gamesPlayed >= 25,
  },
  {
    id: "champion",
    icon: "👑",
    title: "Champion",
    desc: "Win 25 games.",
    tier: "gold",
    earned: (_s, p) => p.wins >= 25,
  },
  {
    id: "full-table",
    icon: "👥",
    title: "Full Table",
    desc: "Win a game with four or more opponents.",
    tier: "silver",
    earned: (s) => s.won && s.opponents >= 4,
  },
  {
    id: "marathon",
    icon: "🏃",
    title: "Marathon",
    desc: "Play a game lasting 20 or more turns.",
    tier: "silver",
    earned: (s) => s.turns >= 20,
  },
  {
    id: "untouchable",
    icon: "🛡️",
    title: "Untouchable",
    desc: "Beat a reckless bot without busting once.",
    tier: "gold",
    earned: (s) => s.won && s.busts === 0 && s.boldestOpponent === "reckless",
  },
  {
    id: "big-banker",
    icon: "🏦",
    title: "Big Banker",
    desc: "Bank 25,000 points across all your games.",
    tier: "gold",
    earned: (_s, p) => p.totalBankedPoints >= 25000,
  },

  // The hard tier. These ask for a run of luck you have to survive, or a habit
  // you have to keep up for a whole evening — none of them fall out of a
  // single ordinary game.
  {
    id: "comeback",
    icon: "🔄",
    title: "Comeback Kid",
    desc: "Win after trailing the leader by 1500 or more.",
    tier: "gold",
    earned: (s) => s.won && s.maxDeficit >= 1500,
  },
  {
    id: "chain-reaction",
    icon: "⛓️",
    title: "Chain Reaction",
    desc: "Score hot dice three times in a single turn.",
    tier: "gold",
    earned: (s) => s.bestHotStreak >= 3,
  },
  {
    id: "tidal-wave",
    icon: "🌊",
    title: "Tidal Wave",
    desc: "Bank 2500+ in a single turn.",
    tier: "gold",
    earned: (s) => s.bestTurn >= 2500,
  },
  {
    id: "unstoppable",
    icon: "💫",
    title: "Unstoppable",
    desc: "Win ten games in a row.",
    tier: "gold",
    earned: (_s, p) => p.currentStreak >= 10,
  },
  {
    id: "blitz",
    icon: "⏱️",
    title: "Blitz",
    // The 3000 floor is what makes this hard: without it, a 500-goal game wins
    // it on the first turn.
    desc: "Win a game of 3000+ in five turns or fewer.",
    tier: "gold",
    earned: (s) => s.won && s.finalTotal >= 3000 && s.turns <= 5,
  },

  // The one badge that cannot be ground out. There is a single daily run per
  // day and the board is everyone who played it, so this is the only thing in
  // the game you cannot get simply by playing enough.
  {
    id: "daily-elite",
    icon: "🏅",
    title: "Podium Finish",
    desc: "Finish in the top ten of a daily challenge.",
    tier: "gold",
    // No predicate: granted from the daily result, not from a game.
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

/**
 * Grant a badge that no single game can earn — currently only the daily
 * leaderboard one. Returns the achievement when it was newly unlocked, so the
 * caller can celebrate it, or null when it was already held.
 */
export function awardAchievement(id: string): Achievement | null {
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a) return null;
  const p = loadProfile();
  if (p.achievements.includes(id)) return null;
  p.achievements.push(id);
  saveProfile(p);
  return a;
}

/** Weighted total of every badge earned — one number for "how far along am I". */
export function achievementScore(p: Profile): number {
  return ACHIEVEMENTS.filter((a) => p.achievements.includes(a.id)).reduce(
    (sum, a) => sum + TIER_POINTS[a.tier],
    0,
  );
}

/** The score a profile would have with everything unlocked. */
export function maxAchievementScore(): number {
  return ACHIEVEMENTS.reduce((sum, a) => sum + TIER_POINTS[a.tier], 0);
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
  let maxDeficit = 0;
  let hotStreak = 0;
  let bestHotStreak = 0;
  // Banking is the only thing that moves a score, so the running standings can
  // be rebuilt from the bank events alone.
  const totals = new Map<string, number>();

  /**
   * Which score each seat's bank moves — their own, or their side's.
   *
   * The deficit has to be measured on the score the game is DECIDED by, the
   * same one `isWinner` above settles the win on. Measured seat by seat, a team
   * game hands out Comeback Kid for a hole you were never in: the lowest
   * scorer on a winning side personally trails the table's top scorer all game,
   * so a side that led from the front still looked like a 1500-point recovery.
   * A free-for-all is the same code with every seat its own side.
   */
  const sideOf = new Map<string, string>();
  for (const p of state.players) {
    sideOf.set(p.id, p.team == null ? p.id : `team:${p.team}`);
  }
  const yourSide = sideOf.get(youId) ?? youId;

  for (const e of state.log) {
    if (e.type === "bank") {
      totals.set(e.playerId, e.total);
      if (e.playerId === youId) {
        banks += 1;
        bankedPoints += e.gained;
        if (e.gained > bestTurn) bestTurn = e.gained;
        hotStreak = 0;
      }
      // Re-check after ANY bank: the gap can widen because someone passed you.
      const bySide = new Map<string, number>();
      for (const [id, total] of totals) {
        const side = sideOf.get(id) ?? id;
        bySide.set(side, (bySide.get(side) ?? 0) + total);
      }
      let leader = 0;
      for (const [side, total] of bySide) {
        if (side !== yourSide && total > leader) leader = total;
      }
      maxDeficit = Math.max(maxDeficit, leader - (bySide.get(yourSide) ?? 0));
    } else if ("playerId" in e && e.playerId === youId) {
      if (e.type === "bust") {
        busts += 1;
        hotStreak = 0;
      } else if (e.type === "skip") {
        hotStreak = 0;
      } else if (e.type === "hot-dice") {
        hotDice += 1;
        hotStreak += 1;
        bestHotStreak = Math.max(bestHotStreak, hotStreak);
      }
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
    // Team games are won by a side, so a partner's win is your win.
    won: isWinner(state, youId),
    finalTotal: you?.total ?? 0,
    bestTurn,
    banks,
    busts,
    hotDice,
    turns: banks + busts,
    bankedPoints,
    opponents: bots.length,
    maxDeficit,
    bestHotStreak,
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
    if (a.earned?.(summary, p)) {
      p.achievements.push(a.id);
      unlocked.push(a);
    }
  }

  saveProfile(p);
  return { profile: p, unlocked };
}
