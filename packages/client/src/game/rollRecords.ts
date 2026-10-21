import { cleanRollGame, type RollGame } from "@greed/bots";
import { ApiError, getToken } from "../net/auth.js";
import { uploadLocalGame } from "../net/rollStats.js";

/**
 * Finished solo games' throws, on this device.
 *
 * For a guest this IS their roll data — there is no account to send it to.
 * For a signed-in player it is the queue: a game waits here until the server
 * has it, so one finished offline, or while the server was asleep or still
 * deploying, is sent on the next chance rather than lost. Signing in sends a
 * guest's games to the new account, the way their other progress goes with
 * them; signing out clears the device, as it clears the profile.
 *
 * Kept for ROLL_DATA_DAYS, like everything else roll data.
 */

const STORAGE_KEY = "greed:roll-games";

interface Entry {
  /** Names the upload, so sending it twice still files it once. */
  id: string;
  game: RollGame;
}

function load(): Entry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    // Through the same gate the server uses: a hand-edited entry, or one past
    // the window, is dropped rather than shown or sent.
    return raw.flatMap((e: Partial<Entry> | null) => {
      const game = e && typeof e.id === "string" ? cleanRollGame(e.game, "local") : null;
      return game && e?.id ? [{ id: e.id, game }] : [];
    });
  } catch {
    return [];
  }
}

function save(entries: Entry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* storage full or blocked: the in-memory game still uploads if it can */
  }
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

/** A solo game just finished: keep it, and send it on if there is an account. */
export function recordLocalRollGame(game: RollGame): void {
  save([...load(), { id: newId(), game }]);
  void flushRollUploads();
}

let flushing: Promise<void> | null = null;

/**
 * Send every game waiting on this device to the signed-in account. Stops at
 * the first failure that a retry could fix (offline, a sleeping server, one
 * that doesn't know the endpoint yet) and keeps what is left for next time.
 */
export function flushRollUploads(): Promise<void> {
  if (!getToken()) return Promise.resolve();
  // Cleared in a `.finally` rather than inside the send itself: with nothing
  // queued the send finishes without ever awaiting, so a reset written inside
  // it ran BEFORE this assignment — and left a finished promise here that made
  // every later flush a silent no-op.
  flushing ??= sendQueued().finally(() => {
    flushing = null;
  });
  return flushing;
}

async function sendQueued(): Promise<void> {
  for (const entry of load()) {
    try {
      await uploadLocalGame(entry.id, entry.game);
    } catch (err) {
      // Only a refusal is dropped — the server read it and said no, and it
      // always will. Anything else (offline, asleep, an older server with no
      // such endpoint) is worth trying again later.
      if (!(err instanceof ApiError && err.status === 400)) return;
    }
    save(load().filter((e) => e.id !== entry.id));
  }
}

/** A guest's own solo games, newest last. */
export function deviceRollGames(): RollGame[] {
  return load().map((e) => e.game);
}

export function clearDeviceRollGames(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
