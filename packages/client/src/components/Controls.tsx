import { diceRemaining } from "@greed/core";
import type { GameState, LegalActions } from "@greed/core";
import { useI18n } from "../i18n/i18n.js";

interface ControlsProps {
  state: GameState;
  legal: LegalActions;
  isRolling: boolean;
  /** Whether the local user may act on the current turn (their seat, their turn). */
  canAct: boolean;
  onRoll: () => void;
  onBank: () => void;
}

export function Controls({ state, legal, isRolling, canAct, onRoll, onBank }: ControlsProps) {
  const { t, n } = useI18n();
  const turn = state.turn;
  const player = state.players[turn.playerIndex];
  const remaining = diceRemaining(turn);
  const lastGain = turn.lastRoll?.points ?? 0;
  const busy = isRolling || state.phase === "game-over";

  const status = (() => {
    if (state.phase === "game-over") return t("controls.gameOver");
    if (turn.outcome === "busted") return t("controls.busted", { name: player.name });
    if (turn.outcome === "banked")
      return t("controls.banked", { name: player.name, points: n(turn.turnScore) });
    if (!canAct) return t("controls.waiting", { name: player.name });
    if (turn.turnScore === 0) return t("controls.rollToStart");
    return turn.hotDice ? t("controls.hotDice") : t("controls.rollOrBank");
  })();

  const rollLabel =
    turn.turnScore === 0
      ? t("controls.rollDice")
      : turn.hotDice
        ? t("controls.rollAll5")
        : t("controls.rollAgain");

  // Not your turn: there is nothing here you can use, and the meters describe
  // someone else's turn — so the whole panel collapses to the one line that
  // says who you're waiting on. (The turn's running total is on the table, over
  // the dice, where everyone can watch it.)
  if (!canAct) {
    return (
      <div className="controls controls--waiting">
        <div className="controls__status" aria-live="polite">
          {status}
        </div>
      </div>
    );
  }

  return (
    <div className="controls">
      <div className="controls__status" aria-live="polite">
        {status}
      </div>

      <div className="controls__meters">
        <div className="meter">
          <span className="meter__label">{t("controls.turnPoints")}</span>
          <span className="meter__value">{n(turn.turnScore)}</span>
        </div>
        <div className="meter">
          <span className="meter__label">{t("controls.diceToRoll")}</span>
          <span className="meter__value">{turn.hotDice ? 5 : remaining}</span>
        </div>
        <div className="meter">
          <span className="meter__label">{t("controls.lastRoll")}</span>
          <span className="meter__value">{turn.lastRoll ? `+${n(lastGain)}` : "—"}</span>
        </div>
      </div>

      <div className="controls__buttons">
        <button
          className="btn btn--roll"
          onClick={onRoll}
          disabled={busy || !canAct || !legal.canRoll}
        >
          {rollLabel}
        </button>
        <button
          className="btn btn--bank"
          onClick={onBank}
          disabled={busy || !canAct || !legal.canBank}
        >
          {t("controls.bank")} {turn.turnScore > 0 ? n(turn.turnScore) : ""}
        </button>
      </div>
    </div>
  );
}
