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

/**
 * Scripts a name may be written in.
 *
 * The homoglyph dodge is a slur spelled with look-alike letters borrowed from
 * another alphabet — ϝαɠɠσƚ, ѕhіt, а$$ — and what gives it away is not the
 * script, it is the MIXING: real names are written in one alphabet, and a name
 * that reaches into three to assemble a word is doing something else.
 *
 * This used to reject any non-Latin letter outright, which caught the dodge and
 * also meant a player called 李明 or Даша could not use their own name. Now the
 * rule is one script per name. Latin, Cyrillic, Greek, Han, Hiragana, Katakana,
 * Hangul, Arabic, Hebrew, Devanagari, Thai — pick one.
 *
 * Common/Inherited characters (digits, spaces, the joiners this allows, and
 * combining marks) belong to no script and are not counted, so "José 99" is a
 * single-script name.
 */
const SCRIPTS = [
  "Latin",
  "Cyrillic",
  "Greek",
  "Han",
  "Hiragana",
  "Katakana",
  "Hangul",
  "Arabic",
  "Hebrew",
  "Devanagari",
  "Thai",
] as const;

/** Which of the allowed scripts this character belongs to, if any. */
function scriptOf(ch: string): string | null {
  for (const script of SCRIPTS) {
    if (new RegExp(`\\p{Script=${script}}`, "u").test(ch)) return script;
  }
  return null;
}

/**
 * True when a name mixes alphabets, or uses one this game does not know.
 *
 * Japanese is the deliberate exception: it is normally written in Han,
 * Hiragana and Katakana together, so those three count as one script here.
 */
function isMixedScript(s: string): boolean {
  const seen = new Set<string>();
  for (const ch of s) {
    if (!/\p{L}/u.test(ch)) continue;
    const script = scriptOf(ch);
    if (!script) return true; // a letter from a script we do not accept
    seen.add(["Han", "Hiragana", "Katakana"].includes(script) ? "Japanese" : script);
  }
  return seen.size > 1;
}

// Characters allowed in a display name: Latin-script letters (incl. accented),
// digits, spaces, and a few safe joiners (' . _ -). Everything else — symbols,
// punctuation, emoji, stray combining marks (zalgo), and letters from other
// scripts — is stripped out.
const DISALLOWED = new RegExp(
  `[^${SCRIPTS.map((s) => `\\p{Script=${s}}`).join("")}\\p{M}0-9 '._-]`,
  "gu",
);

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
  // Reject cross-script homoglyph spellings (see isMixedScript). A name written
  // wholly in one alphabet is a name, whichever alphabet that is.
  if (isMixedScript(trimmed)) return fallback;
  const cleaned = stripSpecialChars(trimmed).replace(/\s+/g, " ").trim();
  return cleaned || fallback;
}
