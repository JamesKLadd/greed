import type { GameState, TurnState } from "@greed/core";

/** The engine retains the resolved hand for readable bank/bust feedback.
 * Those points are no longer available to bank or lose. */
export function pointsAtRisk(state: GameState): number {
  return state.phase === "game-over" || state.turn.outcome ? 0 : state.turn.turnScore;
}

/** Hot dice stay a held hand until the fresh five actually start rolling.
 * Holding markers and pressed state must describe the same engine selection. */
export function shownHeldDie(turn: TurnState, index: number, isRolling: boolean): boolean {
  return Boolean(turn.locked[index]) && !(turn.hotDice && isRolling);
}
