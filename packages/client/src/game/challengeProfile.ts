import { RUN_PLAYER_ID } from "@greed/core";
import {
  awardAchievement,
  loadProfile,
  raiseBestTurn,
  summarize,
  TIDAL_WAVE_POINTS,
  type Achievement,
} from "./profile.js";
import type { RunView } from "./useChallengeRun.js";

/**
 * The server's completed position already verifies every bank in this attempt.
 * Use it before refreshing the board: a weaker weekly attempt can still contain
 * a career-best turn, and a failed board read must not hide that turn locally.
 */
export function recordChallengeBestTurn(final: RunView | null): boolean {
  return final?.complete ? raiseBestTurn(summarize(final.state, RUN_PLAYER_ID).bestTurn) : false;
}

/**
 * A banked challenge turn earns Tidal Wave just like a bank in a normal game.
 * The local record includes weaker weekly attempts; the server best also lets
 * a completed run claim its badge on a later visit or after a lost final reply.
 */
export function claimChallengeTurnAchievement(bestTurn: number): Achievement | null {
  return Math.max(bestTurn, loadProfile().bestTurn) >= TIDAL_WAVE_POINTS
    ? awardAchievement("tidal-wave")
    : null;
}
