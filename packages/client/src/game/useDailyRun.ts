import { useCallback, useRef, useState } from "react";
import {
  diceToRoll,
  getLegalActions,
  type DailyMove,
  type DieValue,
  type GameState,
} from "@greed/core";
import { playDailyMove, type DailyRunView } from "../net/daily.js";

/**
 * Drives a daily run against the server.
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
 * next throw is to ask for it.
 *
 * Turn resolution still mirrors the main game: a finished turn stays on screen
 * until the next move, so the player sees the roll that busted them. The server
 * leaves it visible too, and advances past it when the next move arrives.
 */

/** How long a finished turn stays on screen before the run moves on. */
const RESOLVE_MS = 1900;
/** Minimum tumble, so a fast reply still reads as a throw rather than a jump. */
const ROLL_ANIM_MS = 600;

export interface DailyRunController {
  state: GameState;
  /** Completed turns, 0..totalTurns. */
  turn: number;
  totalTurns: number;
  finished: boolean;
  isRolling: boolean;
  rollingIndices: number[];
  /** Faces the throw in flight will land on — null until the server replies. */
  rollingDice: DieValue[] | null;
  canRoll: boolean;
  canBank: boolean;
  /** Set when a move could not be sent; the run is unchanged and can be retried. */
  error: string | null;
  roll: () => void;
  bank: () => void;
}

export function useDailyRun(initial: DailyRunView): DailyRunController {
  const [view, setView] = useState<DailyRunView>(initial);
  const [isRolling, setIsRolling] = useState(false);
  const [rollingIndices, setRollingIndices] = useState<number[]>([]);
  const [rollingDice, setRollingDice] = useState<DieValue[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const state = view.state;
  const finished = view.complete;

  const act = useCallback(
    (move: DailyMove) => {
      if (busy.current || finished) return;
      busy.current = true;
      setError(null);

      // Start the tumble immediately and let the round trip happen underneath
      // it: the dice are already spinning by the time the faces come back, so
      // the latency lands inside the animation rather than in front of it.
      const started = Date.now();
      if (move === "ROLL") {
        setRollingIndices(state.turn.hotDice ? [0, 1, 2, 3, 4] : diceToRoll(state.turn));
        setIsRolling(true);
      }

      playDailyMove(move)
        .then((next) => {
          const wait = Math.max(0, ROLL_ANIM_MS - (Date.now() - started));
          if (move === "ROLL") setRollingDice(next.state.turn.dice);

          window.setTimeout(
            () => {
              setIsRolling(false);
              setRollingIndices([]);
              setRollingDice(null);
              setView(next);
              if (next.state.turn.outcome) {
                // Hold the finished turn so the result is readable. The server
                // has already recorded it, so nothing is riding on this timer.
                window.setTimeout(() => {
                  busy.current = false;
                }, RESOLVE_MS);
              } else {
                busy.current = false;
              }
            },
            move === "ROLL" ? wait : 0,
          );
        })
        .catch((err: unknown) => {
          setIsRolling(false);
          setRollingIndices([]);
          setRollingDice(null);
          busy.current = false;
          setError(err instanceof Error ? err.message : "Couldn't play that move.");
        });
    },
    [state, finished],
  );

  // Mirrors the server's own legality probe: a finished turn is still showing,
  // and the next move advances past it — so rolling is offered again rather
  // than a dead board, while banking needs a live turn with points on it.
  const showingOutcome = state.turn.outcome != null;
  const legal = getLegalActions(state);
  const canRoll = !finished && !isRolling && (showingOutcome || legal.canRoll);
  const canBank = !finished && !isRolling && !showingOutcome && legal.canBank;

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
  };
}
