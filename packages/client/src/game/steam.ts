/**
 * Steam achievement bridge.
 *
 * The game's achievements live in `profile.ts` (local, id-keyed). This module
 * mirrors an unlock into Steam when the app is running inside the Tauri desktop
 * shell WITH the native `steam` feature enabled; on the web build (or a desktop
 * build without the feature) every call is a silent no-op.
 *
 * Nothing here imports the Tauri API as a hard dependency: we detect the v2
 * runtime via the `__TAURI_INTERNALS__` global it injects and call through it,
 * so the web bundle stays clean and the desktop build works whether or not the
 * Steam feature was compiled in (the Rust command is a no-op stub when it wasn't).
 */

/** Local achievement id -> Steam achievement API name (as configured in Steamworks). */
export const STEAM_ACHIEVEMENT_IDS: Record<string, string> = {
  "first-win": "ACH_FIRST_WIN",
  "hot-hand": "ACH_HOT_HAND",
  "big-turn": "ACH_BIG_TURN",
  flawless: "ACH_FLAWLESS",
  "high-roller": "ACH_HIGH_ROLLER",
  "hat-trick": "ACH_HAT_TRICK",
  "giant-slayer": "ACH_GIANT_SLAYER",
  veteran: "ACH_VETERAN",
  inferno: "ACH_INFERNO",
  moonshot: "ACH_MOONSHOT",
  landslide: "ACH_LANDSLIDE",
  "on-fire": "ACH_ON_FIRE",
  dedicated: "ACH_DEDICATED",
  champion: "ACH_CHAMPION",
  "full-table": "ACH_FULL_TABLE",
  marathon: "ACH_MARATHON",
  untouchable: "ACH_UNTOUCHABLE",
  "big-banker": "ACH_BIG_BANKER",
  comeback: "ACH_COMEBACK",
  "chain-reaction": "ACH_CHAIN_REACTION",
  "tidal-wave": "ACH_TIDAL_WAVE",
  unstoppable: "ACH_UNSTOPPABLE",
  blitz: "ACH_BLITZ",
  "daily-elite": "ACH_DAILY_ELITE",
};

interface TauriInternals {
  invoke?: (cmd: string, payload?: Record<string, unknown>) => Promise<unknown>;
}

function tauriInvoke(cmd: string, payload?: Record<string, unknown>): Promise<unknown> | null {
  if (typeof window === "undefined") return null;
  const internals = (window as unknown as { __TAURI_INTERNALS__?: TauriInternals })
    .__TAURI_INTERNALS__;
  if (!internals?.invoke) return null;
  try {
    return internals.invoke(cmd, payload ?? {});
  } catch {
    return null;
  }
}

/** True when running inside the Tauri desktop shell (Steam bridge is possible). */
export function isDesktopShell(): boolean {
  return (
    typeof window !== "undefined" &&
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ != null
  );
}

/** Unlock one Steam achievement by local id. Silent no-op off-desktop / unknown id. */
export async function unlockSteamAchievement(id: string): Promise<void> {
  const apiName = STEAM_ACHIEVEMENT_IDS[id];
  if (!apiName) return;
  const call = tauriInvoke("steam_unlock_achievement", { achievement: apiName });
  if (!call) return;
  try {
    await call;
  } catch {
    /* Steam not running / feature off — ignore, local progress already saved. */
  }
}

/** Mirror a batch of freshly-unlocked achievement ids into Steam. */
export function syncSteamAchievements(ids: string[]): void {
  if (!isDesktopShell()) return;
  for (const id of ids) void unlockSteamAchievement(id);
}
