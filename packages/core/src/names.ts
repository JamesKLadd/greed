/**
 * Player-name sanitisation, shared by local setup and the authoritative online
 * server (so a client can't smuggle a slur past the UI). Names are trimmed and
 * length-capped, then screened against a denylist with common leet-speak and
 * repeated-letter obfuscation folded away. A rejected name becomes a safe
 * fallback rather than being shown.
 */

export const MAX_NAME_LENGTH = 16;

// Unambiguous terms — matched anywhere in the folded name.
const STRONG = [
  "fuck",
  "motherfuck",
  "shit",
  "bullshit",
  "bitch",
  "cunt",
  "asshole",
  "piss",
  "bastard",
  "slut",
  "whore",
  "pussy",
  "wank",
  "bollock",
  "twat",
  "dildo",
  "jizz",
  "nutsack",
  "retard",
  "nigger",
  "nigga",
  "faggot",
  "spic",
  "chink",
  "kike",
  "coon",
  "wetback",
  "tranny",
  "dyke",
  "nazi",
  "rapist",
  "molest",
  "pedo",
  "paedo",
  "porn",
];

// Short/ambiguous roots that appear inside innocent words (Cockburn, Cumberland,
// grape, assassin…) — matched only as a whole token.
const WORD = ["ass", "cum", "fag", "cock", "dick", "prick", "hoe", "tit", "tits", "rape", "boner"];

/** Fold leet-speak to letters, keeping other characters so tokens survive. */
function deleet(s: string): string {
  return s
    .toLowerCase()
    .replace(/[@4]/g, "a")
    .replace(/3/g, "e")
    .replace(/[1!|]/g, "i")
    .replace(/0/g, "o")
    .replace(/[$5]/g, "s")
    .replace(/7/g, "t");
}

/** True when `raw` contains a denylisted word (after de-obfuscation). */
export function hasProfanity(raw: string): boolean {
  const deleeted = deleet(raw);
  // De-leet FIRST, then drop non-letters — so "$" becomes "s" before it would
  // otherwise be treated as a separator (a$$ -> ass, f.u.c.k -> fuck).
  const folded = deleeted.replace(/[^a-z]/g, "");
  if (!folded) return false;
  const collapsed = folded.replace(/(.)\1+/g, "$1"); // "shiiit" -> "shit"
  if (STRONG.some((w) => folded.includes(w) || collapsed.includes(w))) return true;
  // Short ambiguous roots: match only whole tokens (split on real separators,
  // which no longer include the leet symbols).
  const tokens = deleeted.split(/[^a-z]+/).filter(Boolean);
  return tokens.some((t) => WORD.includes(t) || WORD.includes(t.replace(/(.)\1+/g, "$1")));
}

// Characters allowed in a display name: letters (any script), digits, spaces, and
// a few safe joiners (apostrophe, period, underscore, hyphen). Everything else —
// symbols, punctuation, emoji, stray combining marks (zalgo) — is stripped out.
const DISALLOWED = /[^\p{L}\p{N} '._-]/gu;

/** Remove special characters, composing accents first so "José" survives but "😎" doesn't. */
function stripSpecialChars(s: string): string {
  return s.normalize("NFC").replace(DISALLOWED, "");
}

/**
 * A safe display name: trimmed, whitespace-collapsed and length-capped; special
 * characters removed (only letters, digits, spaces and simple joiners survive);
 * replaced with `fallback` when it is empty or contains blocked words.
 */
export function cleanPlayerName(raw: string, fallback = "Player"): string {
  const trimmed = (raw ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
  if (!trimmed) return fallback;
  // Check profanity BEFORE stripping, so leet obfuscation (b!tch, $hit) is still caught.
  if (hasProfanity(trimmed)) return fallback;
  const cleaned = stripSpecialChars(trimmed).replace(/\s+/g, " ").trim();
  return cleaned || fallback;
}
