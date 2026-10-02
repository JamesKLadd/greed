/**
 * Sound for Greed. SFX are synthesized live with the Web Audio API (no binary
 * assets); the background MUSIC is a looping audio track. A shared AudioContext
 * is created lazily and resumed on the first user gesture (browsers suspend
 * audio until then). SFX and Music have independent volumes; a single mute
 * (persisted) silences both.
 */

import musicUrl from "../assets/background-music.mp3";

const MUTE_KEY = "greed:muted";

let ctx: AudioContext | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let pageHidden = false;
let needsGesture = false;
let audioListenersInstalled = false;
let uiClicksInstalled = false;
const activeEffects = new Map<AudioScheduledSourceNode, () => void>();

let muted = readMuted();
let sfxVolume = 1; // 0..1, set from settings
let musicVolume = 0.4; // 0..1, set from settings

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function sfxLevel(): number {
  return muted || audioHidden() ? 0 : sfxVolume;
}
function musicLevel(): number {
  return muted || audioHidden() ? 0 : musicVolume;
}

function audioHidden(): boolean {
  return pageHidden || (typeof document !== "undefined" && document.hidden);
}

/** A suspended context must not save old dice/payoff sounds for the next visit. */
function stopEffects(): void {
  for (const [source, cleanup] of activeEffects) {
    try {
      source.stop();
    } catch {
      /* an already-ended source is harmless */
    }
    cleanup();
  }
  activeEffects.clear();
}

function trackEffect(source: AudioScheduledSourceNode, ...nodes: AudioNode[]): void {
  const cleanup = () => {
    activeEffects.delete(source);
    source.onended = null;
    source.disconnect();
    for (const node of nodes) node.disconnect();
  };
  activeEffects.set(source, cleanup);
  source.onended = cleanup;
}

function pauseBackgroundAudio(): void {
  needsGesture = true;
  stopEffects();
  applyBusLevels();
  if (ctx && ctx.state !== "closed") {
    void ctx.suspend().catch(() => {
      /* bus levels still silence browsers that cannot suspend */
    });
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
  try {
    localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  } catch {
    /* ignore storage failures */
  }
  applyBusLevels();
  updateMusicState();
}

/** Set the SFX volume (0..1). Persisted by the settings module, not here. */
export function setSfxVolume(v: number): void {
  sfxVolume = clamp01(v);
  applyBusLevels();
}

/** Set the music volume (0..1). Starts/stops the ambient loop as needed. */
export function setMusicVolume(v: number): void {
  musicVolume = clamp01(v);
  applyBusLevels();
  updateMusicState();
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function applyBusLevels(): void {
  if (!ctx) return;
  sfxBus?.gain.setTargetAtTime(sfxLevel(), ctx.currentTime, 0.02);
  musicBus?.gain.setTargetAtTime(musicLevel(), ctx.currentTime, 0.05);
}

/** Lazily create the audio graph. Safe to call repeatedly. */
function ensureContext(): AudioContext | null {
  if (typeof window === "undefined" || audioHidden()) return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    sfxBus = ctx.createGain();
    sfxBus.gain.value = sfxLevel();
    sfxBus.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = musicLevel();
    musicBus.connect(ctx.destination);
  }
  // Keep gesture listeners armed for mobile audio interruptions and BFCache
  // returns. A refused resume must not leave queued effects for a later tap.
  if (ctx.state !== "running" || needsGesture) {
    needsGesture = false;
    const context = ctx;
    void context
      .resume()
      .then(() => {
        // A resume requested just before backgrounding may finish afterwards.
        if (audioHidden()) pauseBackgroundAudio();
        else applyBusLevels();
      })
      .catch(() => {
        needsGesture = true;
        stopEffects();
      });
  }
  updateMusicState();
  return ctx;
}

/**
 * Install page-lifetime listeners once. The first gesture unlocks audio; later
 * gestures can unlock it again after a phone interruption or background visit.
 */
export function primeAudioOnFirstGesture(): void {
  if (typeof window === "undefined" || audioListenersInstalled) return;
  audioListenersInstalled = true;
  const gesture = () => ensureContext();
  const visibility = () => {
    if (audioHidden()) pauseBackgroundAudio();
    else applyBusLevels();
  };
  window.addEventListener("pointerdown", gesture);
  window.addEventListener("keydown", gesture);
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("pagehide", () => {
    pageHidden = true;
    pauseBackgroundAudio();
  });
  window.addEventListener("pageshow", () => {
    pageHidden = false;
    visibility();
  });
}

/** Play a soft click on any button press across the app. Call once at startup. */
export function installUiClicks(): void {
  if (typeof window === "undefined" || uiClicksInstalled) return;
  uiClicksInstalled = true;
  window.addEventListener(
    "pointerdown",
    (e) => {
      const el = e.target as HTMLElement | null;
      if (el && el.closest("button")) uiClick();
    },
    true,
  );
}

// ---------------------------------------------------------------------------
// SFX primitives (routed to the SFX bus)
// ---------------------------------------------------------------------------

/** A single decaying oscillator tone. */
function tone(
  freq: number,
  start: number,
  dur: number,
  {
    type = "sine",
    gain = 0.3,
    glideTo,
  }: { type?: OscillatorType; gain?: number; glideTo?: number } = {},
): void {
  if (!ctx || !sfxBus) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (glideTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), start + dur);
  }
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g).connect(sfxBus);
  trackEffect(osc, g);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

