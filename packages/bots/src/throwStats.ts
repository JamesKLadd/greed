/**
 * Roll statistics: what a player actually threw, against what the dice owed
 * them.
 *
 * Every throw is kept as the raw facts — the faces held, the faces thrown, the
 * points riding on it — and everything else is derived. The ODDS of a throw
 * depend on nothing but the held faces (the dice not held are exactly the ones
 * thrown, and a straight or five of a kind is judged on the whole mat), so they
 * are computed here by enumerating every outcome with the real scoring rules,
 * and cached per mat. That makes "expected" mean the player's own positions,
 * not textbook odds: busting on one die while holding 2,3,4,5 is a 1-in-2 shot
 * (a 1, 5 or 6 all save it), not the 2-in-3 of a lone die.
 *
 * Shared by the server (daily, weekly and online games, which it runs) and the
 * client (solo games, and a guest's own view), so a throw is measured the same
 * way wherever it was made.
 */

import { DICE_COUNT, diceToRoll, isWinner, scoreRoll } from "@greed/core";
import type { DieValue, GameState } from "@greed/core";
import { turnRollModel } from "./probabilities.js";
import { rollEdge } from "./strategies.js";

export type StatsMode = "local" | "online" | "daily" | "weekly";
export const STATS_MODES: readonly StatsMode[] = ["local", "online", "daily", "weekly"];

export function isStatsMode(value: unknown): value is StatsMode {
  return STATS_MODES.some((m) => m === value);
}

/** How long roll data is kept, everywhere it is kept. */
export const ROLL_DATA_DAYS = 100;

/** One throw, as it happened. */
export interface ThrowRecord {
  /** The player's turn in this game, from 1. */
  turn: number;
  /** The throw's place in that turn, from 1. A hot-dice re-throw keeps counting. */
  throw: number;
  /** Faces held on the mat as the dice were thrown, sorted; "" for a fresh five. */
  held: string;
  /** Faces thrown, in the order they landed. */
  faces: string;
  /** Unbanked points riding on the throw. */
  atRisk: number;
  /** Points the throw added to the turn; 0 on a bust. */
  gain: number;
  /** What the throw was worth on average from that exact position. */
  expectedGain: number;
}

/** What a throw did, read off its faces. */
export interface ThrowEvents {
  /** Dice thrown. */
  dice: number;
  bust: boolean;
  /** Three or more matching dice within the throw itself. */
  triple: boolean;
  /** A straight completed on this throw, in one throw or built onto held dice. */
  straight: boolean;
  /** Five of a kind completed on this throw, likewise. */
  five: boolean;
  /** Every die on the mat scored: the turn earns a fresh five. */
  hot: boolean;
}

/** The chance of each event from a position, given the held faces. */
export interface ThrowOdds {
  bust: number;
  triple: number;
  straight: number;
  five: number;
  hot: number;
}

/**
 * A choice a player made with points on the line: throw again, or bank.
 *
 * The first throw of a turn is not a choice (it is the only legal move), so
 * it is never one of these; every later throw, and every bank, is.
 */
export interface DecisionRecord {
  turn: number;
  choice: "roll" | "bank";
  /** Unbanked points at stake when choosing. */
  atRisk: number;
  /** Dice a throw would have used (five after hot dice). */
  dice: number;
  /**
   * Points rolling was worth over banking from that position, playing the rest
   * of the turn perfectly (see rollEdge): positive says roll, negative bank.
   */
  edge: number;
}

/** A call this close to the best one is a good call either way. */
export const CLOSE_CALL = 5;

const faceList = (s: string) => [...s].map((c) => Number(c) as DieValue);

function isStraightHand(faces: DieValue[]): boolean {
  const key = [...faces].sort().join("");
  return key === "12345" || key === "23456";
}

function isFiveHand(faces: DieValue[]): boolean {
  return faces.length === DICE_COUNT && faces.every((f) => f === faces[0]);
}

function eventsOf(held: DieValue[], thrown: DieValue[]): ThrowEvents {
  const score = scoreRoll(thrown);
  const mat = [...held, ...thrown];
  const full = mat.length === DICE_COUNT;
  const straight = full && isStraightHand(mat);
  const five = full && isFiveHand(mat);
  const counts = new Array<number>(7).fill(0);
  for (const f of thrown) counts[f] += 1;
  // The engine's own rule (game.ts): a throw that pays nothing busts unless it
  // completes a hand on the mat.
  const bust = score.points === 0 && !straight && !five;
  return {
    dice: thrown.length,
    bust,
    triple: counts.some((c) => c >= 3),
    straight,
    five,
    hot: !bust && (straight || five || score.isHotDice),
  };
}

/** What a recorded throw did. */
export function throwEvents(record: Pick<ThrowRecord, "held" | "faces">): ThrowEvents {
  return eventsOf(faceList(record.held), faceList(record.faces));
}

