/** Additive presentation data. Never participates in rules or ownership. */
export const MASCOTS = ["fox", "bear", "owl", "cat", "frog", "panda"] as const;
export const FRAMES = ["brass", "neon", "laurel", "diamond"] as const;
export const BACKGROUNDS = ["felt", "spotlight", "sunset", "stars"] as const;
export const NAMEPLATES = ["classic", "ticket", "marquee"] as const;
/**
 * Hats the characters can wear: each holiday's, and the advent calendar's.
 * "none" first, so an identity from before hats existed — or one an older
 * client sends — cleans to bare-headed.
 */
export const HATS = [
  "none",
  "party-hat",
  "heart-boppers",
  "leprechaun-hat",
  "sun-hat",
  "witch-hat",
  "pilgrim-hat",
  "santa-hat",
  "elf-hat",
  "antlers",
  "holly-crown",
  "bobble-hat",
] as const;
export interface BetaIdentity {
  version: 1;
  mascot: string;
  frame: string;
  background: string;
  nameplate: string;
  badge: string;
  /** Optional on the way in (older clients); always set by cleanBetaIdentity. */
  hat?: string;
}
export interface BetaLook extends BetaIdentity {
  dice: string;
}
export function cleanBetaIdentity(raw: unknown): BetaIdentity | undefined {
  if (!raw || typeof raw !== "object" || !("version" in raw) || raw.version !== 1) return undefined;
  const p = raw as Partial<BetaIdentity>;
  const pick = (v: unknown, ids: readonly string[]) =>
    typeof v === "string" && ids.includes(v) ? v : ids[0];
  return {
    version: 1,
    mascot: pick(p.mascot, MASCOTS),
    frame: pick(p.frame, FRAMES),
    background: pick(p.background, BACKGROUNDS),
    nameplate: pick(p.nameplate, NAMEPLATES),
    hat: pick(p.hat, HATS),
    badge: typeof p.badge === "string" && /^[a-z0-9-]{0,48}$/.test(p.badge) ? p.badge : "",
  };
}
export function cleanBetaLook(raw: unknown): BetaLook | undefined {
  const identity = cleanBetaIdentity(raw);
  if (!identity) return undefined;
  const dice = (raw as Partial<BetaLook>).dice;
  return {
    ...identity,
    dice: typeof dice === "string" && /^[a-z0-9-]{1,32}$/.test(dice) ? dice : "ivory",
  };
}
