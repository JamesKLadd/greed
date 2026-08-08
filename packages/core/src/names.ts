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

// Cross-script look-alikes (Greek / Cyrillic / IPA / etc.) folded to the Latin
// letter they imitate, so homoglyph spellings — ϝαɠɠσƚ, а$$, ѕhіt — can't dodge
// the denylist. Chosen by visual resemblance and observed abuse, not a formal set.
const CONFUSABLES: Record<string, string> = {};
for (const [ascii, group] of Object.entries({
  a: "аαɑ⍺",
  b: "ƀɓ",
  c: "сϲςɕ",
  d: "ԁɗ",
  e: "еεёϵ",
  f: "ϝƒ",
  g: "ɠɡɢԍ",
  h: "һℎ",
  i: "іιїıɪɩ",
  j: "јʝ",
  k: "κкⱪ",
  l: "ⅼӏł",
  m: "мⅿ",
  n: "ոɳ",
  o: "оοσøɵθ",
  p: "рρ",
  q: "ԛɋ",
  r: "гɼ",
  s: "ѕʂ",
  t: "тτƚ",
  u: "υս",
  v: "νѵ",
  w: "ѡ",
  x: "хχ",
  y: "уγ",
  z: "ʐ",
})) {
  for (const ch of group) CONFUSABLES[ch] = ascii;
}

/** Replace cross-script look-alike letters with the ASCII letter they imitate. */
function foldConfusables(s: string): string {
  let out = "";
  for (const ch of s) out += CONFUSABLES[ch] ?? ch;
  return out;
}

/** Fold fancy fonts, accents and homoglyphs to plain letters, then leet-speak. */
function deleet(s: string): string {
  return foldConfusables(
    s
      .normalize("NFKD") // fold "fancy fonts" + split accents into base + combining mark
      .replace(/\p{M}/gu, "") // drop the accents (é -> e, ñ -> n)
      .toLowerCase(),
  )
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

/** Remove special characters (input is already NFKC-normalised by the caller). */
function stripSpecialChars(s: string): string {
  return s.replace(DISALLOWED, "");
}

/**
 * A safe display name: trimmed, whitespace-collapsed and length-capped; special
 * characters removed (only letters, digits, spaces and simple joiners survive);
 * replaced with `fallback` when it is empty or contains blocked words.
 *
 * NFKC normalisation runs first so alternate-font letters (𝖋𝖆𝖌𝖌𝖔𝖙, ｆｕｌｌｗｉｄｔｈ,
 * ⓒⓘⓡⓒⓛⓔ⓭) collapse to their plain equivalents — they can't dodge the profanity
 * screen or smuggle "fancy" fonts into the displayed name.
 */
export function cleanPlayerName(raw: string, fallback = "Player"): string {
  const trimmed = (raw ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  if (!trimmed) return fallback;
  // Check profanity BEFORE stripping, so leet obfuscation (b!tch, $hit) is still caught.
  if (hasProfanity(trimmed)) return fallback;
  const cleaned = stripSpecialChars(trimmed).replace(/\s+/g, " ").trim();
  return cleaned || fallback;
}
