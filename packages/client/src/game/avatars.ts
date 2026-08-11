import type { Profile } from "./profile.js";

/**
 * Emoji avatars: the face on a player's seat.
 *
 * A friendly animal on a coloured disc is recognisable without reading, which
 * is the point — at a glance you know whose seat is whose, whose turn it is and
 * who's winning, without parsing four names. Two-letter initials did none of
 * that (and "Ana" and "Andy" both came out as "AN").
 *
 * Deliberately a separate module from cosmetics.ts rather than a third entry in
 * it: a `Cosmetic` is defined by the CSS custom properties it sets, and an
 * avatar sets none. It would have to carry an empty `vars` object purely to
 * satisfy a type — and the contract test that guards those vars would start
 * checking a list that has nothing to do with them.
 */

export interface Avatar {
  id: string;
  emoji: string;
  /** Human-readable unlock requirement (omit for always-available faces). */
  requirement?: string;
  /** True when the profile has earned it (omit => free from the start). */
  unlock?: (p: Profile) => boolean;
}

export const AVATARS: Avatar[] = [
  // Free from the start. These are also the pool auto-assignment draws from, so
  // an unearned face can never leak out through the name hash.
  { id: "fox", emoji: "🦊" },
  { id: "bear", emoji: "🐻" },
  { id: "owl", emoji: "🦉" },
  { id: "cat", emoji: "🐱" },
  { id: "frog", emoji: "🐸" },
  { id: "panda", emoji: "🐼" },
  { id: "rabbit", emoji: "🐰" },
  { id: "penguin", emoji: "🐧" },

  // Earned.
  {
    id: "lion",
    emoji: "🦁",
    requirement: "Win your first game",
    unlock: (p) => p.achievements.includes("first-win"),
  },
  {
    id: "octopus",
    emoji: "🐙",
    requirement: "Score hot dice",
    unlock: (p) => p.achievements.includes("hot-hand"),
  },
  {
    id: "dragon",
    emoji: "🐲",
    requirement: "Beat a reckless bot",
    unlock: (p) => p.achievements.includes("giant-slayer"),
  },
  {
    id: "unicorn",
    emoji: "🦄",
    requirement: "Win a game without busting",
    unlock: (p) => p.achievements.includes("flawless"),
  },
  {
    id: "wolf",
    emoji: "🐺",
    requirement: "Win three games in a row",
    unlock: (p) => p.achievements.includes("hat-trick"),
  },
  {
    id: "tiger",
    emoji: "🐯",
    requirement: "Play 10 games",
    unlock: (p) => p.achievements.includes("veteran"),
  },
  {
    id: "whale",
    emoji: "🐳",
    requirement: "Bank 1500+ in a single turn",
    unlock: (p) => p.achievements.includes("moonshot"),
  },
  {
    id: "crown",
    emoji: "👑",
    requirement: "Win 25 games",
    unlock: (p) => p.achievements.includes("champion"),
  },
];

/** The faces anyone can have — the pool auto-assignment draws from. */
export const FREE_AVATARS = AVATARS.filter((a) => !a.unlock);

/** Bots get machines, so a bot is never mistaken for a person at a glance. */
const BOT_AVATARS = ["🤖", "👾", "🛸", "🎩", "🧠", "🦾", "🕹️", "⚙️"];

export function isUnlocked(a: Avatar, profile: Profile): boolean {
  return !a.unlock || a.unlock(profile);
}

/** FNV-1a, so the same name always lands on the same face on every device. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function emojiById(id: string): string | undefined {
  return AVATARS.find((a) => a.id === id)?.emoji;
}

/**
 * The face to draw for a seat: an explicit pick if there is one and it's real,
 * otherwise a stable face derived from the name — machines for bots, animals
 * for people.
 *
 * Never returns empty, so no seat is ever faceless (which matters online, where
 * an older client may send no avatar at all).
 */
export function resolveAvatar(name: string, isBot: boolean, picked?: string): string {
  if (picked) {
    const chosen = emojiById(picked);
    if (chosen) return chosen;
  }
  const pool = isBot ? BOT_AVATARS : FREE_AVATARS.map((a) => a.emoji);
  return pool[hash(name) % pool.length];
}
