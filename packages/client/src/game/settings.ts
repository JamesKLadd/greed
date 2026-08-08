import { setColorblindPalette } from "./theme.js";
import { setSfxVolume, setMusicVolume } from "./sfx.js";

/**
 * User accessibility & display preferences, persisted to localStorage and applied
 * as data-attributes on the document root (so CSS reacts) plus a couple of live
 * hooks (seat palette, audio volume). Client-only.
 */

export interface Settings {
  textScale: "normal" | "large";
  highContrast: boolean;
  colorblind: boolean;
  reduceMotion: boolean;
  /** Sound-effects volume, 0..1. */
  sfxVolume: number;
  /** Background-music volume, 0..1. */
  musicVolume: number;
}

const STORAGE_KEY = "greed:settings";

function defaults(): Settings {
  return {
    textScale: "normal",
    highContrast: false,
    colorblind: false,
    reduceMotion: false,
    sfxVolume: 1,
    musicVolume: 0.4,
  };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw) as Partial<Settings> & { volume?: number };
    const merged = { ...defaults(), ...parsed };
    // Back-compat: an older single `volume` maps to the SFX volume.
    if (parsed.sfxVolume === undefined && typeof parsed.volume === "number") {
      merged.sfxVolume = parsed.volume;
    }
    return merged;
  } catch {
    return defaults();
  }
}

function save(s: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** Apply settings to the document root and the live audio/palette hooks. */
export function applySettings(s: Settings): void {
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.dataset.textScale = s.textScale;
    root.dataset.contrast = s.highContrast ? "high" : "normal";
    root.dataset.motion = s.reduceMotion ? "reduced" : "full";
  }
  setColorblindPalette(s.colorblind);
  setSfxVolume(s.sfxVolume);
  setMusicVolume(s.musicVolume);
}

/** Merge a change, persist, apply live, and return the new settings. */
export function updateSettings(patch: Partial<Settings>): Settings {
  const next = { ...loadSettings(), ...patch };
  save(next);
  applySettings(next);
  return next;
}
