import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class Events {
  private handlers = new Map<string, Set<(event: { target?: unknown }) => unknown>>();
  addEventListener = vi.fn((type: string, listener: (event: { target?: unknown }) => unknown) => {
    const set = this.handlers.get(type) ?? new Set();
    set.add(listener);
    this.handlers.set(type, set);
  });
  emit(type: string, target?: unknown) {
    for (const listener of this.handlers.get(type) ?? []) listener({ target });
  }
  count(type: string) {
    return this.handlers.get(type)?.size ?? 0;
  }
}

class Param {
  value = 0;
  setTargetAtTime = vi.fn((value: number) => (this.value = value));
  setValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
}

class Node {
  connect = vi.fn((target: Node) => target);
  disconnect = vi.fn();
}

class Gain extends Node {
  gain = new Param();
}

class Source extends Node {
  onended: (() => void) | null = null;
  buffer: unknown;
  loop = false;
  type = "sine";
  frequency = new Param();
  start = vi.fn();
  stop = vi.fn();
}

class Filter extends Node {
  type = "bandpass";
  frequency = new Param();
  Q = new Param();
}

class Context {
  static all: Context[] = [];
  state = "suspended";
  currentTime = 0;
  sampleRate = 1000;
  destination = new Node();
  gains: Gain[] = [];
  sources: Source[] = [];
  resume = vi.fn(async () => {
    this.state = "running";
  });
  suspend = vi.fn(async () => {
    this.state = "suspended";
  });
  decodeAudioData = vi.fn(async () => ({}));
  constructor() {
    Context.all.push(this);
  }
  createGain() {
    const node = new Gain();
    this.gains.push(node);
    return node;
  }
  createOscillator() {
    const node = new Source();
    this.sources.push(node);
    return node;
  }
  createBufferSource() {
    return this.createOscillator();
  }
  createBiquadFilter() {
    return new Filter();
  }
  createBuffer(_channels: number, frames: number) {
    return { getChannelData: () => new Float32Array(frames) };
  }
}

let page: Events & { hidden: boolean };
let win: Events & { AudioContext: typeof Context };
let fetchTrack: ReturnType<typeof vi.fn>;

async function settle() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

beforeEach(() => {
  vi.resetModules();
  Context.all = [];
  page = Object.assign(new Events(), { hidden: false });
  win = Object.assign(new Events(), { AudioContext: Context });
  fetchTrack = vi.fn().mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(1) });
  vi.stubGlobal("document", page);
  vi.stubGlobal("window", win);
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  vi.stubGlobal("fetch", fetchTrack);
});

afterEach(() => {
  page.hidden = true;
  page.emit("visibilitychange");
  vi.unstubAllGlobals();
});

