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

import { DICE_COUNT, FIVE_OF_A_KIND } from "./types.js";
import type { DieValue, LegalActions, TurnState } from "./types.js";

export function createTurn(playerIndex: number): TurnState {
  return {
    playerIndex,
    turnScore: 0,
    dice: new Array<DieValue>(DICE_COUNT).fill(1),
    locked: new Array<boolean>(DICE_COUNT).fill(false),
    rollCount: 0,
    lastRoll: null,
    awards: [],
    carried: 0,
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

/** How many dice are being held. */
function heldCount(turn: TurnState): number {
  return turn.locked.reduce((n, held) => n + (held ? 1 : 0), 0);
}

/**
 * May the player tap this die — to hold it, or to put it back?
 *
 * The single rule for a tap, shared by the engine, the challenge servers that
 * replay a move list, and the tray that draws the dice, so none of the three
 * can offer something the others refuse.
 *
 * Nothing is tappable before the first throw: there is no hand yet to change.
 * Nothing is tappable once the turn is over. And the LAST held die cannot be
 * put back, which is the rule that keeps a throw from being free — see
 * `turnLegalActions`.
 *
 * Note that no legitimate hand is unreachable because of it: to swap which die
 * you are keeping, hold the new one first and release the old one second. Only
 * passing through nothing-held is refused, never any destination.
 */
export function canToggleLock(turn: TurnState, index: number): boolean {
  if (turn.outcome) return false;
  if (!Number.isInteger(index) || index < 0 || index >= turn.dice.length) return false;
  // Nothing on the mat to hold before the first throw.
  if (turn.rollCount === 0) return false;
  // Releasing the last held die would empty the mat; see turnLegalActions.
  if (turn.locked[index] && heldCount(turn) === 1) return false;
  return true;
}

/**
 * Does the throw that has just landed COMPLETE a five of a kind?
 *
 * `thrown` are the dice this throw put on the mat; everything else was being
 * held. A different question from `isFiveOfAKind`, which reads a hand that has
 * already been assembled — this one is asked at the moment the last die lands,
 * before it has been locked.
 *
 * It exists because `scoreRoll` is only ever shown the dice that were thrown,
 * deliberately: a throw is worth what it threw. But five of a kind is the one
 * hand built ACROSS throws, and the die that completes it pays nothing on its
 * own unless the face happens to be a 1 or a 5. So on 2s, 3s, 4s or 6s the
 * throw that made the best hand in the game looks, to the throw's own scoring,
 * exactly like a throw that scored nothing — and the turn busted on it. That is
 * the bug this answers; the mat knows what the throw cannot.
 */
export function throwCompletesFiveOfAKind(turn: TurnState, thrown: number[]): boolean {
  if (!turn.dice.every((d) => d === turn.dice[0])) return false;
  // Everything that was not thrown must have been held, or these five faces
  // are not a hand anyone is holding — just dice lying on the mat.
  const justThrown = new Set(thrown);
  return turn.locked.every((held, i) => held || justThrown.has(i));
}

export function turnLegalActions(turn: TurnState): LegalActions {
  // A finished turn only waits to be advanced.
  if (turn.outcome) return { canRoll: false, canBank: false, canAdvance: true };
  return {
    // There has to be something to throw. Holding all five without clearing them
    // is a position a player can now put themselves in by hand, and rolling an
    // empty cup would score nothing and read as a bust.
    //
    // And once anything HAS been thrown, at least one die has to stay held.
    // Otherwise a throw is free: putting every die back drops the turn to
    // nothing, which sounds like a cost until you notice there was nothing on
    // the mat to lose — so a player who disliked their opening throw could
    // release all five, throw a fresh five, and repeat until the dice came up
    // the way they wanted, at no risk at all. A turn is meant to be one throw
    // and then decisions about it; this is what makes the throw you get the
    // throw you have to build on.
    //
    // A fresh turn is unaffected (nothing thrown, nothing held, the opening
    // throw is always legal), and so is a cleared mat, where every die is held
    // and the next throw is a fresh five.
    canRoll: diceToRoll(turn).length > 0 && (turn.rollCount === 0 || heldCount(turn) > 0),
    // Must roll before there is anything to bank — and unlocking dice can take
    // the turn's points back down to nothing.
    canBank: turn.turnScore > 0,
    canAdvance: false,
  };
}

// ---------------------------------------------------------------------------
// What the dice on the mat are worth
// ---------------------------------------------------------------------------

/**
 * Are all five dice held, showing the same face?
 *
 * Read off the DICE rather than off the awards, because this is the one hand
 * that can be built across several throws: four 1s held from earlier throws and
 * a fifth arriving now is a five of a kind, even though no single throw was one.
 */
export function isFiveOfAKind(turn: TurnState): boolean {
  return turn.locked.every(Boolean) && turn.dice.every((d) => d === turn.dice[0]);
}

/** The awards still standing: every die they used is still held. */
function standing(turn: TurnState) {
  return turn.awards.filter((a) => a.dice.every((i) => turn.locked[i]));
}

/**
 * What the dice currently held are worth.
 *
 * A five of a kind REPLACES what those dice were paying rather than adding to
 * it — three 1s and then two more is 1000, not 1300. It is worth more than any
 * other way of scoring the same five dice, so replacing can never cost a player
 * anything, and the awards underneath are left intact: unlock one die and the
 * hand falls back to what the remaining four were earning on their own.
 */
export function heldScore(turn: TurnState): number {
  if (isFiveOfAKind(turn)) return FIVE_OF_A_KIND;
  return standing(turn).reduce((sum, a) => sum + a.points, 0);
}

/**
 * Is every held die actually paying?
 *
 * The test for hot dice. It used to be "did this throw score with all five",
 * which no longer says the same thing: a player can hold a die that earns
 * nothing, and five dice held with one of them dead is not a cleared mat.
 */
export function allHeldScoring(turn: TurnState): boolean {
  if (isFiveOfAKind(turn)) return true;
  const paying = new Set(standing(turn).flatMap((a) => a.dice));
  return turn.locked.every((locked, i) => locked && paying.has(i));
}

/**
 * Recompute what the turn is worth and whether the mat is clear.
 *
 * Both are derived from the dice and their awards, so anything that changes a
 * lock — a throw, a tap on a die — ends here.
 */
export function refreshTurn(turn: TurnState): void {
  turn.turnScore = turn.carried + heldScore(turn);
  turn.hotDice = allHeldScoring(turn);
}
