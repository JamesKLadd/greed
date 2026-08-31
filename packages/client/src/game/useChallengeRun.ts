import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyAction,
  diceToRoll,
  getLegalActions,
  runMoveStart,
  type DieValue,
  type GameState,
  type RunMove,
} from "@greed/core";

/**
 * Drives a scored solo run against the server — the daily challenge or the
 * weekly one, which differ only in which endpoint their moves are sent to.
 *
 * The server deals: it owns the move list and the seed, applies each move to its
 * own copy and hands back the resulting position. This hook renders that
 * position and nothing else — it never builds a game, never sees the seed, and
 * never decides a score.
 *
 * That is the whole point. When the client held the seed it could deal itself
 * the day's dice in advance, and leaving the screen and coming back dealt the
 * SAME dice again — so a player could bail out of a bad turn, replay it knowing
 * what was coming, and keep going until the run looked good. A run is now
 * claimed on the server the moment it starts, and the only way to reach the
 * next throw is to ask for it. The weekly grants the retry the daily withholds,
 * but on the server's terms: a fresh secret seed, and only after the run in
 * hand has been played out.
 *
 * The ONE thing this hook applies locally is clearing a finished turn: the
 * server leaves the turn that just ended on screen and advances past it when the
 * next move arrives, and this hook advances its own copy so the board isn't
 * still showing the last turn while the next one is being played. Advancing
 * deals nothing and needs no seed, so it can be done here safely.
 */

/** A run position as any of the challenge endpoints hands it over. */
export interface RunView {
  state: GameState;
  turns: number;
  totalTurns: number;
  complete: boolean;
}

/** Sends one move and returns the position it reached. */
export type PlayMove = (move: RunMove) => Promise<RunView>;

/** How long a busted turn stays on screen before the board clears for the next. */
const RESOLVE_MS = 1900;
/**
 * How long a throw is in the air. Tracks `--cube-roll-ms` in tokens.css, the
 * same way the main game's controller does — the dice are told where they are
 * landing before they leave the felt, so the arc has to be given time to finish.
 */
const ROLL_ANIM_MS = 650;

export interface ChallengeRunController {
  state: GameState;
  /** Completed turns, 0..totalTurns. */
  turn: number;
  totalTurns: number;
  finished: boolean;
  isRolling: boolean;
  rollingIndices: number[];
  /** Faces the throw in flight will land on — null when nothing is rolling. */
  rollingDice: DieValue[] | null;
  canRoll: boolean;
  canBank: boolean;
  /** Set when a move could not be sent; the run is unchanged and can be retried. */
  error: string | null;
  roll: () => void;
  bank: () => void;
  /** Hold a die, or put it back. */
  toggleDie: (index: number) => void;
}