describe("phone audio lifecycle", () => {
  it("does not create audio or load music for background gestures and game events", async () => {
    const audio = await import("./sfx.js");
    audio.primeAudioOnFirstGesture();
    page.hidden = true;
    page.emit("visibilitychange");
    win.emit("pointerdown");
    audio.play("tumble");
    audio.playBetaCue("five");
    audio.setMusicVolume(1);
    expect(Context.all).toHaveLength(0);
    expect(fetchTrack).not.toHaveBeenCalled();
  });

  it("cancels scheduled effects on hide and resumes music without replaying old cues", async () => {
    const audio = await import("./sfx.js");
    audio.primeAudioOnFirstGesture();
    audio.setMusicVolume(0.5);
    audio.setSfxVolume(0.8);
    win.emit("pointerdown");
    await settle();
    const context = Context.all[0];
    const music = context.sources.find((source) => source.loop)!;
    audio.play("bank");
    const oldEffects = context.sources.filter((source) => !source.loop);
    expect(oldEffects.length).toBeGreaterThan(0);

    page.hidden = true;
    page.emit("visibilitychange");
    for (const effect of oldEffects) {
      expect(effect.stop).toHaveBeenCalledTimes(2); // scheduled end, then background cancellation
      expect(effect.disconnect).toHaveBeenCalledOnce();
    }
    expect(context.state).toBe("suspended");
    expect(context.gains[0].gain.value).toBe(0);
    expect(context.gains[1].gain.value).toBe(0);
    expect(music.stop).not.toHaveBeenCalled();
    const sourceCount = context.sources.length;
    audio.play("tumble");
    audio.playBetaCue("win");
    expect(context.sources).toHaveLength(sourceCount);

    page.hidden = false;
    page.emit("visibilitychange");
    expect(context.state).toBe("suspended");
    win.emit("pointerdown");
    await settle();
    expect(context.state).toBe("running");
    expect(context.sources).toHaveLength(sourceCount);
    expect(context.gains[0].gain.value).toBe(0.8);
    expect(context.gains[1].gain.value).toBe(0.5);
    expect(music.start).toHaveBeenCalledOnce();
    audio.play("bank");
    expect(context.sources.length).toBeGreaterThan(sourceCount);
  });

  it("handles pagehide before visibility changes and waits for a returning gesture", async () => {
    const audio = await import("./sfx.js");
    audio.primeAudioOnFirstGesture();
    win.emit("keydown");
    await settle();
    const context = Context.all[0];
    win.emit("pagehide");
    expect(page.hidden).toBe(false);
    expect(context.state).toBe("suspended");
    expect(context.gains[1].gain.value).toBe(0);
    const count = context.sources.length;
    win.emit("pointerdown");
    audio.play("roll");
    expect(context.sources).toHaveLength(count);
    win.emit("pageshow");
    expect(context.state).toBe("suspended");
    win.emit("keydown");
    await settle();
    expect(context.state).toBe("running");
    expect(context.sources).toHaveLength(count);
  });

  it("does not start a music decode that completes while the page is hidden", async () => {
    let resolve!: (value: { arrayBuffer: () => Promise<ArrayBuffer> }) => void;
    fetchTrack.mockReturnValue(new Promise((done) => (resolve = done)));
    const audio = await import("./sfx.js");
    audio.primeAudioOnFirstGesture();
    win.emit("pointerdown");
    page.hidden = true;
    page.emit("visibilitychange");
    resolve({ arrayBuffer: async () => new ArrayBuffer(1) });
    await settle();
    const context = Context.all[0];
    expect(context.sources).toHaveLength(0);
    page.hidden = false;
    page.emit("visibilitychange");
    win.emit("pointerdown");
    await settle();
    expect(context.sources.filter((source) => source.loop)).toHaveLength(1);
    expect(fetchTrack).toHaveBeenCalledOnce();
  });

  it("waits for a new gesture after a failed music load instead of retrying in a loop", async () => {
    fetchTrack.mockRejectedValueOnce(new Error("Offline"));
    const audio = await import("./sfx.js");
    audio.primeAudioOnFirstGesture();
    win.emit("pointerdown");
    await settle();
    expect(fetchTrack).toHaveBeenCalledOnce();
    expect(Context.all[0].sources).toHaveLength(0);
    win.emit("keydown");
    await settle();
    expect(fetchTrack).toHaveBeenCalledTimes(2);
    expect(Context.all[0].sources.filter((source) => source.loop)).toHaveLength(1);
  });

  it("discards queued effects after a refused resume and permits a later gesture", async () => {
    const audio = await import("./sfx.js");
    audio.primeAudioOnFirstGesture();
    audio.setMusicVolume(0);
    win.emit("pointerdown");
    await settle();
    const context = Context.all[0];
    context.state = "suspended";
    context.resume.mockRejectedValueOnce(new Error("Gesture required"));
    audio.play("bank");
    const effects = [...context.sources];
    await settle();
    for (const effect of effects) expect(effect.disconnect).toHaveBeenCalledOnce();
    win.emit("keydown");
    await settle();
    expect(context.state).toBe("running");
    expect(context.sources).toEqual(effects);
  });

  it("cleans up naturally ended effects and keeps music separate from SFX/mute", async () => {
    const audio = await import("./sfx.js");
    audio.primeAudioOnFirstGesture();
    win.emit("pointerdown");
    await settle();
    const context = Context.all[0];
    audio.play("bank");
    const effects = context.sources.filter((source) => !source.loop);
    for (const effect of effects) effect.onended?.();
    audio.setSfxVolume(0);
    const count = context.sources.length;
    audio.play("tumble");
    audio.playBetaCue("five");
    expect(context.sources).toHaveLength(count);
    expect(context.gains[0].gain.value).toBe(0);
    expect(context.gains[1].gain.value).toBe(0.4);
    audio.setMuted(true);
    expect(context.gains[1].gain.value).toBe(0);
    audio.setMuted(false);
    expect(context.gains[1].gain.value).toBe(0.4);
    page.hidden = true;
    page.emit("visibilitychange");
    for (const effect of effects) {
      expect(effect.stop).toHaveBeenCalledOnce();
      expect(effect.disconnect).toHaveBeenCalledOnce();
    }
  });

  it("installs only one lifecycle and click handler when startup is repeated", async () => {
    const audio = await import("./sfx.js");
    audio.primeAudioOnFirstGesture();
    audio.primeAudioOnFirstGesture();
    audio.installUiClicks();
    audio.installUiClicks();
    expect(win.count("pointerdown")).toBe(1); // graph priming
    expect(win.count("click")).toBe(1);
    expect(win.count("keydown")).toBe(1);
    expect(win.count("pagehide")).toBe(1);
    expect(win.count("pageshow")).toBe(1);
    expect(page.count("visibilitychange")).toBe(1);
    win.emit("click", {
      closest: () => ({ matches: () => false, getAttribute: () => null }),
    });
    await settle();
    expect(Context.all).toHaveLength(1);
    expect(Context.all[0].sources.filter((source) => !source.loop)).toHaveLength(1);
  });

  it("plays one cue on activation, including a keyboard click, rather than touch-down", async () => {
    const audio = await import("./sfx.js");
    audio.installUiClicks();
    const target = { closest: () => ({ matches: () => false, getAttribute: () => null }) };
    win.emit("pointerdown", target);
    expect(Context.all).toHaveLength(0);
    win.emit("click", target);
    await settle();
    expect(Context.all[0].sources.filter((source) => !source.loop)).toHaveLength(1);
    win.emit("click", target);
    expect(Context.all[0].sources.filter((source) => !source.loop)).toHaveLength(2);
  });

  it.each(["disabled", "aria-disabled", "aria-busy"])(
    "does not acknowledge a button marked %s as an accepted action",
    async (state) => {
      const audio = await import("./sfx.js");
      audio.installUiClicks();
      win.emit("click", {
        closest: () => ({
          matches: () => state === "disabled",
          getAttribute: (name: string) => (name === state ? "true" : null),
        }),
      });
      await settle();
      expect(Context.all).toHaveLength(0);
    },
  );
});
