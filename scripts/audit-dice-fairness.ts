/**
 * Reproducible audit of the production dice/scoring code, without a database.
 *
 *   node --import tsx scripts/audit-dice-fairness.ts --samples 5000000 --engine-runs 50000
 *   node --import tsx scripts/audit-dice-fairness.ts --engine-runs 50000 --strategy roll-until-bust
 *   node --import tsx scripts/audit-dice-fairness.ts --samples 5000000 --crypto
 *
 * Default seeds are SHA-256 counter hashes with the fixed salt below. That
 * sampler is independent of the game's Mulberry32 and covers the same 31-bit
 * seed range used by the challenge servers. --crypto samples with fresh entropy.
 * Sampling checks distributions, not cryptographic unpredictability. The exact
 * enumeration checks every outcome and uses a separate, rules-based bust oracle.
 */
import { createHash, randomFillSync } from "node:crypto";
import { applyAction, getLegalActions } from "../packages/core/src/game.js";
import { nextFloat, rollDice } from "../packages/core/src/rng.js";
import { createRunGame } from "../packages/core/src/run.js";
import { scoreRoll } from "../packages/core/src/scoring.js";
import { diceToRoll } from "../packages/core/src/turn.js";
import type { DieValue } from "../packages/core/src/types.js";

const SAMPLE_SALT = "Greed dice fairness audit v1 / 2026-10-08";
const args = process.argv.slice(2);
let samples = 1_000_000;
let requestedEngineRuns = 10_000;
let useCrypto = false;
let strategy = "bank500";
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--crypto") useCrypto = true;
  else if (args[i] === "--samples") samples = Number(args[++i]);
  else if (args[i] === "--engine-runs") requestedEngineRuns = Number(args[++i]);
  else if (args[i] === "--strategy") strategy = args[++i];
  else throw new Error(`Unknown argument: ${args[i]}`);
}
if (!Number.isSafeInteger(samples) || samples < 1 || samples > 20_000_000) {
  throw new Error("--samples must be an integer from 1 to 20000000");
}
if (
  !Number.isSafeInteger(requestedEngineRuns) ||
  requestedEngineRuns < 1 ||
  requestedEngineRuns > 100_000
) {
  throw new Error("--engine-runs must be an integer from 1 to 100000");
}
if (strategy !== "bank500" && strategy !== "roll-until-bust") {
  throw new Error("--strategy must be bank500 or roll-until-bust");
}

function isBust(dice: DieValue[]): boolean {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) {
    if (d === 1 || d === 5) return false;
    if (++counts[d] >= 3) return false;
  }
  return true;
}

// All dice score when they are singles, a triple plus scoring singles, a
// straight or five of a kind. Verified against scoreRoll for all 7776 outcomes.
function isHot(dice: DieValue[]): boolean {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) counts[d]++;
  if (counts.some((n) => n === 5)) return true;
  if (
    counts[2] === 1 &&
    counts[3] === 1 &&
    counts[4] === 1 &&
    counts[5] === 1 &&
    (counts[1] === 1 || counts[6] === 1)
  ) {
    return true;
  }
  return [2, 3, 4, 6].every((d) => counts[d] === 0 || counts[d] === 3);
}

function exact(count: number) {
  let busts = 0;
  let hot = 0;
  let points = 0;
  for (let outcome = 0; outcome < 6 ** count; outcome++) {
    let remaining = outcome;
    const dice: DieValue[] = [];
    for (let i = 0; i < count; i++) {
      dice.push(((remaining % 6) + 1) as DieValue);
      remaining = Math.floor(remaining / 6);
    }
    const result = scoreRoll(dice);
    if ((result.points === 0) !== isBust(dice)) throw new Error("Bust oracle disagrees");
    if (count === 5 && result.isHotDice !== isHot(dice)) {
      throw new Error("Hot-dice oracle disagrees");
    }
    busts += Number(result.points === 0);
    hot += Number(result.isHotDice);
    points += result.points;
  }
  return {
    dice: count,
    outcomes: 6 ** count,
    busts,
    bustProbability: busts / 6 ** count,
    hotDiceProbability: hot / 6 ** count,
    expectedPoints: points / 6 ** count,
  };
}

function frequency(events: number, total: number, expectedProbability?: number) {
  if (total === 0) return { events, total, rate: null, wilson95: null, zScore: null };
  const p = events / total;
  const z = 1.959963984540054;
  const denominator = 1 + (z * z) / total;
  const centre = (p + (z * z) / (2 * total)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total)) / denominator;
  return {
    events,
    total,
    rate: p,
    wilson95: [centre - half, centre + half],
    zScore:
      expectedProbability === undefined
        ? null
        : (events - total * expectedProbability) /
          Math.sqrt(total * expectedProbability * (1 - expectedProbability)),
  };
}

function uniformity(counts: number[]) {
  const expected = counts.reduce((sum, count) => sum + count, 0) / counts.length;
  return {
    counts,
    chiSquare: counts.reduce((sum, count) => sum + (count - expected) ** 2 / expected, 0),
    degreesOfFreedom: counts.length - 1,
  };
}

const exactOdds = [1, 2, 3, 4, 5].map(exact);
const seeds = new Uint32Array(samples);
if (useCrypto) {
  randomFillSync(seeds);
  for (let i = 0; i < samples; i++) seeds[i] &= 0x7fffffff;
} else {
  for (let block = 0; block * 8 < samples; block++) {
    const hash = createHash("sha256").update(`${SAMPLE_SALT}/${block}`).digest();
    for (let j = 0; j < 8 && block * 8 + j < samples; j++) {
      seeds[block * 8 + j] = hash.readUInt32LE(j * 4) & 0x7fffffff;
    }
  }
}

