import { useEffect, useRef } from "react";
import type { GameState } from "@greed/core";
import { play } from "./sfx.js";
import { BIG_BANK, STREAK_ROLLS, streakStep } from "./flourishes.js";

/**
 * Plays the dice tumbling for the length of a throw.
 *
 * Separate from useGameSounds because it is not driven by the log: a roll only
 * reaches the log when it LANDS, which is the whole point — the result is held
 * back until the animation finishes. The time the dice are actually in the air
 * is animation state, so it is keyed on `isRolling` instead, and fires on the
 * edge where a throw begins.
 */
export function useRollSound(isRolling: boolean): void {
  const wasRolling = useRef(isRolling);

  useEffect(() => {
    if (isRolling && !wasRolling.current) play("tumble");
    wasRolling.current = isRolling;
  }, [isRolling]);
}

/**
 * Plays a sound effect for each fresh event appended to the game log.
 * Shared by offline and online play — both drive the same GameState log.
 */
export function useGameSounds(state: GameState | null | undefined): void {
  const seen = useRef(0);
  // Rolls in the turn being read. Counted from the log rather than taken from
  // turn.rollCount because a batch of events (a reconnect replaying a burst of
  // state) is walked one at a time here, and each roll in it needs its own
  // escalation step.
  const rolls = useRef(0);

  useEffect(() => {
    if (!state) return;
    const log = state.log;
    // A shorter log than last time means a new game (restart/rematch) — resync.
    if (log.length < seen.current) {
      seen.current = 0;
      rolls.current = 0;
    }

    for (const e of log.slice(seen.current)) {
      switch (e.type) {
        case "roll": {
          rolls.current += 1;
          // A scoring roll gets the dice clatter; a bust roll is covered by the
          // bust cue below.
          if (e.result.points > 0) {
            play("roll");
            // Four rolls deep and still going — mark it, and keep marking it
            // higher for every roll after that.
            if (rolls.current >= STREAK_ROLLS) {
              play("streak", { step: streakStep(rolls.current) });
            }
          }
          break;
        }
        case "bust":
          // Losing nothing is a different feeling from losing a pile: a turn
          // that dies on its opening roll gets sympathy instead of the buzzer.
          play(e.lostPoints === 0 ? "awww" : "bust");
          rolls.current = 0;
          break;
        case "bank":
          play(e.gained >= BIG_BANK ? "cash" : "bank");
          rolls.current = 0;
          break;
        case "skip":
          rolls.current = 0;
          break;
        case "hot-dice":
          play("hotDice");
          break;
        case "endgame-triggered":
          play("endgame");
          break;
        case "sudden-death":
          play("suddenDeath");
          break;
        case "auto-win":
        case "game-over":
          play("win");
          break;
        default:
          break;
      }
    }
    seen.current = log.length;
  }, [state]);
}