/** A short filtered-noise burst — used for the dice clatter and UI clicks. */
function noiseBurst(
  start: number,
  dur: number,
  { freq = 2200, q = 0.7, gain = 0.35 }: { freq?: number; q?: number; gain?: number } = {},
): void {
  if (!ctx || !sfxBus) return;
  const frames = Math.floor(ctx.sampleRate * dur);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(filter).connect(g).connect(sfxBus);
  trackEffect(src, filter, g);
  src.start(start);
  src.stop(start + dur + 0.02);
}

/** Small random pitch wobble so repeated cues aren't identical. */
function vary(amount = 0.03): number {
  return 1 + (Math.random() - 0.5) * amount;
}

const rand = (n: number) => Math.floor(Math.random() * n);

function uiClick(): void {
  if (muted || sfxVolume <= 0 || audioHidden()) return;
  const c = ensureContext();
  if (!c) return;
  noiseBurst(c.currentTime, 0.02, { freq: 2600 * vary(0.15), q: 1.2, gain: 0.06 });
}

type Sound =
  | "roll"
  | "bank"
  | "bust"
  | "hotDice"
  | "endgame"
  | "suddenDeath"
  | "win"
  | "yourTurn"
  | "click"
  | "streak"
  | "awww"
  | "cash"
  | "tumble"
  | "timeShort";

/** Original five-note house signature. Shares the existing volume/mute bus. */
export function playBetaCue(
  kind: "score" | "bank" | "bigBank" | "hot" | "triple" | "straight" | "five" | "bust" | "win",
): void {
  if (muted || sfxVolume <= 0 || audioHidden()) return;
  const c = ensureContext();
  if (!c || !sfxBus) return;
  const start = c.currentTime;
  // Raise the beta motifs about 7 dB so they read over the ambient music.
  // The existing SFX slider and mute bus still control the final level.
  const cueGain = 2.2;
  const notes =
    kind === "five"
      ? [392, 494, 587, 784, 988]
      : kind === "win"
        ? [392, 494, 587, 784, 1175]
        : kind === "straight"
          ? [330, 392, 494, 587, 660]
          : kind === "triple"
            ? [392, 494, 587]
            : kind === "hot"
              ? [330, 440, 554, 660]
              : kind === "bigBank"
                ? [392, 587, 784]
                : kind === "bank"
                  ? [392, 587]
                  : kind === "bust"
                    ? [196, 147]
                    : [660];
  notes.forEach((hz, i) => {
    tone(hz, start + i * 0.075, kind === "bust" ? 0.16 : 0.22, {
      type: "triangle",
      gain: (kind === "score" ? 0.055 : 0.1) * cueGain,
    });
    if (kind === "five" || kind === "win")
      tone(hz * 2, start + i * 0.075, 0.13, { type: "sine", gain: 0.025 * cueGain });
  });
  if (kind === "bank" || kind === "bigBank") {
    [0, 0.07, 0.12].forEach((offset, i) =>
      noiseBurst(start + offset, 0.05, {
        freq: 1400 + i * 400,
        gain: (0.13 - i * 0.025) * cueGain,
      }),
    );
  }
  if (["hot", "five", "win"].includes(kind)) {
    noiseBurst(start, 0.18, { freq: 800, gain: 0.1 * cueGain });
    tone(98, start, 0.25, { type: "sine", gain: 0.12 * cueGain });
  }
}

export interface PlayOptions {
  /**
   * Escalation for "streak": 0 is the first cue (the 4th roll), 1 the next, and
   * so on. Each step lifts the pitch a whole tone, so a turn that keeps rolling
   * keeps climbing. Ignored by every other sound.
   */
  step?: number;
}