const oddsCache = new Map<string, ThrowOdds>();

/** Exact odds of each event for a throw made while holding `held`. */
export function throwOdds(held: string): ThrowOdds {
  const key = [...held].sort().join("");
  const cached = oddsCache.get(key);
  if (cached) return cached;
  const heldFaces = faceList(key);
  const k = DICE_COUNT - heldFaces.length;
  const total = 6 ** k;
  const sums = { bust: 0, triple: 0, straight: 0, five: 0, hot: 0 };
  const thrown = new Array<DieValue>(k).fill(1);
  const recurse = (pos: number): void => {
    if (pos === k) {
      const e = eventsOf(heldFaces, thrown);
      if (e.bust) sums.bust += 1;
      if (e.triple) sums.triple += 1;
      if (e.straight) sums.straight += 1;
      if (e.five) sums.five += 1;
      if (e.hot) sums.hot += 1;
      return;
    }
    for (let f = 1; f <= 6; f++) {
      thrown[pos] = f as DieValue;
      recurse(pos + 1);
    }
  };
  recurse(0);
  const odds: ThrowOdds = {
    bust: sums.bust / total,
    triple: sums.triple / total,
    straight: sums.straight / total,
    five: sums.five / total,
    hot: sums.hot / total,
  };
  oddsCache.set(key, odds);
  return odds;
}

/**
 * The throw a ROLL made, from the states either side of it, or null when the
 * action threw nothing (it was refused).
 */
export function recordThrow(
  before: GameState,
  after: GameState,
  turn: number,
): { playerId: string; record: ThrowRecord } | null {
  const event = after.log[before.log.length];
  if (!event || event.type !== "roll") return null;
  const indices = diceToRoll(before.turn);
  const thrownSet = new Set(indices);
  const held = before.turn.dice
    .filter((_, i) => !thrownSet.has(i))
    .sort()
    .join("");
  const model = turnRollModel(before.turn);
  const expectedGain = model.transitions.reduce((sum, t) => sum + t.p * t.gain, 0);
  return {
    playerId: event.playerId,
    record: {
      turn,
      throw: before.turn.rollCount + 1,
      held,
      faces: indices.map((i) => after.turn.dice[i]).join(""),
      atRisk: before.turn.turnScore,
      gain: after.turn.busted ? 0 : Math.max(0, after.turn.turnScore - before.turn.turnScore),
      expectedGain: Math.round(expectedGain * 10) / 10,
    },
  };
}

/**
 * Collects throws for chosen players across a game, numbering their turns.
 * Hand it the state before and after each action; anything but a throw by one
 * of the watched players is ignored.
 */
export class ThrowCollector {
  private readonly logs = new Map<string, ThrowRecord[]>();
  private readonly choices = new Map<string, DecisionRecord[]>();
  private readonly turns = new Map<string, number>();

  constructor(playerIds: Iterable<string>) {
    for (const id of playerIds) {
      this.logs.set(id, []);
      this.choices.set(id, []);
      this.turns.set(id, 0);
    }
  }

  /** Hand it the state either side of a ROLL or a BANK; anything else is ignored. */
  observe(before: GameState, after: GameState): void {
    const player = before.players[before.turn.playerIndex];
    if (!player || !this.logs.has(player.id)) return;
    const event = after.log[before.log.length];
    if (!event || !("playerId" in event) || event.playerId !== player.id) return;

    if (event.type === "bank") {
      // Every bank is a choice: one was only legal because a throw had scored,
      // and with dice left to throw, throwing was the alternative. A mat with
      // nothing left to throw is the one bank that was not a choice.
      const dice = diceToRoll(before.turn).length;
      if (dice > 0) this.decide(player.id, before, "bank", dice);
      return;
    }

    // The first throw of a turn starts it; a hot-dice re-throw does not.
    const turn = (this.turns.get(player.id) ?? 0) + (before.turn.rollCount === 0 ? 1 : 0);
    const thrown = recordThrow(before, after, turn);
    if (!thrown) return;
    this.turns.set(player.id, turn);
    // Throwing again is a choice only where banking was the alternative: not
    // the turn's first throw, and not after releasing dice took the turn's
    // points back to nothing.
    if (before.turn.rollCount > 0 && before.turn.turnScore > 0) {
      this.decide(player.id, before, "roll", diceToRoll(before.turn).length);
    }
    this.logs.get(player.id)!.push(thrown.record);
  }

  private decide(id: string, before: GameState, choice: "roll" | "bank", dice: number): void {
    this.choices.get(id)!.push({
      turn: this.turns.get(id) ?? 0,
      choice,
      atRisk: before.turn.turnScore,
      dice,
      edge: Math.round(rollEdge(before.turn) * 10) / 10,
    });
  }

