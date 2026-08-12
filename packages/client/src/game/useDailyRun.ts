import { useCallback, useMemo, useRef, useState } from "react";
import {
  DAILY_TURNS,
  applyAction,
  createDailyGame,
  createDailyShootout,
  dailyKey,
  diceToRoll,
  getLegalActions,
  type DailyMove,
  type DieValue,
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
 *
 * `playerKey` (the account id) seeds the dice along with the day, so each player
 * gets their own throws. It MUST match what the server replays with, which is
 * the id it authenticated — pass the signed-in user's id and nothing else.
 */

/** How long a finished turn stays on screen before the run moves on. Matches the
 *  unhurried inter-turn hold the main game uses, less the roll settle already
 *  spent above. */
const RESOLVE_MS = 1900;
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
  /** Faces the throw in flight will land on — see the same field on useGreed. */
  rollingDice: DieValue[] | null;
  canRoll: boolean;
  canBank: boolean;
  roll: () => void;
  bank: () => void;
}

/**
 * Which kind of run this is. A shootout is the same machinery with different
 * dice and exactly one turn — sharing the hook is what keeps the tiebreak
 * feeling like a turn of Greed rather than a separate minigame.
 */
export type DailyMode = "run" | "shootout";

export function useDailyRun(
  day: string = dailyKey(),
  playerKey = "",
  mode: DailyMode = "run",
): DailyRunController {
  const totalTurns = mode === "shootout" ? 1 : DAILY_TURNS;
  const build = mode === "shootout" ? createDailyShootout : createDailyGame;
  const [state, setState] = useState<GameState>(() => build(day, playerKey));
  const [turn, setTurn] = useState(0);
  const [moves, setMoves] = useState<DailyMove[]>([]);
  const [isRolling, setIsRolling] = useState(false);
  const [rollingIndices, setRollingIndices] = useState<number[]>([]);
  const [rollingDice, setRollingDice] = useState<DieValue[] | null>(null);
  const busy = useRef(false);

  // The account id arrives a moment after mount (the session is still being
  // restored), and it changes the dice — so start the run over when the seed
  // it is built from changes. Without this the run would be played against the
  // signed-out seed and then scored by the server against the real one.
  // The mode is part of the key too: a shootout is a different set of dice, so
  // switching to it after the run must rebuild rather than continue.
  const seedKey = `${day}|${playerKey}|${mode}`;
  const seedRef = useRef(seedKey);
  if (seedRef.current !== seedKey) {
    seedRef.current = seedKey;
    busy.current = false;
    setState(build(day, playerKey));
    setTurn(0);
    setMoves([]);
    setIsRolling(false);
    setRollingIndices([]);
    setRollingDice(null);
  }

  const legal = useMemo(() => getLegalActions(state), [state]);
  const finished = turn >= totalTurns;

  const act = useCallback(
    (move: DailyMove) => {
      if (busy.current || finished) return;
      const current = getLegalActions(state);
      if (move === "ROLL" && !current.canRoll) return;
      if (move === "BANK" && !current.canBank) return;

      busy.current = true;
      setMoves((m) => [...m, move]);

      const next = applyAction(state, { type: move });

      if (move === "ROLL") {
        // Tumble only the dice actually being thrown, and tell them which face
        // they are turning to — the result is otherwise held back until the
        // animation ends.
        setRollingIndices(state.turn.hotDice ? [0, 1, 2, 3, 4] : diceToRoll(state.turn));
        setRollingDice(next.turn.dice);
        setIsRolling(true);
      }

      const settle = move === "ROLL" ? ROLL_ANIM_MS : 0;

      window.setTimeout(() => {
        setIsRolling(false);
        setRollingIndices([]);
        setRollingDice(null);
        setState(next);

        if (next.turn.outcome) {
          // Hold the finished turn so the result is readable, then advance.
          window.setTimeout(() => {
            setTurn((t) => {
              const done = t + 1;
              if (done < totalTurns) setState(applyAction(next, { type: "ADVANCE" }));
              return done;
            });
            busy.current = false;
          }, RESOLVE_MS);
        } else {
          busy.current = false;
        }
      }, settle);
    },
    [state, finished, totalTurns],
  );

  return {
    state,
    turn,
    totalTurns,
    moves,
    finished,
    isRolling,
    rollingIndices,
    rollingDice,
    canRoll: !finished && !isRolling && legal.canRoll,
    canBank: !finished && !isRolling && legal.canBank,
    roll: () => act("ROLL"),
    bank: () => act("BANK"),
  };
}
