/**
 * Turn-level helpers. A turn is a small state machine:
 *
 *   fresh -> ROLL -> (score) -> awaitingDecision -> ROLL again | BANK
 *                     \-> (0 points) -> busted (turn forfeited)
 *
 * All 5 dice scored ("hot dice") clears the locks so the next ROLL throws a
 * fresh 5, carrying the turn score. These helpers are pure; game.ts threads the
 * RNG and applies scoring.
 */

import { DICE_COUNT } from "./types.js";
import type { DieValue, LegalActions, TurnState } from "./types.js";

export function createTurn(playerIndex: number): TurnState {
  return {
    playerIndex,
    turnScore: 0,
    dice: new Array<DieValue>(DICE_COUNT).fill(1),
    locked: new Array<boolean>(DICE_COUNT).fill(false),
    rollCount: 0,
    lastRoll: null,
    busted: false,
    hotDice: false,
    awaitingDecision: false,
    outcome: null,
  };
}

/** Indices of the dice that the next ROLL will throw. */
export function diceToRoll(turn: TurnState): number[] {
  if (turn.hotDice) {
    return turn.dice.map((_, i) => i); // fresh 5
  }
  const out: number[] = [];
  for (let i = 0; i < turn.dice.length; i++) {
    if (!turn.locked[i]) out.push(i);
  }
  return out;
}

/** How many dice the next ROLL will throw. */
export function diceRemaining(turn: TurnState): number {
  return diceToRoll(turn).length;
}

export function turnLegalActions(turn: TurnState): LegalActions {
  // A finished turn only waits to be advanced.
  if (turn.outcome) return { canRoll: false, canBank: false, canAdvance: true };
  // Must roll before there is anything to bank.
  return { canRoll: true, canBank: turn.turnScore > 0, canAdvance: false };
}
