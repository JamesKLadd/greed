import { useCallback, useEffect, useRef, useState } from "react";
import { applyAction, diceToRoll, getLegalActions } from "@greed/core";
import type { DieValue, GameState, LegalActions } from "@greed/core";
import { decide } from "@greed/bots";
import { buildGame, type MatchSetup } from "./setup.js";
import { toastFor, type ToastMessage } from "./toasts.js";
import type { RollOffDisplayEntry } from "../components/RollOffView.js";

const ROLL_ANIM_MS = 650;
/** A bot's pause before it acts. Long enough that a run of bot rolls reads as a
 *  turn being played rather than a flicker of dice. */
const BOT_THINK_MS = 1300;
/** How long a finished turn (bust or bank) stays on screen before play moves on.
 *  Deliberately unhurried: a bust in particular needs a beat to land, and being
 *  swept straight into the next turn reads as the game skipping past it. */
const INTER_TURN_MS = 2100;

export type { ToastMessage } from "./toasts.js";

export interface GreedController {
  state: GameState;
  legal: LegalActions;
  isRolling: boolean;
  /** Dice indices currently tumbling (for the roll animation). */
  rollingIndices: number[];
  /**
   * The faces the throw in flight will land on, or null when nothing is rolling.
   *
   * The roll is resolved up front and its RESULT withheld from `state` until the
   * animation ends — that's what keeps the score and the locks from appearing
   * early. The dice themselves still need somewhere to be going, though, so the
   * landing faces are published separately and consumed only by the dice.
   */
  rollingDice: DieValue[] | null;
  toast: ToastMessage | null;
  /** The opening roll-off (turn order); shown before play begins. */
  rollOff: RollOffDisplayEntry[];
  /** True while the roll-off is on screen and play is paused. */
  rollOffActive: boolean;
  beginPlay: () => void;
  roll: () => void;
  bank: () => void;
  /** Hold a die, or put it back — the player overruling the auto-lock. */
  toggleDie: (index: number) => void;
  restart: (setup?: MatchSetup) => void;
}

export function useGreed(initialSetup: MatchSetup): GreedController {
  const [built, setBuilt] = useState(() => buildGame(initialSetup));
  const [state, setState] = useState<GameState>(() => built.state);
  const stateRef = useRef(state);
  stateRef.current = state;

  const [rollOffActive, setRollOffActive] = useState(true);
  const [isRolling, setIsRolling] = useState(false);
  const isRollingRef = useRef(false);
  isRollingRef.current = isRolling;

  const [rollingIndices, setRollingIndices] = useState<number[]>([]);
  const [rollingDice, setRollingDice] = useState<DieValue[] | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const lastLogLen = useRef(state.log.length);

  const applyNow = useCallback((action: Parameters<typeof applyAction>[1]) => {
    setState((prev) => applyAction(prev, action));
  }, []);

  const roll = useCallback(() => {
    if (isRollingRef.current) return;
    const s = stateRef.current;
    if (!getLegalActions(s).canRoll) return;
    // Resolve the throw NOW and hold the result back, rather than applying it
    // when the animation ends. Nothing else can act while `isRolling` (input is
    // blocked and the bot effect is gated on it), so the state this lands on is
    // the same either way — but knowing the faces up front is what lets the dice
    // turn to them in one motion instead of guessing and then correcting.
    const next = applyAction(s, { type: "ROLL" });
    setRollingIndices(diceToRoll(s.turn));
    setRollingDice(next.turn.dice);
    setIsRolling(true);
    window.setTimeout(() => {
      setIsRolling(false);
      setRollingIndices([]);
      setRollingDice(null);
      setState(next);
    }, ROLL_ANIM_MS);
  }, []);

  const bank = useCallback(() => {
    if (isRollingRef.current) return;
    const s = stateRef.current;
    if (!getLegalActions(s).canBank) return;
    applyNow({ type: "BANK" });
  }, [applyNow]);

  const toggleDie = useCallback(
    (index: number) => {
      // Never mid-throw: the dice on screen are the previous position.
      if (isRollingRef.current) return;
      applyNow({ type: "TOGGLE_LOCK", index });
    },
    [applyNow],
  );

  const restart = useCallback(
    (setup?: MatchSetup) => {
      const next = buildGame(setup ?? initialSetup);
      lastLogLen.current = next.state.log.length;
      setIsRolling(false);
      setRollingIndices([]);
      setRollingDice(null);
      setToast(null);
      setBuilt(next);
      setState(next.state);
      setRollOffActive(true);
    },
    [initialSetup],
  );

  const beginPlay = useCallback(() => setRollOffActive(false), []);

  // Surface notable events as toasts.
  useEffect(() => {
    const fresh = state.log.slice(lastLogLen.current);
    lastLogLen.current = state.log.length;
    for (const e of fresh) {
      const t = toastFor(e, state);
      if (t) setToast(t);
    }
  }, [state]);

  // Auto-dismiss toasts.
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 1900);
    return () => clearTimeout(id);
  }, [toast]);

  // After a turn finishes, hold on the result, then start the next turn.
  useEffect(() => {
    if (rollOffActive) return;
    if (state.phase === "game-over") return;
    if (!state.turn.outcome) return;
    const timer = window.setTimeout(() => applyNow({ type: "ADVANCE" }), INTER_TURN_MS);
    return () => clearTimeout(timer);
  }, [state, applyNow, rollOffActive]);

  // Drive bot turns.
  useEffect(() => {
    if (rollOffActive) return;
    if (state.phase === "game-over") return;
    if (isRolling) return;
    if (state.turn.outcome) return; // finished turn is handled by the advance effect
    const current = state.players[state.turn.playerIndex];
    if (!current.isBot) return;

    const timer = window.setTimeout(() => {
      const s = stateRef.current;
      if (s.phase === "game-over") return;
      const cur = s.players[s.turn.playerIndex];
      if (!cur.isBot) return;
      const action = decide(s, { personality: cur.botPersonality });
      if (action.type === "ROLL") roll();
      else bank();
    }, BOT_THINK_MS);
    return () => clearTimeout(timer);
  }, [state, isRolling, roll, bank, rollOffActive]);

  return {
    state,
    legal: getLegalActions(state),
    isRolling,
    rollingIndices,
    rollingDice,
    toast,
    rollOff: built.rollOff,
    rollOffActive,
    beginPlay,
    roll,
    bank,
    toggleDie,
    restart,
  };
}
