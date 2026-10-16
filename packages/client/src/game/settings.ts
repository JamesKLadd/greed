import { setColorblindPalette } from "./theme.js";
import { setSfxVolume, setMusicVolume } from "./sfx.js";
import {
  applySeasonalPreference,
  isSeasonalPreference,
  type SeasonalPreference,
} from "./seasonal.js";

/**
 * User accessibility & display preferences, persisted to localStorage and applied
 * as data-attributes on the document root (so CSS reacts) plus a couple of live
 * hooks (seat palette, audio volume). Client-only.
 */

export interface Settings {
  seasonalTheme: SeasonalPreference;
  textScale: "normal" | "large";
  highContrast: boolean;
  colorblind: boolean;
  reduceMotion: boolean;
  /**
   * Show the plain-English line under the table that says what's happening and
   * what you can do about it. OFF by default: it repeats itself constantly once
   * you know the game, and the table already says whose turn it is. Anyone
   * learning can turn it on.
   */
  showGuidance: boolean;
  /**
   * Show the big turn-score number above the dice — the running total you are
   * deciding whether to bank or gamble. On by default; turning it off is a
   * harder, more committed way to play (the per-seat totals still show what
   * everyone has actually banked).
   */
  showTurnScore: boolean;
  /**
   * Render the dice on the table as 3D cubes that tumble, rather than flat
   * faces. On by default. Separate from `reduceMotion`, which already shortens
   * the throw: this is about the look of the die itself, and a flat face is
   * easier to read at a glance (and cheaper to draw on a weak device).
   *
   * Only affects the dice you WATCH — the in-game tray and the daily run. The
   * small inline dice in turn history and the rules modal are always flat.
   */
  dice3d: boolean;
  /** Hide the room code in the in-game header (e.g. while streaming). */
  hideRoomCode: boolean;
  /** Sound-effects volume, 0..1. */
  sfxVolume: number;
  /** Background-music volume, 0..1. */
  musicVolume: number;
}

const STORAGE_KEY = "greed:settings";

function defaults(): Settings {
  return {
    seasonalTheme: "automatic",
    textScale: "normal",
    highContrast: false,
    colorblind: false,
    reduceMotion: false,
    showGuidance: false,
    showTurnScore: true,
    dice3d: true,
    hideRoomCode: false,
    sfxVolume: 1,
    musicVolume: 0.5,
  };
}

/** Old or damaged browser data must not feed invalid values to CSS/audio. */
export function normalizeSettings(raw: unknown, fallback: Settings = defaults()): Settings {
  const next = { ...fallback };
  const parsed =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  if (isSeasonalPreference(parsed.seasonalTheme)) next.seasonalTheme = parsed.seasonalTheme;
  if (parsed.textScale === "normal" || parsed.textScale === "large") {
    next.textScale = parsed.textScale;
  }
  for (const key of [
    "highContrast",
    "colorblind",
    "reduceMotion",
    "showGuidance",
    "showTurnScore",
    "dice3d",
    "hideRoomCode",
  ] as const) {
    if (typeof parsed[key] === "boolean") next[key] = parsed[key];
  }
  // An explicitly saved independent SFX preference wins over the old volume.
  const sfx = parsed.sfxVolume === undefined ? parsed.volume : parsed.sfxVolume;
  if (typeof sfx === "number" && Number.isFinite(sfx)) {
    next.sfxVolume = Math.max(0, Math.min(1, sfx));
  }
  if (typeof parsed.musicVolume === "number" && Number.isFinite(parsed.musicVolume)) {
    next.musicVolume = Math.max(0, Math.min(1, parsed.musicVolume));
  }
  return next;
}

// A denied write must not make the next volume change erase a live appearance
// choice. Keep this browser's last settings in memory until it can save again.
const memory = new WeakMap<Storage, Settings>();
const unsaved = new WeakSet<Storage>();
let inaccessibleStorageSettings: Settings | undefined;

export function loadSettings(): Settings {
  let storage: Storage | undefined;
  try {
    storage = localStorage;
    const cached = memory.get(storage);
    if (cached && unsaved.has(storage)) return { ...cached };
    const raw = storage.getItem(STORAGE_KEY);
    const settings = raw ? normalizeSettings(JSON.parse(raw)) : defaults();
    memory.set(storage, settings);
    inaccessibleStorageSettings = settings;
    return { ...settings };
  } catch {
    return {
      ...((storage ? memory.get(storage) : inaccessibleStorageSettings) ?? defaults()),
    };
  }
}

function save(s: Settings): void {
  inaccessibleStorageSettings = s;
  let storage: Storage | undefined;
  try {
    storage = localStorage;
    memory.set(storage, s);
    storage.setItem(STORAGE_KEY, JSON.stringify(s));
    unsaved.delete(storage);
  } catch {
    if (storage) unsaved.add(storage);
  }
}

/** Apply settings to the document root and the live audio/palette hooks. */
export function applySettings(s: Settings): void {
  applySeasonalPreference(s.seasonalTheme);
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
  // A malformed patch is ignored field by field instead of erasing a valid
  // saved preference. Only the known normalized settings are written back.
  const next = normalizeSettings(patch, loadSettings());
  save(next);
  applySettings(next);
  return next;
}
