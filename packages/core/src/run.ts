/**
 * A solo scored run: the machinery the timed challenges are built out of.
 *
 * A run is a seed, a list of moves, and a turn limit. Nothing here knows which
 * challenge it is serving or when that challenge resets — those are calendars,
 * and they live in `daily.ts` and `weekly.ts`. What lives HERE is the part both
 * of them need to agree on exactly: the client plays the run, then the server
 * REPLAYS the moves through this same code to derive the score. Because the
 * engine is pure and its RNG is seeded, the replay is authoritative — a forged
 * score can't survive it, and the only way to submit a bigger number is to
 * actually play better.
 *
 * Every run gets its own randomly generated seed, held by the server and never
 * sent to the client. Two properties fall out of that. No two people play the
 * same dice, so the best line through a challenge cannot be worked out once and
 * copied. And nobody — including the player — can read their own dice ahead of
 * time, so the route to a good score has to be found live, one throw at a time.
 * Runs stay comparable because every seed draws from the same distribution: the
 * same number of turns at identical odds.
 */

import { applyAction, createSoloGame, getLegalActions } from "./game.js";
import { diceToRoll } from "./turn.js";
import { DICE_COUNT } from "./types.js";
import type { GameState } from "./types.js";

/**
 * A goal high enough that the endgame can never trigger, so a run always ends
 * on the turn count rather than on reaching a target.
 */
const RUN_GOAL = 1_000_000_000;

export const RUN_PLAYER_ID = "you";

/**
 * The moves a player may make in a run.
 *
 * "H0".."H4" hold a die or put it back — the same tap the other modes make
 * locally, but a run is replayed from its move list on the server, so a change
 * to which dice are held has to be part of that list or the replay would throw
 * different dice from the ones the player actually saw.
 */
export type RunMove = "ROLL" | "BANK" | "H0" | "H1" | "H2" | "H3" | "H4";

/** The die a hold move refers to, or null if this isn't one. */
export function holdIndex(move: RunMove): number | null {
  return move.startsWith("H") ? Number(move.slice(1)) : null;
}

/** Is this string one of the moves a client may submit? */
export function isRunMove(value: unknown): value is RunMove {
  return (
    value === "ROLL" || value === "BANK" || (typeof value === "string" && /^H[0-4]$/.test(value))
  );
}

export interface RunResult {
  /** Final banked total. */
  score: number;
  /** Turns actually completed (a run may be read while unfinished). */
  turns: number;
  banks: number;
  busts: number;
  /**
   * Busts on a full cup of five — the opening throw of a turn, or the fresh
   * five off a cleared mat.
   *
   * Counted apart from the rest because it is a different event. Every other
   * bust is a throw you chose to make with what the last one left you; this is
   * the one where the dice owed you nothing and gave you nothing anyway, and
   * it is the only bust that can cost a whole turn's worth of hot dice.
   */
  superBusts: number;
  /** Cleared mats recorded by the engine, including consecutive hot rolls. */
  hotDice: number;
  /** Largest single banked turn. */
  bestTurn: number;
  /** True when the run played out all of its turns. */
  complete: boolean;
}

/** A fresh run on a given seed. */
export function createRunGame(seed: number): GameState {
  return createSoloGame({ id: RUN_PLAYER_ID, name: "You", isBot: false }, { seed, goal: RUN_GOAL });
}

/** Where a run stands after a sequence of moves. */
export interface RunPosition {
  /** The live game, with a just-finished turn still showing its outcome. */
  state: GameState;
  /** Turns completed so far, 0..turnLimit. */
  turns: number;
  /** Aggregate stats for the run so far. */
  result: RunResult;
}

/**
 * The position the next move actually starts from.
 *
 * A finished turn is left on screen with its `outcome` still set, so the player
 * can see the roll that busted them — but the next move does not begin there.
 * The replay advances past it first, and so must anything else reasoning about
 * that move: the server deciding whether it is legal, the client deciding which
 * dice the throw will tumble. Reading the finished turn instead sees the
 * previous turn's locks, which is a board that no longer exists.
 *
 * A no-op on a turn still in play, and never touches the RNG — advancing only
 * swaps in a fresh turn, so this cannot deal anything or move the run along.
 */
export function runMoveStart(state: GameState): GameState {
  return state.turn.outcome ? applyAction(state, { type: "ADVANCE" }) : state;
}

/**
 * Replay a sequence of moves against a seed and report where the run stands.
 * This is the single source of truth for a run: the server owns the move list,
 * replays it here, and hands the resulting state back to the client to render.
 *
 * Illegal or excess moves are ignored rather than throwing: a replay should
 * yield the position the moves actually reach, and silently dropping a move
 * that couldn't have been made is what makes a forged submission worth no more
 * than an honest one.
 *
 * A finished turn is left ON SCREEN (its `outcome` still set) rather than
 * advanced past, so the player sees the roll that busted them. The next move
 * advances first — which is why the move list only ever holds ROLL, BANK and
 * holds, and never an ADVANCE the client could desync on.
 */
export function runPosition(seed: number, moves: RunMove[], turnLimit: number): RunPosition {
  let state = createRunGame(seed);
  let turns = 0;
  let banks = 0;
  let busts = 0;
  let superBusts = 0;
  let bestTurn = 0;

  for (const move of moves) {
    if (turns >= turnLimit) break;

    // Holding a die changes nothing about the run's progress — no dice are
    // dealt, no turn ends — so it is applied where it stands, against the turn
    // as the player is looking at it rather than the one after it.
    const held = holdIndex(move);
    if (held !== null) {
      state = applyAction(state, { type: "TOGGLE_LOCK", index: held });
      continue;
    }

    // The previous turn is still on show; starting a new move clears it.
    state = runMoveStart(state);

    const legal = getLegalActions(state);
    if (move === "ROLL" && !legal.canRoll) continue;
    if (move === "BANK" && !legal.canBank) continue;

    const before = state.players[0].total;
    // Asked BEFORE the throw, because afterwards the locks have moved: a bust
    // holds nothing, and a hand that scored has locked whatever paid. This is
    // the cup as the player picked it up.
    const cup = move === "ROLL" ? diceToRoll(state.turn).length : 0;
    // Narrowed by the two guards above: only ROLL and BANK reach here.
    state = applyAction(state, { type: move as "ROLL" | "BANK" });

    if (state.turn.outcome) {
      if (state.turn.outcome === "banked") {
        banks += 1;
        bestTurn = Math.max(bestTurn, state.players[0].total - before);
      } else {
        busts += 1;
        if (cup === DICE_COUNT) superBusts += 1;
      }
      turns += 1;
    }
  }

  return {
    state,
    turns,
    result: {
      score: state.players[0].total,
      turns,
      banks,
      busts,
      superBusts,
      // A hot reroll can clear a SECOND mat while hotDice stays true. The
      // engine logs each clear once, and restoring a lock does not add one.
      hotDice: state.log.filter((event) => event.type === "hot-dice").length,
      bestTurn,
      complete: turns >= turnLimit,
    },
  };
}

/** The score a move list earns — the run's final, authoritative result. */
export function scoreRun(seed: number, moves: RunMove[], turnLimit: number): RunResult {
  return runPosition(seed, moves, turnLimit).result;
}