export function play(sound: Sound, opts: PlayOptions = {}): void {
  if (muted || sfxVolume <= 0 || audioHidden()) return;
  const c = ensureContext();
  if (!c || !sfxBus) return;
  const t = c.currentTime;
  const v = vary(); // slight per-play pitch variation

  switch (sound) {
    case "roll": {
      noiseBurst(t, 0.09, { freq: 2400 * vary(0.12), gain: 0.3 });
      noiseBurst(t + 0.05 + Math.random() * 0.03, 0.11, { freq: 1500 * vary(0.14), gain: 0.28 });
      tone(180 * v, t + 0.02, 0.08, { type: "triangle", gain: 0.12 });
      break;
    }
    case "click": {
      noiseBurst(t, 0.03, { freq: 3000 * vary(0.1), gain: 0.14 });
      break;
    }
    case "bank": {
      tone(523.25 * v, t, 0.16, { type: "triangle", gain: 0.22 });
      tone(659.25 * v, t + 0.09, 0.16, { type: "triangle", gain: 0.22 });
      tone(783.99 * v, t + 0.18, 0.28, { type: "triangle", gain: 0.24 });
      break;
    }
    case "bust": {
      tone(300 * v, t, 0.32, { type: "sawtooth", gain: 0.28, glideTo: 90 });
      tone(150 * v, t + 0.02, 0.34, { type: "square", gain: 0.14, glideTo: 60 });
      break;
    }
    case "hotDice": {
      const notes = [659.25, 830.61, 987.77, 1318.51];
      notes.forEach((f, i) => tone(f * v, t + i * 0.06, 0.18, { type: "triangle", gain: 0.2 }));
      break;
    }
    case "endgame": {
      tone(220 * v, t, 0.6, { type: "sine", gain: 0.3 });
      tone(330 * v, t + 0.04, 0.5, { type: "sine", gain: 0.16 });
      break;
    }
    case "suddenDeath": {
      tone(440 * v, t, 0.3, { type: "sawtooth", gain: 0.18 });
      tone(466.16 * v, t + 0.02, 0.4, { type: "sawtooth", gain: 0.16 });
      break;
    }
    case "yourTurn": {
      // A soft two-note "ding-dong" bell to cue the local player it's their turn.
      tone(880 * v, t, 0.22, { type: "sine", gain: 0.22 });
      tone(1174.66 * v, t + 0.12, 0.34, { type: "sine", gain: 0.2 });
      tone(587.33 * v, t + 0.12, 0.34, { type: "triangle", gain: 0.08 });
      break;
    }
    case "timeShort": {
      // Two urgent taps, once, when a turn's clock is nearly out. Deliberately
      // unlike "yourTurn": that one invites, this one prods. Short and dry so
      // it cuts through whatever else is happening without being a siren — the
      // player it exists for is the one who has looked away from the screen.
      tone(1046.5 * v, t, 0.09, { type: "square", gain: 0.1 });
      tone(1046.5 * v, t + 0.15, 0.09, { type: "square", gain: 0.11 });
      break;
    }
    case "streak": {
      // A rising three-note flourish for a turn that keeps rolling. Each further
      // roll transposes the whole figure up a whole tone (capped, so a very long
      // turn doesn't climb into a shriek) and adds a touch of sizzle.
      const step = Math.min(opts.step ?? 0, 7);
      const shift = Math.pow(2, (step * 2) / 12);
      const notes = [587.33, 739.99, 987.77];
      notes.forEach((f, i) =>
        tone(f * shift * v, t + i * 0.055, 0.2, { type: "triangle", gain: 0.19 }),
      );
      // The crackle under it — brighter as the streak climbs.
      noiseBurst(t + 0.02, 0.16, { freq: 3200 * shift, q: 0.9, gain: 0.05 + step * 0.012 });
      break;
    }
    case "awww": {
      // Sympathy, not punishment: a soft three-voice sigh that sags in pitch.
      // This replaces the harsh "bust" when a turn dies on its opening roll,
      // where nothing was actually lost.
      //
      // The lead is a TRIANGLE, not a sine. A pure sine has no harmonics above
      // its fundamental, so it sits underneath the music instead of in front of
      // it and the cue was getting lost — the extra partials are what let this
      // carry without simply being louder than everything else.
      tone(392 * v, t, 0.5, { type: "triangle", gain: 0.34, glideTo: 262 });
      tone(311.13 * v, t + 0.05, 0.46, { type: "triangle", gain: 0.2, glideTo: 208 });
      tone(196 * v, t + 0.09, 0.42, { type: "sine", gain: 0.12, glideTo: 131 });
      break;
    }
    case "tumble": {
      // The throw itself — dice bouncing across the felt while they're in the
      // air, under the clatter that lands with them. Knocks are scattered at
      // random and thin out as the dice lose energy, so no two throws sound
      // alike and the sound reads as settling rather than as a loop.
      const span = 0.58;
      const knocks = 9 + rand(4);
      for (let i = 0; i < knocks; i++) {
        // Bunched early: dice are liveliest just after they leave the hand.
        const p = Math.pow(i / knocks, 0.72);
        const at = t + p * span + Math.random() * 0.025;
        // Knocks fade as the dice slow, but not to nothing: the tail is the part
        // that overlaps the music, so dropping it too far is what made the whole
        // throw read as quiet even when the first knocks were loud enough.
        const energy = 1 - p * 0.55;
        noiseBurst(at, 0.028 + Math.random() * 0.022, {
          freq: (1500 + Math.random() * 1900) * vary(0.2),
          q: 1.7,
          gain: 0.19 * energy,
        });
        tone(88 + Math.random() * 74, at, 0.045, { type: "triangle", gain: 0.085 * energy });
      }
      break;
    }
    case "cash": {
      // A register ka-ching for a big bank: drawer clack, then two bright bells
      // ringing together, then the coin shimmer on top.
      noiseBurst(t, 0.05, { freq: 1800 * vary(0.1), q: 1.4, gain: 0.16 });
      tone(110 * v, t, 0.1, { type: "square", gain: 0.1, glideTo: 70 });
      tone(1567.98 * v, t + 0.03, 0.5, { type: "triangle", gain: 0.2 });
      tone(2093.0 * v, t + 0.045, 0.46, { type: "triangle", gain: 0.15 });
      tone(3135.96 * v, t + 0.06, 0.3, { type: "sine", gain: 0.07 });
      noiseBurst(t + 0.12, 0.22, { freq: 6000 * vary(0.2), q: 0.5, gain: 0.05 });
      break;
    }
    case "win": {
      tone(523.25, t, 0.5, { type: "triangle", gain: 0.22 });
      tone(659.25, t + 0.05, 0.5, { type: "triangle", gain: 0.2 });
      tone(783.99, t + 0.1, 0.55, { type: "triangle", gain: 0.2 });
      tone(1046.5, t + 0.2, 0.5, { type: "triangle", gain: 0.18 });
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Background music — a looping track decoded through the Web Audio API and
// routed to the Music bus (so mute + music volume apply, like the SFX bus).
// We use a decoded AudioBuffer rather than an <audio> element because the same
// AudioContext already drives the SFX, and a buffer source loops seamlessly.
// ---------------------------------------------------------------------------

let musicBuffer: AudioBuffer | null = null;
let musicSource: AudioBufferSourceNode | null = null;
let musicLoading = false;

/** Fetch + decode the track once, then (re)evaluate whether it should play. */
async function loadMusicBuffer(context: AudioContext): Promise<void> {
  if (musicBuffer || musicLoading) return;
  musicLoading = true;
  try {
    const res = await fetch(musicUrl);
    const data = await res.arrayBuffer();
    musicBuffer = await context.decodeAudioData(data);
  } catch {
    /* leave musicBuffer null — music simply won't play */
  } finally {
    musicLoading = false;
  }
  // A failed load waits for another foreground gesture/settings change. Calling
  // updateMusicState after failure immediately retried forever while offline.
  if (musicBuffer) updateMusicState();
}

function startMusic(): void {
  if (!ctx || !musicBus || !musicBuffer || musicSource) return;
  const src = ctx.createBufferSource();
  src.buffer = musicBuffer;
  src.loop = true;
  src.connect(musicBus);
  src.start();
  musicSource = src;
}

function stopMusic(): void {
  if (!musicSource) return;
  try {
    musicSource.stop();
  } catch {
    /* already stopped */
  }
  musicSource.disconnect();
  musicSource = null;
}

/**
 * Keep the looping source in sync with state. Mute is handled by the Music bus
 * gain (so muting/unmuting doesn't restart the track mid-song); we only fully
 * stop when the music volume is zero or there's no AudioContext yet. `ctx`
 * exists only after the first user gesture, satisfying the autoplay policy.
 */
function updateMusicState(): void {
  const want = !!ctx && musicVolume > 0;
  if (!want) {
    stopMusic();
    return;
  }
  // Preserve the looping source's position while the shared context is paused,
  // but never start a freshly decoded track behind another app.
  if (audioHidden()) return;
  if (!musicBuffer) {
    if (ctx) void loadMusicBuffer(ctx);
    return;
  }
  startMusic();
}