  throwsFor(playerId: string): ThrowRecord[] {
    return this.logs.get(playerId) ?? [];
  }

  decisionsFor(playerId: string): DecisionRecord[] {
    return this.choices.get(playerId) ?? [];
  }
}

/**
 * Every die thrown at the table this game, by anyone — bots included — as
 * counts of each face. The fairness audit's sample: far larger than any one
 * player's throws, and with no player's choices in it at all.
 */
export function tableFaces(state: GameState): number[] {
  const counts = [0, 0, 0, 0, 0, 0];
  for (const e of state.log) {
    if (e.type === "roll") for (const f of e.dice) counts[f - 1] += 1;
  }
  return counts;
}

/** One finished game or challenge run, from one player's side of the table. */
export interface RollGame {
  mode: StatsMode;
  /** When it finished, ISO 8601. */
  playedAt: string;
  /** The player's final total. */
  score: number;
  /** Won it; null for a challenge run, which has no opponent. */
  won: boolean | null;
  /** The target; null for a challenge run, which is played to a turn limit. */
  goal: number | null;
  /** Seats at the table; null for a challenge run. */
  players: number | null;
  turns: number;
  banks: number;
  busts: number;
  bankedPoints: number;
  lostPoints: number;
  bestTurn: number;
  /**
   * Played to the end. A game left early is still recorded — leaving out the
   * ones players quit would leave only the games where the dice were kind —
   * but it has no result, so it stays out of scores and win rates.
   */
  finished: boolean;
  throws: ThrowRecord[];
  decisions: DecisionRecord[];
}

/** Build a player's record of a game from its last state. */
export function rollGameFromState(
  mode: StatsMode,
  state: GameState,
  playerId: string,
  throws: ThrowRecord[],
  playedAt: Date = new Date(),
  opts: { decisions?: DecisionRecord[]; finished?: boolean } = {},
): RollGame {
  const finished = opts.finished ?? true;
  let banks = 0;
  let busts = 0;
  let skips = 0;
  let bankedPoints = 0;
  let lostPoints = 0;
  let bestTurn = 0;
  for (const e of state.log) {
    if (!("playerId" in e) || e.playerId !== playerId) continue;
    if (e.type === "bank") {
      banks += 1;
      bankedPoints += e.gained;
      bestTurn = Math.max(bestTurn, e.gained);
    } else if (e.type === "bust") {
      busts += 1;
      lostPoints += e.lostPoints;
    } else if (e.type === "skip") {
      skips += 1;
    }
  }
  const run = mode === "daily" || mode === "weekly";
  return {
    mode,
    playedAt: playedAt.toISOString(),
    score: state.players.find((p) => p.id === playerId)?.total ?? 0,
    won: run || !finished ? null : isWinner(state, playerId),
    goal: run ? null : state.config.goal,
    players: run ? null : state.players.length,
    turns: banks + busts + skips,
    banks,
    busts,
    bankedPoints,
    lostPoints,
    bestTurn,
    finished,
    throws,
    decisions: opts.decisions ?? [],
  };
}

// ------------------------------------------------------------------ tallies
//
// A tally is a flat bag of numbers so it can be summed anywhere — in a loop
// here, or in one SQL statement on the server, which builds its SUM and MAX
// columns from these two lists. Expected counts are sums of per-throw
// probabilities; the matching `v*` keys sum p(1-p), the variance of a count of
// independent throws with different odds, which is what says whether a gap
// between actual and expected is luck or noise.

export const TALLY_SUM_KEYS = [
  "games",
  // Of those, played to the end; scores and win rates read only these.
  "finished",
  "scoreSum",
  "wins",
  "decided",
  "turns",
  "banks",
  "busts",
  "bankedPoints",
  "lostPoints",
  "throws",
  // Throws, busts, expected busts and their variance, by dice thrown. Spelled
  // out rather than generated, so TallyKey stays a closed list.
  "n1",
  "b1",
  "eb1",
  "vb1",
  "n2",
  "b2",
  "eb2",
  "vb2",
  "n3",
  "b3",
  "eb3",
  "vb3",
  "n4",
  "b4",
  "eb4",
  "vb4",
  "n5",
  "b5",
  "eb5",
  "vb5",
  // The five-dice throws that came from hot dice: a super bust there throws
  // away a turn that had already scored every die once. Rows filed before
  // these existed are filled in by migrateRollStats from their throws.
  "n5h",
  "b5h",
  "eb5h",
  "vb5h",
  "triThrows",
  "tri",
  "eTri",
  "vTri",
  "str",
  "eStr",
  "vStr",
  "five",
  "eFive",
  "vFive",
  "hot",
  "eHot",
  "vHot",
  "gain",
  "eGain",
  // Throws a player CHOSE to make (every one after the first in a turn).
  "vol",
  "volRisk",
  "volBust",
  "dice",
  "f1",
  "f2",
  "f3",
  "f4",
  "f5",
  "f6",
  // Decisions: how many, how many were the better call (or close enough to it),
  // how many banked when rolling was better (cautious) or rolled when banking
  // was (greedy), and the expected points those cost.
  "dec",
  // Games with any decisions recorded: what "per game" divides by, since games
  // filed before decisions were kept have none and would dilute it.
  "decGames",
  "decGood",
  "decCautious",
  "decGreedy",
  "costCautious",
  "costGreedy",
  // By dice available: choices, how many were "roll again", and how many the
  // model would have rolled.
  "dn1",
  "dr1",
  "do1",
  "dn2",
  "dr2",
  "do2",
  "dn3",
  "dr3",
  "do3",
  "dn4",
  "dr4",
  "do4",
  "dn5",
  "dr5",
  "do5",
  // Banks by size: under 300, 300-499, 500-749, 750-999, 1000 and up.
  "bk0",
  "bk1",
  "bk2",
  "bk3",
  "bk4",
  // Points the throws scored (before any bust took them back), by what scored.
  "pOnes",
  "pFives",
  "pTriple",
  "pStraight",
  "pFive",
] as const;