const bustsByCup = [0, 0, 0, 0, 0];
const faceCounts = Array<number>(6).fill(0);
const pairs = Array<number>(36).fill(0);
const fullCupOutcomes = Array<number>(7776).fill(0);
let postHotCups = 0;
let postHotBusts = 0;
let postBustCups = 0;
let postBustBusts = 0;
for (const seed of seeds) {
  // createSoloGame consumes one draw for startIndex, even for one seat. Use
  // precisely that state so these are the opening dice a challenge would deal.
  const opening = rollDice(nextFloat(seed).state, 5);
  const following = rollDice(opening.state, 5);
  for (let cup = 1; cup <= 5; cup++) {
    bustsByCup[cup - 1] += Number(isBust(opening.dice.slice(0, cup)));
  }
  if (isHot(opening.dice)) {
    postHotCups++;
    postHotBusts += Number(isBust(following.dice));
  }
  if (isBust(opening.dice)) {
    postBustCups++;
    postBustBusts += Number(isBust(following.dice));
  }
  let key = 0;
  for (let j = 0; j < 5; j++) {
    const d = opening.dice[j] - 1;
    faceCounts[d]++;
    key = key * 6 + d;
    const next = j === 4 ? following.dice[0] : opening.dice[j + 1];
    pairs[d * 6 + next - 1]++;
  }
  fullCupOutcomes[key]++;
}

// Exercise real turn advancement, carry-over, and score changes too. This
// simple policies are reference experiments, not models of how humans play:
// keep automatic holds; either bank at 500/one remaining die or never bank.
// The second policy exercises hot-dice chains independently of the first
// policy's score and dice-count stopping conditions.
const engineRuns = Math.min(samples, requestedEngineRuns);
let engineOpeners = 0;
let engineOpeningBusts = 0;
let engineHotCups = 0;
let engineHotBusts = 0;
const scores: number[] = [];
for (let run = 0; run < engineRuns; run++) {
  let state = createRunGame(seeds[run]);
  let completed = 0;
  let actions = 0;
  while (completed < 10) {
    if (++actions > 1000) throw new Error("Reference run exceeded action bound");
    const legal = getLegalActions(state);
    const bank =
      strategy === "bank500" &&
      legal.canBank &&
      (state.turn.turnScore >= 500 || diceToRoll(state.turn).length === 1);
    const opening = !bank && state.turn.rollCount === 0;
    const afterHot = !bank && state.turn.hotDice;
    state = applyAction(state, { type: bank ? "BANK" : "ROLL" });
    if (opening) {
      engineOpeners++;
      engineOpeningBusts += Number(state.turn.busted);
    }
    if (afterHot) {
      engineHotCups++;
      engineHotBusts += Number(state.turn.busted);
    }
    if (state.turn.outcome) {
      completed++;
      if (completed < 10) state = applyAction(state, { type: "ADVANCE" });
    }
  }
  scores.push(state.players[0].total);
}

const superBustProbability = exactOdds[4].bustProbability;
const pNoBust = 1 - superBustProbability;
const histogramSummary = uniformity(fullCupOutcomes);
console.log(
  JSON.stringify(
    {
      sampling: { samples, source: useCrypto ? "node:crypto" : "SHA-256", salt: SAMPLE_SALT },
      exactOdds,
      sampledBustsByCup: bustsByCup.map((busts, i) => ({
        dice: i + 1,
        ...frequency(busts, samples, exactOdds[i].bustProbability),
      })),
      postHotFullCup: frequency(postHotBusts, postHotCups, superBustProbability),
      postBustFullCup: frequency(postBustBusts, postBustCups, superBustProbability),
      faces: uniformity(faceCounts),
      adjacentFaces: uniformity(pairs),
      fullCupOutcomes: {
        chiSquare: histogramSummary.chiSquare,
        degreesOfFreedom: histogramSummary.degreesOfFreedom,
        minimumCount: Math.min(...fullCupOutcomes),
        maximumCount: Math.max(...fullCupOutcomes),
      },
      realEngine: {
        runs: engineRuns,
        openingFullCup: frequency(engineOpeningBusts, engineOpeners, superBustProbability),
        postHotFullCup: frequency(engineHotBusts, engineHotCups, superBustProbability),
        referenceStrategy:
          strategy === "bank500"
            ? "Auto-hold; bank at >=500 or with one die left; otherwise roll"
            : "Auto-hold; roll until bust (no banking)",
        referenceStrategyScores: {
          mean: scores.reduce((sum, score) => sum + score, 0) / engineRuns,
          maximum: Math.max(...scores),
          atLeast4250: frequency(scores.filter((s) => s >= 4250).length, engineRuns),
          atLeast5000: frequency(scores.filter((s) => s >= 5000).length, engineRuns),
        },
      },
      tenTurnOpeningBusts: {
        atLeastOne: 1 - pNoBust ** 10,
        atLeastTwo: 1 - pNoBust ** 10 - 10 * superBustProbability * pNoBust ** 9,
        atLeastThree:
          1 -
          pNoBust ** 10 -
          10 * superBustProbability * pNoBust ** 9 -
          45 * superBustProbability ** 2 * pNoBust ** 8,
      },
      interpretation:
        "Exact odds assume independent fair faces. Confidence intervals are binomial sampling intervals; " +
        "chi-square summaries are diagnostics, not a security proof. Smaller cups can complete held " +
        "full-mat hands and therefore bust less often than the throw-only table. The fixed reference " +
        "strategy cannot establish the probability of a real leaderboard maximum without actual " +
        "attempt counts and player decisions. Post-hot samples conditioned on the opening hand " +
        "complement the separate real-engine samples, which include hot dice reached across throws.",
    },
    null,
    2,
  ),
);
