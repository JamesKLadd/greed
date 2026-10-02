import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applySettings,
  loadSettings,
  normalizeSettings,
  updateSettings,
  type Settings,
} from "./settings.js";
import { setSfxVolume, setMusicVolume } from "./sfx.js";
import { setColorblindPalette } from "./theme.js";

vi.mock("./sfx.js", () => ({ setSfxVolume: vi.fn(), setMusicVolume: vi.fn() }));
vi.mock("./theme.js", () => ({ setColorblindPalette: vi.fn() }));

const DEFAULTS: Settings = {
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
const SAVED: Settings = {
  textScale: "large",
  highContrast: true,
  colorblind: true,
  reduceMotion: true,
  showGuidance: true,
  showTurnScore: false,
  dice3d: false,
  hideRoomCode: true,
  sfxVolume: 0.35,
  musicVolume: 0.7,
};
let data: Map<string, string>;
let dataset: Record<string, string>;

beforeEach(() => {
  vi.clearAllMocks();
  data = new Map();
  dataset = {};
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => data.set(key, value)),
  });
  vi.stubGlobal("document", { documentElement: { dataset } });
});
afterEach(() => vi.unstubAllGlobals());

describe("saved settings upgrades", () => {
  it("preserves every valid preference and ignores unknown future fields", () => {
    data.set("greed:settings", JSON.stringify({ ...SAVED, futureControl: true }));
    expect(loadSettings()).toEqual(SAVED);
  });

  it("fills newly added preferences without overwriting older choices", () => {
    data.set("greed:settings", JSON.stringify({ textScale: "large", highContrast: true }));
    expect(loadSettings()).toEqual({ ...DEFAULTS, textScale: "large", highContrast: true });
  });

  it("migrates the legacy volume while an explicit SFX preference takes precedence", () => {
    data.set("greed:settings", JSON.stringify({ volume: 0.25 }));
    expect(loadSettings()).toEqual({ ...DEFAULTS, sfxVolume: 0.25 });
    data.set("greed:settings", JSON.stringify({ volume: 0.25, sfxVolume: 0.6 }));
    expect(loadSettings()).toEqual({ ...DEFAULTS, sfxVolume: 0.6 });
  });

  it("rejects malformed enums and booleans without coercing strings or numbers", () => {
    expect(
      normalizeSettings({
        textScale: "huge",
        highContrast: "false",
        colorblind: 1,
        reduceMotion: {},
        showGuidance: null,
        showTurnScore: "false",
        dice3d: [],
        hideRoomCode: "true",
        sfxVolume: "0.2",
        musicVolume: null,
      }),
    ).toEqual(DEFAULTS);
  });

  it("clamps finite volumes and refuses non-finite values", () => {
    expect(normalizeSettings({ sfxVolume: -2, musicVolume: 3 })).toEqual({
      ...DEFAULTS,
      sfxVolume: 0,
      musicVolume: 1,
    });
    for (const value of [NaN, Infinity, -Infinity, "quiet", null]) {
      expect(normalizeSettings({ sfxVolume: value, musicVolume: value })).toEqual(DEFAULTS);
      expect(normalizeSettings({ volume: value })).toEqual(DEFAULTS);
    }
    expect(normalizeSettings({ volume: 2 }).sfxVolume).toBe(1);
  });

  it("recovers defaults for missing, invalid JSON and non-object storage", () => {
    expect(loadSettings()).toEqual(DEFAULTS);
    for (const raw of ["broken json", "null", "[]", '"large"', "7", "false"]) {
      data.set("greed:settings", raw);
      expect(loadSettings()).toEqual(DEFAULTS);
    }
  });
});

describe("live settings updates", () => {
  it("normalizes patches before persistence and keeps unrelated preferences/progress", () => {
    data.set("greed:settings", JSON.stringify(SAVED));
    data.set("greed:profile", "earned progress");
    const next = updateSettings({
      textScale: "huge",
      colorblind: "false",
      musicVolume: 3,
      sfxVolume: NaN,
      futureControl: 99,
    } as unknown as Partial<Settings>);
    expect(next).toEqual({ ...SAVED, musicVolume: 1 });
    expect(JSON.parse(data.get("greed:settings")!)).toEqual(next);
    expect(data.get("greed:profile")).toBe("earned progress");
    expect(data.size).toBe(2);
    expect(dataset).toEqual({ textScale: "large", contrast: "high", motion: "reduced" });
    expect(setSfxVolume).toHaveBeenLastCalledWith(0.35);
    expect(setMusicVolume).toHaveBeenLastCalledWith(1);
    expect(setColorblindPalette).toHaveBeenLastCalledWith(true);
  });

  it("applies valid false/off preferences instead of replacing them with defaults", () => {
    data.set("greed:settings", JSON.stringify(SAVED));
    applySettings(SAVED);
    expect(dataset).toEqual({ textScale: "large", contrast: "high", motion: "reduced" });
    const next = updateSettings({ highContrast: false, reduceMotion: false, sfxVolume: 0 });
    expect(next).toEqual({ ...SAVED, highContrast: false, reduceMotion: false, sfxVolume: 0 });
    expect(dataset.contrast).toBe("normal");
    expect(dataset.motion).toBe("full");
    expect(setSfxVolume).toHaveBeenLastCalledWith(0);
  });

  it("works in memory when private/blocked storage refuses reads and writes", () => {
    const fail = () => {
      throw new Error("storage blocked");
    };
    vi.stubGlobal("localStorage", { getItem: fail, setItem: fail });
    expect(loadSettings()).toEqual(DEFAULTS);
    expect(() => updateSettings({ textScale: "large", musicVolume: 0 })).not.toThrow();
    expect(dataset.textScale).toBe("large");
    expect(setMusicVolume).toHaveBeenLastCalledWith(0);
  });
});