export const TALLY_MAX_KEYS = ["bestTurn", "maxRiskSurvived", "maxLost"] as const;

export type TallyKey = (typeof TALLY_SUM_KEYS)[number] | (typeof TALLY_MAX_KEYS)[number];
export type RollTally = Record<TallyKey, number>;

export function emptyTally(): RollTally {
  const t = {} as RollTally;
  for (const k of TALLY_SUM_KEYS) t[k] = 0;
  for (const k of TALLY_MAX_KEYS) t[k] = 0;
  return t;
}

export function mergeTallies(a: RollTally, b: Partial<RollTally>): RollTally {
  const out = { ...a };
  for (const k of TALLY_SUM_KEYS) out[k] += Number(b[k]) || 0;
  for (const k of TALLY_MAX_KEYS) out[k] = Math.max(out[k], Number(b[k]) || 0);
  return out;
}

/**
 * Five-dice throws made on hot dice, and how many of them busted. A turn's
 * first throw is the only other way to have all five dice in the cup, so a
 * five-dice throw after the first is the hot-dice re-throw. Its odds are any
 * fresh five's; it is the stakes that differ.
 */
export function hotRethrowTally(
  throws: readonly ThrowRecord[],
): Pick<RollTally, "n5h" | "b5h" | "eb5h" | "vb5h"> {
  const t = { n5h: 0, b5h: 0, eb5h: 0, vb5h: 0 };
  for (const r of throws) {
    if (r.throw <= 1 || r.faces.length !== DICE_COUNT) continue;
    const p = throwOdds(r.held).bust;
    t.n5h += 1;
    t.eb5h += p;
    t.vb5h += p * (1 - p);
    if (throwEvents(r).bust) t.b5h += 1;
  }
  return t;
}

export function tallyGame(game: RollGame): RollTally {
  const t = emptyTally();
  t.games = 1;
  if (game.finished) {
    t.finished = 1;
    t.scoreSum = game.score;
  }
  if (game.won !== null) {
    t.decided = 1;
    t.wins = game.won ? 1 : 0;
  }
  t.turns = game.turns;
  t.banks = game.banks;
  t.busts = game.busts;
  t.bankedPoints = game.bankedPoints;
  t.lostPoints = game.lostPoints;
  t.bestTurn = game.bestTurn;
  let biggestLoss = 0;
  for (const r of game.throws) {
    const e = throwEvents(r);
    const p = throwOdds(r.held);
    const k = e.dice as 1 | 2 | 3 | 4 | 5;
    t.throws += 1;
    t[`n${k}`] += 1;
    t[`eb${k}`] += p.bust;
    t[`vb${k}`] += p.bust * (1 - p.bust);
    if (e.bust) t[`b${k}`] += 1;
    if (k >= 3) {
      t.triThrows += 1;
      t.eTri += p.triple;
      t.vTri += p.triple * (1 - p.triple);
      if (e.triple) t.tri += 1;
    }
    t.eStr += p.straight;
    t.vStr += p.straight * (1 - p.straight);
    if (e.straight) t.str += 1;
    t.eFive += p.five;
    t.vFive += p.five * (1 - p.five);
    if (e.five) t.five += 1;
    t.eHot += p.hot;
    t.vHot += p.hot * (1 - p.hot);
    if (e.hot) t.hot += 1;
    t.gain += r.gain;
    t.eGain += r.expectedGain;
    if (r.throw > 1) {
      t.vol += 1;
      t.volRisk += p.bust;
      if (e.bust) t.volBust += 1;
    }
    if (!e.bust) t.maxRiskSurvived = Math.max(t.maxRiskSurvived, p.bust);
    else biggestLoss = Math.max(biggestLoss, r.atRisk);
    for (const c of r.faces) t[`f${c}` as TallyKey] += 1;
    if (!e.bust) addPointSources(t, r, e);
    t.dice += r.faces.length;
  }
  t.maxLost = biggestLoss;
  Object.assign(t, hotRethrowTally(game.throws));
  if (game.decisions.length > 0) t.decGames = 1;
  for (const d of game.decisions) {
    const k = Math.min(5, Math.max(1, d.dice)) as 1 | 2 | 3 | 4 | 5;
    const rolled = d.choice === "roll";
    t.dec += 1;
    t[`dn${k}`] += 1;
    if (rolled) t[`dr${k}`] += 1;
    if (d.edge > 0) t[`do${k}`] += 1;
    const lost = rolled ? -d.edge : d.edge;
    if (lost <= CLOSE_CALL) t.decGood += 1;
    else if (rolled) {
      t.decGreedy += 1;
      t.costGreedy += lost;
    } else {
      t.decCautious += 1;
      t.costCautious += lost;
    }
    if (!rolled) {
      const bucket =
        d.atRisk < 300 ? 0 : d.atRisk < 500 ? 1 : d.atRisk < 750 ? 2 : d.atRisk < 1000 ? 3 : 4;
      t[`bk${bucket}`] += 1;
    }
  }
  return t;
}

