import type { TurnState } from "@greed/core";

/**
 * The pattern worth calling out from the throw lying on the mat.
 *
 * Greed's two big patterns are easy to miss in a row of five dice — a straight
 * looks like an ordinary spread, and three of a kind reads as "some dice" until
 * you count them. The dice themselves already say WHICH ones scored; this says
 * WHY, in the words a table actually uses.
 *
 * Read off the roll's own breakdown rather than re-derived from the faces,
 * because the engine's award is the truth: a fourth matching die does not make
 * a second triple, and a straight is only a straight when it took all five.
 * Straight wins the tie for the simple reason that it cannot coexist with a
 * triple — checked in that order so the rule is stated rather than assumed.
 */
export type RollCall = "straight" | "triple" | null;

export function rollCall(turn: TurnState): RollCall {
  const roll = turn.lastRoll;
  if (!roll) return null;
  if (roll.breakdown.some((b) => b.kind === "straight")) return "straight";
  if (roll.breakdown.some((b) => b.kind === "triple")) return "triple";
  return null;
}
