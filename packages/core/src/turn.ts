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

import { scoreRoll } from "./scoring.js";
import { DICE_COUNT } from "./types.js";
import type { DieValue, LegalActions, ScoreBreakdownEntry, TurnState } from "./types.js";

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
 * Does the throw that has just landed COMPLETE a whole-mat hand?
 *
 * `thrown` are the dice this throw put on the mat; everything else was being
 * held. A different question from `heldHand`, which reads a hand that has
 * already been assembled — this one is asked at the moment the last die lands,
 * before it has been locked.
 *
 * It exists because `scoreRoll` is only ever shown the dice that were thrown,
 * deliberately: a throw is worth what it threw. But a whole-mat hand is built
 * ACROSS throws, and the die that completes it often pays nothing on its own —
 * any 2, 3, 4 or 6. So the throw that made the best hand in the game looks, to
 * the throw's own scoring, exactly like a throw that scored nothing, and the
 * turn busted on it. That is the bug this answers; the mat knows what the
 * throw cannot.
 *
 * It first showed up on five of a kind (four 2s held, the fifth thrown) and
 * was fixed there alone. The straight has exactly the same shape — 2,3,4,5
 * held and a 6 thrown — and was still busting, so the question is now asked of
 * the hand rather than of one hand.
 */
export function throwCompletesHand(turn: TurnState, thrown: number[]): boolean {
  if (!fullHand(turn.dice)) return false;
  // Everything that was not thrown must have been held, or these five faces
  // are not a hand anyone is holding — just dice lying on the mat.
  const justThrown = new Set(thrown);
  return turn.locked.every((held, i) => held || justThrown.has(i));
}

/**
 * Is this die the only one being held?
 *
 * The one refusal a player can do something about: releasing it would empty the
 * mat, which the rules forbid because it would make the next throw free. Asked
 * by the tray so the die can say WHY it will not move, instead of being drawn
 * as unavailable and leaving the player to guess.
 */
export function isLastHeldDie(turn: TurnState, index: number): boolean {
  return (
    turn.rollCount > 0 && !turn.outcome && Boolean(turn.locked[index]) && heldCount(turn) === 1
  );
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
 * The hand these five faces make, if they make one at all.
 *
 * Five of a kind and a straight are the two hands that take all five dice at
 * once, and taking all five is exactly what lets them be assembled over
 * several throws: every other award is a face or three paying within the throw
 * that produced them.
 *
 * Asked of `scoreRoll` rather than re-tested here, because a second definition
 * of "that is a straight" is a second definition to keep in step — and the
 * first one already ships in the rules screen and the bots' roll model. A hand
 * is what scoreRoll would pay for these five dice thrown together, and nothing
 * else: one award, covering the lot.
 */
function fullHand(dice: DieValue[]): ScoreBreakdownEntry | null {
  if (dice.length !== DICE_COUNT) return null;
  const { breakdown } = scoreRoll(dice);
  if (breakdown.length !== 1) return null;
  const only = breakdown[0];
  return only.kind === "five-of-a-kind" || only.kind === "straight" ? only : null;
}

/**
 * The whole-mat hand currently being held, if there is one.
 *
 * Read off the DICE rather than off the awards, because these are the hands
 * that can be built across several throws: four 1s held from earlier throws
 * and a fifth arriving now is a five of a kind, and 2,3,4,5 held with a 1
 * arriving now is a straight, though no single throw was either.
 */
export function heldHand(turn: TurnState): ScoreBreakdownEntry | null {
  return turn.locked.every(Boolean) ? fullHand(turn.dice) : null;
}

/** The awards still standing: every die they used is still held. */
function standing(turn: TurnState) {
  return turn.awards.filter((a) => a.dice.every((i) => turn.locked[i]));
}

/**
 * What the dice currently held are worth.
 *
 * A whole-mat hand REPLACES what those dice were paying rather than adding to
 * it — three 1s and then two more is 1000, not 1300; a 1 and a 5 inside a
 * straight is 500, not 650. Either hand is worth more than any other way of
 * scoring the same five dice (the best a straight can be worth otherwise is
 * the 150 of 1,2,3,4,5), so replacing can never cost a player anything, and
 * the awards underneath are left intact: unlock one die and the hand falls
 * back to what the remaining four were earning on their own.
 */
export function heldScore(turn: TurnState): number {
  const hand = heldHand(turn);
  if (hand) return hand.points;
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
  if (heldHand(turn)) return true;
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