/**
 * Credit what a scoring throw added to the kind of score that made it. A hand
 * completed on the mat takes the whole gain (it replaced what the held dice
 * were paying); otherwise the throw's own breakdown is scaled to the gain, so
 * the categories always add up to the points the throws actually scored.
 */
function addPointSources(t: RollTally, r: ThrowRecord, e: ThrowEvents): void {
  if (r.gain <= 0) return;
  if (e.straight) {
    t.pStraight += r.gain;
    return;
  }
  if (e.five) {
    t.pFive += r.gain;
    return;
  }
  const parts = scoreRoll(faceList(r.faces)).breakdown;
  const total = parts.reduce((sum, b) => sum + b.points, 0);
  if (total <= 0) return;
  for (const b of parts) {
    const share = (b.points / total) * r.gain;
    if (b.kind === "ones") t.pOnes += share;
    else if (b.kind === "fives") t.pFives += share;
    else if (b.kind === "triple") t.pTriple += share;
    else if (b.kind === "straight") t.pStraight += share;
    else t.pFive += share;
  }
}

export function tallyGames(games: readonly RollGame[]): RollTally {
  return games.reduce((sum, g) => mergeTallies(sum, tallyGame(g)), emptyTally());
}

// --------------------------------------------------------------- comparisons

/** Whether coming up more often than expected is good news or bad. */
export type Leaning = "good" | "bad" | "neutral";

export interface OddsComparison {
  key:
    | "superBust"
    | "superBustHot"
    | "bust4"
    | "bust3"
    | "bust2"
    | "bust1"
    | "triple"
    | "straight"
    | "five"
    | "hot";
  leaning: Leaning;
  /** Throws it could have happened on. */
  chances: number;
  /** Times it happened. */
  actual: number;
  /** Times it was expected to happen, from the exact odds of each throw. */
  expected: number;
  /**
   * How many standard deviations actual sits from expected. Beyond ±2 the gap
   * is unlikely to be noise; inside it, it is ordinary luck either way.
   */
  z: number | null;
}

function compare(
  key: OddsComparison["key"],
  leaning: Leaning,
  chances: number,
  actual: number,
  expected: number,
  variance: number,
): OddsComparison {
  return {
    key,
    leaning,
    chances,
    actual,
    expected,
    z: variance > 0 ? (actual - expected) / Math.sqrt(variance) : null,
  };
}

/** The headline table: each event's real rate against its odds. */
export function oddsComparisons(t: RollTally): OddsComparison[] {
  return [
    compare("superBust", "bad", t.n5, t.b5, t.eb5, t.vb5),
    compare("superBustHot", "bad", t.n5h, t.b5h, t.eb5h, t.vb5h),
    compare("bust4", "bad", t.n4, t.b4, t.eb4, t.vb4),
    compare("bust3", "bad", t.n3, t.b3, t.eb3, t.vb3),
    compare("bust2", "bad", t.n2, t.b2, t.eb2, t.vb2),
    compare("bust1", "bad", t.n1, t.b1, t.eb1, t.vb1),
    compare("triple", "good", t.triThrows, t.tri, t.eTri, t.vTri),
    compare("straight", "good", t.throws, t.str, t.eStr, t.vStr),
    compare("five", "good", t.throws, t.five, t.eFive, t.vFive),
    compare("hot", "good", t.throws, t.hot, t.eHot, t.vHot),
  ];
}