export function useChallengeRun(initial: RunView, playMove: PlayMove): ChallengeRunController {
  const [view, setView] = useState<RunView>(initial);
  const [isRolling, setIsRolling] = useState(false);
  const [rollingIndices, setRollingIndices] = useState<number[]>([]);
  const [rollingDice, setRollingDice] = useState<DieValue[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * A move is in flight, or its result is still being held on screen.
   *
   * Kept as STATE and not only as a ref because the buttons are driven off it.
   * While a finished turn was being held, Roll still looked live but every press
   * was dropped on the floor — which is why the daily seemed to need two or
   * three presses, or a wait, before it would move on to the next turn.
   */
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const timers = useRef(new Set<number>());

  const state = view.state;
  const finished = view.complete;

  // Pending timers outlive a render, but not the screen.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const id of pending) clearTimeout(id);
      pending.clear();
    };
  }, []);

  const after = useCallback((ms: number, fn: () => void) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  }, []);

  const release = useCallback(() => {
    busyRef.current = false;
    setBusy(false);
  }, []);

  /**
   * Show the position the server sent back, then decide what the board does with
   * the turn that just ended.
   *
   * A BUST is held so the losing roll can be read, then cleared. A BANK clears
   * at once: the points have already moved to the total, so leaving the banked
   * roll lit on the tray only made the next turn look like it was starting from
   * the last turn's dice. Either way the board ends up on a fresh turn, which is
   * what the next move would have started from anyway.
   */
  const land = useCallback(
    (next: RunView) => {
      const outcome = next.state.turn.outcome;
      if (!outcome || next.complete) {
        setView(next);
        release();
        return;
      }
      if (outcome === "banked") {
        setView({ ...next, state: runMoveStart(next.state) });
        release();
        return;
      }
      setView(next);
      // The server has already recorded the turn, so nothing is riding on this
      // timer beyond how long the bust stays readable.
      after(RESOLVE_MS, () => {
        setView((v) => (v.state === next.state ? { ...v, state: runMoveStart(v.state) } : v));
        release();
      });
    },
    [after, release],
  );

  /**
   * Hold a die, or put it back.
   *
   * Applied here the moment it is tapped and sent on afterwards, unlike a throw:
   * holding deals no dice and needs no seed, so the client can work it out for
   * itself and a tap lands without waiting for a round trip. The server still
   * has to be told, because a run is replayed from its move list — the dice a
   * later throw produces depend on which of them were held.
   */
  const holdSeq = useRef(0);
  const toggleDie = useCallback(
    (index: number) => {
      if (busyRef.current || finished) return;
      if (state.turn.outcome || state.turn.rollCount === 0) return;

      setView((v) => ({ ...v, state: applyAction(v.state, { type: "TOGGLE_LOCK", index }) }));
      const seq = ++holdSeq.current;
      playMove(("H" + index) as RunMove)
        .then((next) => {
          // A reply to a tap that has already been overtaken describes a board
          // two taps ago; the newest request is the only one worth adopting.
          if (seq === holdSeq.current) setView(next);
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : "Couldn't play that move.");
        });
    },
    [state, finished, playMove],
  );

  const act = useCallback(
    (move: RunMove) => {
      if (busyRef.current || finished) return;
      busyRef.current = true;
      setBusy(true);
      setError(null);

      // Clear any finished turn off the board before the move goes out. The
      // server advances past it first, so the throw belongs to a NEW turn —
      // rolling from the old one threw the new turn against the last turn's
      // board: dice that locked when it ended sat there lit and motionless while
      // only the ones that happened to be free tumbled.
      const from = runMoveStart(state);
      if (from !== state) setView((v) => ({ ...v, state: from }));

      playMove(move)
        .then((next) => {
          if (move !== "ROLL") {
            land(next);
            return;
          }
          // The tumble starts when the faces come back, NOT when the button is
          // pressed. A throw is one continuous arc onto the face it lands on,
          // and the die has to be told that face before it leaves the felt (see
          // Die.tsx) — starting the spin blind and learning the answer mid-air
          // is what made the daily's dice settle on one number and then turn
          // again to a different one, reading as two throws. The round trip now
          // sits in front of the arc instead of inside it, with the buttons
          // disabled for it, which is the same single motion the main game runs.
          setRollingIndices(diceToRoll(from.turn));
          setRollingDice(next.state.turn.dice);
          setIsRolling(true);
          after(ROLL_ANIM_MS, () => {
            setIsRolling(false);
            setRollingIndices([]);
            setRollingDice(null);
            land(next);
          });
        })
        .catch((err: unknown) => {
          setIsRolling(false);
          setRollingIndices([]);
          setRollingDice(null);
          release();
          setError(err instanceof Error ? err.message : "Couldn't play that move.");
        });
    },
    [state, finished, after, land, release, playMove],
  );

  // Mirrors the server's own legality probe: a finished turn may still be
  // showing, and the next move advances past it — so rolling is offered again
  // rather than a dead board, while banking needs a live turn with points on it.
  // `busy` covers the throw and the hold after it, so an action is offered only
  // when pressing it would actually do something.
  const showingOutcome = state.turn.outcome != null;
  const legal = getLegalActions(state);
  const canRoll = !finished && !busy && (showingOutcome || legal.canRoll);
  const canBank = !finished && !busy && !showingOutcome && legal.canBank;

  return {
    state,
    turn: view.turns,
    totalTurns: view.totalTurns,
    finished,
    isRolling,
    rollingIndices,
    rollingDice,
    canRoll,
    canBank,
    error,
    roll: () => act("ROLL"),
    bank: () => act("BANK"),
    toggleDie,
  };
}
