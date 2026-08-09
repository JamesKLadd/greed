import { useCallback, useMemo, useRef, useState } from "react";
import {
  DAILY_TURNS,
  applyAction,
  createDailyGame,
  dailyKey,
  diceToRoll,
  getLegalActions,
  type DailyMove,
  type GameState,
} from "@greed/core";

/**
 * Plays a daily run locally while recording every move.
 *
 * The run is played client-side for responsiveness, but the move list is what
 * gets submitted — the server replays it to derive the score, so this hook never
 * needs to be trusted. Turn resolution mirrors the main game: a finished turn
 * stays visible until an explicit advance, so the player sees the roll that
 * busted them.
 */

const RESOLVE_MS = 1400;
const ROLL_ANIM_MS = 600;

export interface DailyRunController {
  state: GameState;
  /** Completed turns, 0..DAILY_TURNS. */
  turn: number;
  totalTurns: number;
  moves: DailyMove[];
  finished: boolean;
  isRolling: boolean;
  rollingIndices: number[];
  canRoll: boolean;
  canBank: boolean;
  roll: () => void;
  bank: () => void;
}

export function useDailyRun(day: string = dailyKey()): DailyRunController {
  const [state, setState] = useState<GameState>(() => createDailyGame(day));
  const [turn, setTurn] = useState(0);
  const [moves, setMoves] = useState<DailyMove[]>([]);
  const [isRolling, setIsRolling] = useState(false);
  const [rollingIndices, setRollingIndices] = useState<number[]>([]);
  const busy = useRef(false);

  const legal = useMemo(() => getLegalActions(state), [state]);
  const finished = turn >= DAILY_TURNS;

  const act = useCallback(
    (move: DailyMove) => {
      if (busy.current || finished) return;
      const current = getLegalActions(state);
      if (move === "ROLL" && !current.canRoll) return;
      if (move === "BANK" && !current.canBank) return;

      busy.current = true;
      setMoves((m) => [...m, move]);

      if (move === "ROLL") {
        // Tumble only the dice actually being thrown.
        setRollingIndices(state.turn.hotDice ? [0, 1, 2, 3, 4] : diceToRoll(state.turn));
        setIsRolling(true);
      }

      const next = applyAction(state, { type: move });
      const settle = move === "ROLL" ? ROLL_ANIM_MS : 0;

      window.setTimeout(() => {
        setIsRolling(false);
        setRollingIndices([]);
        setState(next);

        if (next.turn.outcome) {
          // Hold the finished turn so the result is readable, then advance.
          window.setTimeout(() => {
            setTurn((t) => {
              const done = t + 1;
              if (done < DAILY_TURNS) setState(applyAction(next, { type: "ADVANCE" }));
              return done;
            });
            busy.current = false;
          }, RESOLVE_MS);
        } else {
          busy.current = false;
        }
      }, settle);
    },
    [state, finished],
  );

  return {
    state,
    turn,
    totalTurns: DAILY_TURNS,
    moves,
    finished,
    isRolling,
    rollingIndices,
    canRoll: !finished && !isRolling && legal.canRoll,
    canBank: !finished && !isRolling && legal.canBank,
    roll: () => act("ROLL"),
    bank: () => act("BANK"),
  };
}