/** Each face's share of every die thrown, against the fair one in six. */
export function faceComparisons(
  t: RollTally,
): { face: number; actual: number; z: number | null }[] {
  const n = t.dice;
  const sd = Math.sqrt((n * 5) / 36);
  return [1, 2, 3, 4, 5, 6].map((face) => {
    const actual = t[`f${face}` as TallyKey];
    return { face, actual, z: n > 0 ? (actual - n / 6) / sd : null };
  });
}

/**
 * Chi-square test of face counts against a fair die: the statistic and the
 * chance a fair die would look at least this uneven (the p-value). With five
 * degrees of freedom — six faces, one total.
 */
export function chiSquareFair(counts: readonly number[]): { chi2: number; p: number } | null {
  const n = counts.reduce((a, b) => a + b, 0);
  if (n === 0) return null;
  const expected = n / counts.length;
  const chi2 = counts.reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0);
  return { chi2, p: upperGammaQ((counts.length - 1) / 2, chi2 / 2) };
}

/** Regularised upper incomplete gamma Q(a, x), by series or continued fraction. */
function upperGammaQ(a: number, x: number): number {
  if (x <= 0) return 1;
  const lnGammaA = lnGamma(a);
  if (x < a + 1) {
    let sum = 1 / a;
    let term = sum;
    for (let n = 1; n < 500; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-14) break;
    }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - lnGammaA);
  }
  // Lentz's continued fraction.
  let b = x + 1 - a;
  let c = 1e300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-14) break;
  }
  return Math.exp(-x + a * Math.log(x) - lnGammaA) * h;
}

