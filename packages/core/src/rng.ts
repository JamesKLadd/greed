/**
 * Deterministic, seedable PRNG (mulberry32).
 *
 * The RNG state is a single 32-bit integer so it serializes trivially inside
 * GameState. Every random draw returns both the value and the *next* state, so
 * callers thread state explicitly and never mutate hidden globals. This keeps
 * games reproducible (tests) and makes a future authoritative server tamper-proof.
 */

import type { DieValue } from "./types.js";

/** Advance the state and return a float in [0, 1) plus the next state. */
export function nextFloat(state: number): { value: number; state: number } {
  let t = (state + 0x6d2b79f5) | 0;
  const next = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: next };
}

/** Return an integer in [0, max) plus the next state. */
export function nextInt(state: number, max: number): { value: number; state: number } {
  const r = nextFloat(state);
  return { value: Math.floor(r.value * max), state: r.state };
}

/** Roll `count` dice (values 1..6). Returns the dice and the advanced state. */
export function rollDice(state: number, count: number): { dice: DieValue[]; state: number } {
  const dice: DieValue[] = [];
  let s = state;
  for (let i = 0; i < count; i++) {
    const r = nextInt(s, 6);
    s = r.state;
    dice.push((r.value + 1) as DieValue);
  }
  return { dice, state: s };
}

/** Derive a well-mixed 32-bit seed from an arbitrary number (e.g. Date.now()). */
export function makeSeed(input: number): number {
  let h = input | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = (h ^ (h >>> 16)) >>> 0;
  return h;
}
