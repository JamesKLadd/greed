/**
 * Roll statistics derived by exhaustively enumerating every outcome of throwing
 * k dice (k = 1..5) and scoring it with the real engine. Because it uses the
 * same `scoreRoll` the game uses, the numbers are exact for Greed's rules (not
 * borrowed from generic Farkle). 6^5 = 7776 outcomes, so this is cheap and cached.
 */

import {
  awardsAfterRethrow,
  diceRemaining,
  diceToRoll,
  heldScore,
  refreshTurn,
  scoreRoll,
  throwCompletesHand,
  DICE_COUNT,
} from "@greed/core";
import type { DieValue, TurnState } from "@greed/core";

export interface RollStats {
  /** Probability the throw scores nothing (a bust). */
  bustProb: number;
  /** Expected points from the throw, counting busts as 0. */
  expectedGain: number;
  /** Expected points given the throw scored (excludes busts). */
  expectedGainIfScored: number;
}

const cache = new Map<number, RollStats>();

function enumerate(k: number): RollStats {
  const total = 6 ** k;
  let bust = 0;
  let sum = 0;

  const dice: DieValue[] = new Array<DieValue>(k).fill(1);

  const recurse = (pos: number): void => {
    if (pos === k) {
      const pts = scoreRoll(dice).points;
      if (pts === 0) bust += 1;
      sum += pts;
      return;
    }
    for (let f = 1; f <= 6; f++) {
      dice[pos] = f as DieValue;
      recurse(pos + 1);
    }
  };
  recurse(0);

  const scored = total - bust;
  return {
    bustProb: bust / total,
    expectedGain: sum / total,
    expectedGainIfScored: scored > 0 ? sum / scored : 0,
  };
}

/** Cached roll statistics for throwing `k` dice (k clamped to 1..DICE_COUNT). */
export function rollStats(k: number): RollStats {
  const clamped = Math.max(1, Math.min(DICE_COUNT, k));
  let s = cache.get(clamped);
  if (!s) {
    s = enumerate(clamped);
    cache.set(clamped, s);
  }
  return s;
}

/** One possible non-bust result of a throw: gain some points, end with `kNext` dice. */
export interface RollTransition {
  /** Probability of this (gain, kNext) outcome among all throws of k dice. */
  p: number;
  /** Change in the turn's points, including replacement whole-mat awards. */
  gain: number;
  /** Dice available next: fresh DICE_COUNT on hot dice, or 0 when only banking is legal. */
  kNext: number;
}

/** Full transition model for a k-dice throw: bust chance + the scoring outcomes. */
export interface RollModel {
  bustProb: number;
  transitions: RollTransition[];
}

const modelCache = new Map<number, RollModel>();

function buildModel(k: number): RollModel {
  const total = 6 ** k;
  let bust = 0;
  const agg = new Map<string, RollTransition>(); // key: `${gain}|${kNext}`

  const dice: DieValue[] = new Array<DieValue>(k).fill(1);
  const recurse = (pos: number): void => {
    if (pos === k) {
      const res = scoreRoll(dice);
      if (res.points === 0) {
        bust += 1;
        return;
      }
      const scored = res.scoringMask.reduce((c, m) => c + (m ? 1 : 0), 0);
      const remaining = k - scored;
      const kNext = remaining === 0 ? DICE_COUNT : remaining; // all scored => hot dice
      const key = `${res.points}|${kNext}`;
      const existing = agg.get(key);
      if (existing) existing.p += 1;
      else agg.set(key, { p: 1, gain: res.points, kNext });
      return;
    }
    for (let f = 1; f <= 6; f++) {
      dice[pos] = f as DieValue;
      recurse(pos + 1);
    }
  };
  recurse(0);

  const transitions = [...agg.values()].map((t) => ({ ...t, p: t.p / total }));
  return { bustProb: bust / total, transitions };
}

/** Cached transition model for throwing `k` dice (k clamped to 1..DICE_COUNT). */
export function rollModel(k: number): RollModel {
  const clamped = Math.max(1, Math.min(DICE_COUNT, k));
  let m = modelCache.get(clamped);
  if (!m) {
    m = buildModel(clamped);
    modelCache.set(clamped, m);
  }
  return m;
}

const turnModelCache = new Map<string, RollModel>();

/**
 * Exact outcomes of the NEXT throw with the visible held dice, automatically
 * holding its scoring dice as the engine does. Whole-mat hands replace the
 * held awards rather than simply adding what the thrown dice paid alone.
 *
 * This is not an exact full-turn policy: a caller may still use the smaller
 * dice-count model to estimate later throws. Neither model reads the RNG.
 */
export function turnRollModel(turn: TurnState): RollModel {
  const thrown = diceToRoll(turn);
  const k = thrown.length;
  if (turn.hotDice || turn.rollCount === 0) return rollModel(k);

  const held = turn.locked.flatMap((locked, i) => (locked ? [turn.dice[i]] : []));
  const pointsHeld = heldScore(turn);
  // A disconnected human can leave non-paying dice held. Those dice stop a mat
  // from becoming hot even when every new die scores, unlike automatic holds.
  const allHeldPay = turn.locked.every((locked, i) => {
    if (!locked) return true;
    const lockedWithoutDie = [...turn.locked];
    lockedWithoutDie[i] = false;
    return heldScore({ ...turn, locked: lockedWithoutDie }) < pointsHeld;
  });
  const key = `${held.sort().join("")}|${pointsHeld}|${k}|${Number(allHeldPay)}`;
  const cached = turnModelCache.get(key);
  if (cached) return cached;

  const total = 6 ** k;
  let bust = 0;
  const agg = new Map<string, RollTransition>();
  const dice = new Array<DieValue>(k).fill(1);
  const recurse = (pos: number): void => {
    if (pos !== k) {
      for (let f = 1; f <= 6; f++) {
        dice[pos] = f as DieValue;
        recurse(pos + 1);
      }
      return;
    }

    const next: TurnState = { ...turn, dice: [...turn.dice], locked: [...turn.locked] };
    thrown.forEach((index, i) => (next.dice[index] = dice[i]));
    const result = scoreRoll(dice);
    const madeHand = throwCompletesHand(next, thrown);
    if (result.points === 0 && !madeHand) {
      bust++;
      return;
    }

    next.awards = awardsAfterRethrow(next, thrown);
    for (const award of result.breakdown) {
      next.awards.push({
        kind: award.kind,
        face: award.face,
        dice: award.indices.map((i) => thrown[i]),
        points: award.points,
      });
    }
    thrown.forEach((index, i) => {
      if (result.scoringMask[i] || madeHand) next.locked[index] = true;
    });
    refreshTurn(next);
    const gain = heldScore(next) - pointsHeld;
    const kNext = diceRemaining(next);
    const outcomeKey = `${gain}|${kNext}`;
    const existing = agg.get(outcomeKey);
    if (existing) existing.p++;
    else agg.set(outcomeKey, { p: 1, gain, kNext });
  };
  recurse(0);

  const model = {
    bustProb: bust / total,
    transitions: [...agg.values()].map((t) => ({ ...t, p: t.p / total })),
  };
  turnModelCache.set(key, model);
  return model;
}
