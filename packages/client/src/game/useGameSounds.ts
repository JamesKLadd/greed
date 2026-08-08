import { useEffect, useRef } from "react";
import type { GameState } from "@greed/core";
import { play } from "./sfx.js";

/**
 * Plays a sound effect for each fresh event appended to the game log.
 * Shared by offline and online play — both drive the same GameState log.
 */
export function useGameSounds(state: GameState | null | undefined): void {
  const seen = useRef(0);

  useEffect(() => {
    if (!state) return;
    const log = state.log;
    // A shorter log than last time means a new game (restart/rematch) — resync.
    if (log.length < seen.current) seen.current = 0;

    for (const e of log.slice(seen.current)) {
      switch (e.type) {
        case "roll":
          // A scoring roll gets the dice clatter; a bust roll is covered by "bust".
          if (e.result.points > 0) play("roll");
          break;
        case "bust":
          play("bust");
          break;
        case "bank":
          play("bank");
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
