/**
 * Sound for Greed — everything is synthesized live with the Web Audio API, so
 * there are NO binary audio assets to ship. A shared AudioContext is created
 * lazily and resumed on the first user gesture (browsers suspend audio until
 * then). Two buses — SFX and Music — have independent volumes; a single mute
 * (persisted) silences both.
 */

const MUTE_KEY = "greed:muted";

let ctx: AudioContext | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;

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
  return muted ? 0 : sfxVolume;
}
function musicLevel(): number {
  return muted ? 0 : musicVolume;
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
  if (typeof window === "undefined") return null;
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
  if (ctx.state === "suspended") void ctx.resume();
  updateMusicState();
  return ctx;
}

/**
 * Wire one-time listeners that resume/create the AudioContext on the first user
 * interaction (autoplay policy), and start the ambient music. Call once at start.
 */
export function primeAudioOnFirstGesture(): void {
  if (typeof window === "undefined") return;
  const handler = () => {
    ensureContext();
    window.removeEventListener("pointerdown", handler);
    window.removeEventListener("keydown", handler);
  };
  window.addEventListener("pointerdown", handler, { once: true });
  window.addEventListener("keydown", handler, { once: true });
}

/** Play a soft click on any button press across the app. Call once at startup. */
export function installUiClicks(): void {
  if (typeof window === "undefined") return;
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
  src.start(start);
  src.stop(start + dur + 0.02);
}

/** Small random pitch wobble so repeated cues aren't identical. */
function vary(amount = 0.03): number {
  return 1 + (Math.random() - 0.5) * amount;
}

function uiClick(): void {
  if (muted || sfxVolume <= 0) return;
  const c = ensureContext();
  if (!c) return;
  noiseBurst(c.currentTime, 0.02, { freq: 2600 * vary(0.15), q: 1.2, gain: 0.06 });
}

type Sound = "roll" | "bank" | "bust" | "hotDice" | "endgame" | "suddenDeath" | "win" | "click";

export function play(sound: Sound): void {
  if (muted) return;
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
// Ambient background music (routed to the Music bus)
// ---------------------------------------------------------------------------

// A slow, lounge-y ii–V–I-ish loop. Each chord = a bass note + a soft triad.
const CHORDS: { bass: number; notes: number[] }[] = [
  { bass: 130.81, notes: [261.63, 329.63, 392.0] }, // C major
  { bass: 110.0, notes: [261.63, 329.63, 392.0] }, // A minor 7
  { bass: 146.83, notes: [293.66, 349.23, 440.0] }, // D minor 7
  { bass: 98.0, notes: [246.94, 293.66, 349.23] }, // G7
];
const CHORD_DUR = 3.4;
const LOOKAHEAD = 0.35;

let musicPlaying = false;
let musicTimer: number | null = null;
let nextChordTime = 0;
let progIndex = 0;

function padNote(
  freq: number,
  start: number,
  dur: number,
  gain: number,
  type: OscillatorType,
): void {
  if (!ctx || !musicBus) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const atk = 0.6;
  const rel = 1.2;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + atk);
  g.gain.setValueAtTime(gain, Math.max(start + atk, start + dur - rel));
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g).connect(musicBus);
  osc.start(start);
  osc.stop(start + dur + 0.1);
}

function scheduleChord(time: number, chord: { bass: number; notes: number[] }): void {
  padNote(chord.bass, time, CHORD_DUR * 0.98, 0.1, "sine");
  padNote(chord.bass * 2, time, CHORD_DUR * 0.9, 0.04, "sine");
  for (const f of chord.notes) padNote(f, time, CHORD_DUR * 0.9, 0.04, "triangle");
  // A gentle high shimmer over the top note.
  const top = chord.notes[chord.notes.length - 1] * 2;
  padNote(top, time + 0.25, CHORD_DUR * 0.55, 0.018, "sine");
}

function scheduler(): void {
  if (!ctx) return;
  while (nextChordTime < ctx.currentTime + LOOKAHEAD) {
    scheduleChord(nextChordTime, CHORDS[progIndex % CHORDS.length]);
    progIndex += 1;
    nextChordTime += CHORD_DUR;
  }
}

function updateMusicState(): void {
  const want = !!ctx && !muted && musicVolume > 0;
  if (want && !musicPlaying) {
    musicPlaying = true;
    nextChordTime = (ctx as AudioContext).currentTime + 0.15;
    scheduler();
    musicTimer = window.setInterval(scheduler, 60);
  } else if (!want && musicPlaying) {
    musicPlaying = false;
    if (musicTimer !== null) window.clearInterval(musicTimer);
    musicTimer = null;
  }
}
