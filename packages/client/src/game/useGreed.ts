import { useCallback, useEffect, useRef, useState } from "react";
import { applyAction, diceToRoll, getLegalActions } from "@greed/core";
import type { DieValue, GameState, LegalActions } from "@greed/core";
import { ThrowCollector, decide, type DecisionRecord, type ThrowRecord } from "@greed/bots";
import { buildGame, type MatchSetup } from "./setup.js";
import { toastFor, type ToastMessage } from "./toasts.js";
import type { RollOffDisplayEntry } from "../components/RollOffView.js";
import { createRollPlayback } from "./rollPlayback.js";
import { BOT_THINK_MS, INTER_TURN_MS, ROLL_ANIM_MS } from "./pacing.js";

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
  /** Every throw and choice a human at this table has made this game (roll statistics). */
  rollsFor: (playerId: string) => PlayerRolls;
}

export interface PlayerRolls {
  throws: ThrowRecord[];
  decisions: DecisionRecord[];
}

export interface GreedOptions {
  /**
   * A game left before it ended — the table closed, the tab closed, or a new
   * game dealt over it. Given the last position and the throws so far, so it
   * can still be recorded: leaving out the games players walk away from would
   * leave only the ones where the dice were kind. Only called if something was
   * thrown by a human.
   */
  onUnfinished?: (state: GameState, rollsFor: (playerId: string) => PlayerRolls) => void;
}

export function useGreed(initialSetup: MatchSetup, options: GreedOptions = {}): GreedController {
  const [built, setBuilt] = useState(() => buildGame(initialSetup));
  const [state, setState] = useState<GameState>(() => built.state);
  const stateRef = useRef(state);
  stateRef.current = state;

  const [rollOffActive, setRollOffActive] = useState(true);
  const [isRolling, setIsRolling] = useState(false);
  const [rollPlayback] = useState(createRollPlayback);
  useEffect(() => () => rollPlayback.cancel(), [rollPlayback]);

  const [rollingIndices, setRollingIndices] = useState<number[]>([]);
  const [rollingDice, setRollingDice] = useState<DieValue[] | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const lastLogLen = useRef(state.log.length);
  // The humans' throws and choices, for the roll statistics. Watched at the one
  // place each is applied, so what is recorded is exactly what was played.
  const rolls = useRef(humanThrows(built.state));
  const rollsFor = useCallback(
    (id: string): PlayerRolls => ({
      throws: rolls.current.throwsFor(id),
      decisions: rolls.current.decisionsFor(id),
    }),
    [],
  );
  const onUnfinished = useRef(options.onUnfinished);
  onUnfinished.current = options.onUnfinished;
  /** Hand an unfinished game over to be recorded, at most once. */
  const settled = useRef(false);
  const abandon = useCallback(() => {
    const s = stateRef.current;
    if (settled.current || s.phase === "game-over") return;
    const humans = s.players.filter((p) => !p.isBot);
    if (!humans.some((p) => rolls.current.throwsFor(p.id).length > 0)) return;
    settled.current = true;
    onUnfinished.current?.(s, rollsFor);
  }, [rollsFor]);
  // Leaving the table (unmount), or the tab being closed for good. A page
  // merely put into the back-forward cache (`persisted`) may well come back to
  // this very game, so it is not counted as left.
  useEffect(() => {
    const onHide = (e: PageTransitionEvent) => {
      if (!e.persisted) abandon();
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      abandon();
    };
  }, [abandon]);

  const applyNow = useCallback((action: Parameters<typeof applyAction>[1]) => {
    // A hold followed by Roll in the same task must use the changed selection.
    const next = applyAction(stateRef.current, action);
    stateRef.current = next;
    setState(next);
  }, []);

  const roll = useCallback(() => {
    if (rollPlayback.active) return;
    const s = stateRef.current;
    if (!getLegalActions(s).canRoll) return;
    // Resolve the throw NOW and hold the result back, rather than applying it
    // when the animation ends. Nothing else can act while `isRolling` (input is
    // blocked and the bot effect is gated on it), so the state this lands on is
    // the same either way — but knowing the faces up front is what lets the dice
    // turn to them in one motion instead of guessing and then correcting.
    const next = applyAction(s, { type: "ROLL" });
    rolls.current.observe(s, next);
    setRollingIndices(diceToRoll(s.turn));
    setRollingDice(next.turn.dice);
    setIsRolling(true);
    rollPlayback.start(() => {
      setIsRolling(false);
      setRollingIndices([]);
      setRollingDice(null);
      stateRef.current = next;
      setState(next);
    }, ROLL_ANIM_MS);
  }, [rollPlayback]);

  const bank = useCallback(() => {
    if (rollPlayback.active) return;
    const s = stateRef.current;
    if (!getLegalActions(s).canBank) return;
    applyNow({ type: "BANK" });
    rolls.current.observe(s, stateRef.current);
  }, [applyNow, rollPlayback]);

  const toggleDie = useCallback(
    (index: number) => {
      // Never mid-throw: the dice on screen are the previous position.
      if (rollPlayback.active) return;
      applyNow({ type: "TOGGLE_LOCK", index });
    },
    [applyNow, rollPlayback],
  );

  const restart = useCallback(
    (setup?: MatchSetup) => {
      // A restart during the tumble must not land the old match 650ms later.
      rollPlayback.cancel();
      // A new game dealt over one still being played leaves that one unfinished.
      abandon();
      settled.current = false;
      const next = buildGame(setup ?? initialSetup);
      lastLogLen.current = next.state.log.length;
      rolls.current = humanThrows(next.state);
      setIsRolling(false);
      setRollingIndices([]);
      setRollingDice(null);
      setToast(null);
      setBuilt(next);
      stateRef.current = next.state;
      setState(next.state);
      setRollOffActive(true);
    },
    [initialSetup, rollPlayback, abandon],
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
    rollsFor,
  };
}

function humanThrows(state: GameState): ThrowCollector {
  return new ThrowCollector(state.players.filter((p) => !p.isBot).map((p) => p.id));
}
