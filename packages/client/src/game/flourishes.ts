/**
 * Celebration cues derived from game state — the fire on a long turn and the
 * dollar signs on a big banker.
 *
 * These live here, and are derived from the state rather than tracked as their
 * own timers, for one reason: online play has no client-authoritative anything.
 * Every client (and every spectator) renders from the same broadcast GameState,
 * so a decoration computed from that state appears identically on all of them
 * with no extra protocol, no events to miss, and nothing to resynchronise after
 * a reconnect.
 */

import type { GameState, TurnState } from "@greed/core";

/** Rolls in a single turn before the streak cue starts. */
export const STREAK_ROLLS = 4;

/** A banked turn worth at least this much earns the cash cue. */
export const BIG_BANK = 1000;

/** Most flames shown at once, so a monster turn doesn't crowd out the number. */
const MAX_FLAMES = 5;

/**
 * How hot the current turn is: 0 below the threshold, then one flame per roll
 * from the 4th onward (capped). Reads straight off `rollCount`, which the engine
 * holds for the whole turn and clears on the next one — so the fire naturally
 * persists until the turn ends and needs no separate lifetime of its own.
 */
export function streakFlames(turn: TurnState): number {
  if (turn.rollCount < STREAK_ROLLS) return 0;
  return Math.min(turn.rollCount - STREAK_ROLLS + 1, MAX_FLAMES);
}

/**
 * Escalation step for the streak sound: 0 on the 4th roll, 1 on the 5th, and so
 * on. Separate from the flame count because the audio keeps climbing past the
 * point where adding another emoji would just be clutter.
 */
export function streakStep(rollCount: number): number {
  return Math.max(0, rollCount - STREAK_ROLLS);
}

/**
 * Ids of players wearing the big-bank badge: those whose most recent finished
 * turn was a bank of BIG_BANK or more, and who have not started another turn
 * yet.
 *
 * Excluding the active seat is what implements "until their next turn" — the
 * badge is a lap of honour between turns, so it comes off the moment they are
 * back on the clock.
 */
export function bigBankers(state: GameState): Set<string> {
  const badged = new Set<string>();
  const decided = new Set<string>();

  // Backwards: the first turn-ending event found for a player is their latest.
  for (let i = state.log.length - 1; i >= 0; i--) {
    const e = state.log[i];
    if (e.type !== "bank" && e.type !== "bust" && e.type !== "skip") continue;
    if (decided.has(e.playerId)) continue;
    decided.add(e.playerId);
    if (e.type === "bank" && e.gained >= BIG_BANK) badged.add(e.playerId);
  }

  // Their next turn has begun (or the game is over and the table is settling).
  if (state.phase !== "game-over") {
    badged.delete(state.players[state.turn.playerIndex]?.id ?? "");
  }
  return badged;
}