function lnGamma(z: number): number {
  // Lanczos approximation; ample for the half-integers this is asked about.
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

// ---------------------------------------------------------------- storage

type ThrowTuple = [number, number, string, string, number, number, number];

/** Compact text for a game's throws: an array of tuples, not of objects. */
export function encodeThrows(throws: readonly ThrowRecord[]): string {
  return JSON.stringify(
    throws.map((r): ThrowTuple => [
      r.turn,
      r.throw,
      r.held,
      r.faces,
      r.atRisk,
      r.gain,
      r.expectedGain,
    ]),
  );
}

type DecisionTuple = [number, 0 | 1, number, number, number];

export function encodeDecisions(decisions: readonly DecisionRecord[]): string {
  return JSON.stringify(
    decisions.map((d): DecisionTuple => [
      d.turn,
      d.choice === "roll" ? 1 : 0,
      d.atRisk,
      d.dice,
      d.edge,
    ]),
  );
}

/** One decision from untrusted input, or null. */
export function cleanDecision(raw: unknown): DecisionRecord | null {
  const tuple = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
      ? (() => {
          const r = raw as Record<string, unknown>;
          return [
            r.turn,
            r.choice === "roll" ? 1 : r.choice === "bank" ? 0 : -1,
            r.atRisk,
            r.dice,
            r.edge,
          ];
        })()
      : null;
  if (!tuple || tuple.length < 5) return null;
  const [turn, choice, atRisk, dice, edge] = tuple;
  if (choice !== 0 && choice !== 1) return null;
  const t = sane(turn, 100_000);
  const risk = sane(atRisk, 1_000_000);
  const k = sane(dice, DICE_COUNT);
  if (t === null || risk === null || !k || typeof edge !== "number" || !Number.isFinite(edge))
    return null;
  if (Math.abs(edge) > 100_000) return null;
  return {
    turn: Math.floor(t),
    choice: choice === 1 ? "roll" : "bank",
    atRisk: Math.round(risk),
    dice: Math.floor(k),
    edge,
  };
}

export function decodeDecisions(text: string | null | undefined): DecisionRecord[] {
  if (!text) return [];
  try {
    const raw = JSON.parse(text) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.map(cleanDecision).filter((d): d is DecisionRecord => d !== null);
  } catch {
    return [];
  }
}

function parseList(raw: unknown): unknown[] | null {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const FACES = /^[1-6]*$/;
const MAX_THROWS = 3000;

function sane(n: unknown, max: number): number | null {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= max ? n : null;
}

/** One throw from untrusted input, or null when it could not have happened. */
export function cleanThrow(raw: unknown): ThrowRecord | null {
  const tuple = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
      ? (() => {
          const r = raw as Record<string, unknown>;
          return [r.turn, r.throw, r.held, r.faces, r.atRisk, r.gain, r.expectedGain];
        })()
      : null;
  if (!tuple || tuple.length < 7) return null;
  const [turn, thr, held, faces, atRisk, gain, expectedGain] = tuple;
  if (typeof held !== "string" || typeof faces !== "string") return null;
  if (!FACES.test(held) || !FACES.test(faces) || faces.length < 1) return null;
  if (held.length + faces.length !== DICE_COUNT) return null;
  const t = sane(turn, 100_000);
  const n = sane(thr, 10_000);
  const risk = sane(atRisk, 1_000_000);
  const g = sane(gain, 10_000);
  const eg = sane(expectedGain, 10_000);
  if (!t || !n || risk === null || g === null || eg === null) return null;
  const record = {
    turn: Math.floor(t),
    throw: Math.floor(n),
    held: [...held].sort().join(""),
    faces,
    atRisk: Math.round(risk),
    gain: Math.round(g),
    expectedGain: eg,
  };
  // A bust adds nothing; anything claiming otherwise is not a real throw.
  if (throwEvents(record).bust && record.gain !== 0) return null;
  return record;
}

export function decodeThrows(text: string): ThrowRecord[] {
  try {
    const raw = JSON.parse(text) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.map(cleanThrow).filter((r): r is ThrowRecord => r !== null);
  } catch {
    return [];
  }
}

/**
 * A game from untrusted input — a solo game a client uploads — or null.
 * Bounded so a forged record cannot be anything a real game could not.
 */
export function cleanRollGame(raw: unknown, mode: StatsMode): RollGame | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  let at = typeof r.playedAt === "string" ? new Date(r.playedAt) : null;
  if (!at || !Number.isFinite(at.getTime())) return null;
  // Nothing from before the kept window. A time in the future is a device
  // clock running fast, not a forgery worth refusing — refusing it would lose
  // a real game — so it is read as "just now".
  const now = Date.now();
  if (at.getTime() > now) at = new Date(now);
  if (at.getTime() < now - ROLL_DATA_DAYS * 86_400_000) return null;
  const rawThrows = parseList(r.throws);
  if (!rawThrows || rawThrows.length > MAX_THROWS) return null;
  const throws = rawThrows.map(cleanThrow);
  if (throws.some((t) => t === null)) return null;
  // Absent from a client that predates decisions: none, rather than refused.
  const rawDecisions = r.decisions == null ? [] : parseList(r.decisions);
  if (!rawDecisions || rawDecisions.length > MAX_THROWS * 2) return null;
  const decisions = rawDecisions.map(cleanDecision);
  if (decisions.some((d) => d === null)) return null;
  const num = (v: unknown, max: number) => sane(v, max);
  const score = num(r.score, 1_000_000);
  const turns = num(r.turns, 100_000);
  const banks = num(r.banks, 100_000);
  const busts = num(r.busts, 100_000);
  const banked = num(r.bankedPoints, 1_000_000);
  const lost = num(r.lostPoints, 10_000_000);
  const best = num(r.bestTurn, 100_000);
  if ([score, turns, banks, busts, banked, lost, best].some((v) => v === null)) return null;
  const goal = r.goal == null ? null : num(r.goal, 1_000_000);
  const players = r.players == null ? null : num(r.players, 8);
  return {
    mode,
    playedAt: at.toISOString(),
    score: Math.round(score!),
    won: typeof r.won === "boolean" ? r.won : null,
    goal: goal === null ? null : Math.round(goal),
    players: players === null ? null : Math.round(players),
    turns: Math.round(turns!),
    banks: Math.round(banks!),
    busts: Math.round(busts!),
    bankedPoints: Math.round(banked!),
    lostPoints: Math.round(lost!),
    bestTurn: Math.round(best!),
    // Absent from an older client, whose uploads were always finished games.
    finished: r.finished !== false,
    throws: throws as ThrowRecord[],
    decisions: decisions as DecisionRecord[],
  };
}

/** A table's face counts from untrusted input (six counts), or null. */
export function cleanFaces(raw: unknown): number[] | null {
  if (!Array.isArray(raw) || raw.length !== 6) return null;
  const counts = raw.map((c) => sane(c, 100_000));
  return counts.every((c) => c !== null) ? counts.map((c) => Math.round(c!)) : null;
}

// -------------------------------------------------------------------- CSV

const csvCell = (v: unknown): string => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csvLine = (cells: unknown[]) => cells.map(csvCell).join(",");
const pct = (x: number) => (Math.round(x * 100_000) / 1000).toFixed(3);

/** A game with an optional label for whose it is (the all-players export). */
export interface LabelledGame {
  game: RollGame;
  player?: string;
}

/** One line per game or run, with its counts and the odds it was played against. */
export function gamesCsv(games: readonly LabelledGame[]): string {
  const withPlayer = games.some((g) => g.player);
  const head = [
    ...(withPlayer ? ["player"] : []),
    "played_at",
    "mode",
    "finished",
    "score",
    "won",
    "goal",
    "players",
    "turns",
    "banks",
    "busts",
    "banked_points",
    "lost_points",
    "best_turn",
    "throws",
    "super_busts",
    "super_bust_expected",
    "throws_after_hot_dice",
    "super_busts_after_hot_dice",
    "super_busts_after_hot_dice_expected",
    ...[4, 3, 2, 1].flatMap((k) => [
      `throws_${k}_dice`,
      `busts_${k}_dice`,
      `busts_${k}_dice_expected`,
    ]),
    "three_of_a_kind",
    "three_of_a_kind_expected",
    "straights",
    "straights_expected",
    "five_of_a_kind",
    "five_of_a_kind_expected",
    "hot_dice",
    "hot_dice_expected",
    "points_from_throws",
    "points_expected",
    "decisions",
    "good_calls",
    "too_cautious",
    "too_greedy",
    "points_cost_by_calls",
  ];
  const rows = games.map(({ game, player }) => {
    const t = tallyGame(game);
    return csvLine([
      ...(withPlayer ? [player ?? ""] : []),
      game.playedAt,
      game.mode,
      game.finished ? "yes" : "no",
      game.score,
      game.won === null ? "" : game.won ? "yes" : "no",
      game.goal ?? "",
      game.players ?? "",
      game.turns,
      game.banks,
      game.busts,
      game.bankedPoints,
      game.lostPoints,
      game.bestTurn,
      t.throws,
      t.b5,
      t.eb5.toFixed(3),
      t.n5h,
      t.b5h,
      t.eb5h.toFixed(3),
      ...[4, 3, 2, 1].flatMap((k) => [
        t[`n${k}` as TallyKey],
        t[`b${k}` as TallyKey],
        t[`eb${k}` as TallyKey].toFixed(3),
      ]),
      t.tri,
      t.eTri.toFixed(3),
      t.str,
      t.eStr.toFixed(3),
      t.five,
      t.eFive.toFixed(3),
      t.hot,
      t.eHot.toFixed(3),
      t.gain,
      t.eGain.toFixed(1),
      t.dec,
      t.decGood,
      t.decCautious,
      t.decGreedy,
      (t.costCautious + t.costGreedy).toFixed(1),
    ]);
  });
  return [csvLine(head), ...rows].join("\n") + "\n";
}

/** One line per throw, with the exact odds of everything it could have done. */
export function throwsCsv(games: readonly LabelledGame[]): string {
  const withPlayer = games.some((g) => g.player);
  const head = [
    ...(withPlayer ? ["player"] : []),
    "played_at",
    "mode",
    "turn",
    "throw",
    "dice_thrown",
    "held",
    "faces",
    "points_at_risk",
    "points_gained",
    "points_expected",
    "bust",
    "bust_chance_pct",
    "three_of_a_kind",
    "three_of_a_kind_chance_pct",
    "straight",
    "straight_chance_pct",
    "five_of_a_kind",
    "five_of_a_kind_chance_pct",
    "hot_dice",
    "hot_dice_chance_pct",
  ];
  const lines = [csvLine(head)];
  for (const { game, player } of games) {
    for (const r of game.throws) {
      const e = throwEvents(r);
      const p = throwOdds(r.held);
      const yn = (b: boolean) => (b ? "yes" : "no");
      lines.push(
        csvLine([
          ...(withPlayer ? [player ?? ""] : []),
          game.playedAt,
          game.mode,
          r.turn,
          r.throw,
          e.dice,
          r.held,
          r.faces,
          r.atRisk,
          r.gain,
          r.expectedGain,
          yn(e.bust),
          pct(p.bust),
          e.dice >= 3 ? yn(e.triple) : "",
          e.dice >= 3 ? pct(p.triple) : "",
          yn(e.straight),
          pct(p.straight),
          yn(e.five),
          pct(p.five),
          yn(e.hot),
          pct(p.hot),
        ]),
      );
    }
  }
  return lines.join("\n") + "\n";
}

/** One line per decision: what was chosen, and what the model says it was worth. */
export function decisionsCsv(games: readonly LabelledGame[]): string {
  const withPlayer = games.some((g) => g.player);
  const head = [
    ...(withPlayer ? ["player"] : []),
    "played_at",
    "mode",
    "turn",
    "choice",
    "points_at_risk",
    "dice_left",
    "roll_edge_points",
    "best_call",
    "verdict",
    "expected_points_cost",
  ];
  const lines = [csvLine(head)];
  for (const { game, player } of games) {
    for (const d of game.decisions) {
      const rolled = d.choice === "roll";
      const lost = rolled ? -d.edge : d.edge;
      const verdict = lost <= CLOSE_CALL ? "good" : rolled ? "too greedy" : "too cautious";
      lines.push(
        csvLine([
          ...(withPlayer ? [player ?? ""] : []),
          game.playedAt,
          game.mode,
          d.turn,
          d.choice,
          d.atRisk,
          d.dice,
          d.edge,
          d.edge > 0 ? "roll" : "bank",
          verdict,
          Math.max(0, lost).toFixed(1),
        ]),
      );
    }
  }
  return lines.join("\n") + "\n";
}
