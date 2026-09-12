import { heldHand } from "@greed/core";
import type { TurnState } from "@greed/core";

/**
 * The pattern worth calling out from the throw lying on the mat.
 *
 * Greed's two big patterns are easy to miss in a row of five dice — a straight
 * looks like an ordinary spread, and three of a kind reads as "some dice" until
 * you count them. The dice themselves already say WHICH ones scored; this says
 * WHY, in the words a table actually uses.
 *
 * Read off the roll's own breakdown rather than re-derived from the faces on
 * the mat, because the breakdown describes THIS throw: dice locked by an
 * earlier throw in the same turn are still lying there, and three of them
 * matching is not something the player just did. Straight is checked first for
 * the simple reason that it cannot coexist with a triple — stated rather than
 * assumed.
 */
export type RollCall = "five" | "straight" | "triple" | null;

export function rollCall(turn: TurnState): RollCall {
  const roll = turn.lastRoll;
  if (!roll) return null;
  // Read off the MAT, not the throw: five of a kind and a straight are both
  // built up over several throws, so the throw that completes one may be a
  // single die. Either outranks a triple, and cannot coexist with one anyway.
  const hand = heldHand(turn);
  if (hand) return hand.kind === "five-of-a-kind" ? "five" : "straight";
  // A straight that has been thrown but since broken up by hand still gets its
  // call: the player did roll it.
  if (roll.breakdown.some((b) => b.kind === "straight")) return "straight";

  // Three of a kind is three matching dice in the throw — whatever the engine
  // decided to PAY for them. Trusting the award alone called every triple
  // except three 1s, which is the loudest one at the table: 1s are scored as
  // three separate hundreds because 300 beats the 100 a triple of 1s pays, so
  // no "triple" is ever awarded for them. Counting the dice each face consumed
  // sees it — and sees four and five of a kind, which arrive as a triple plus
  // leftovers rather than as an entry of their own.
  const diceByFace = new Map<number, number>();
  for (const entry of roll.breakdown) {
    if (entry.face == null) continue;
    diceByFace.set(entry.face, (diceByFace.get(entry.face) ?? 0) + entry.diceUsed);
  }
  for (const dice of diceByFace.values()) if (dice >= 3) return "triple";
  return null;
}
