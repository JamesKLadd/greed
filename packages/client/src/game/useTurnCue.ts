import { useEffect, useRef } from "react";
import type { GameState } from "@greed/core";
import { play } from "./sfx.js";

/**
 * Play a chime when the turn advances to the local player's seat (`active`).
 * Keyed on the turn's player index so it fires once at the start of a turn, not
 * on every roll; stays silent at game-over and whenever `active` is false (e.g.
 * a bot's turn, an opponent's turn online, or while spectating).
 */
export function useTurnCue(state: GameState, active: boolean): void {
  const prevIndex = useRef<number | null>(null);
  useEffect(() => {
    const idx = state.turn.playerIndex;
    if (idx === prevIndex.current) return;
    prevIndex.current = idx;
    if (active && state.phase !== "game-over") play("yourTurn");
  }, [state.turn.playerIndex, state.phase, active]);
}
