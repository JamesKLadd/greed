import { diceRemaining } from "@greed/core";
import type { GameState, LegalActions } from "@greed/core";
import { useI18n } from "../i18n/i18n.js";
import { pointsAtRisk } from "../game/turnPresentation.js";

interface ActionBarProps {
  state: GameState;
  legal: LegalActions;
  isRolling: boolean;
  /** Whether the local user may act on the current turn (their seat, their turn). */
  canAct: boolean;
  onRoll: () => void;
  onBank: () => void;
  variant?: "classic" | "scene";
}

/**
 * The two things you can ever do, as two big buttons pinned to the bottom of
 * the screen: GREEN to keep going, AMBER to stop and keep it.
 *
 * Each carries the number that decides it — how many dice you'd be rolling, and
 * how much you'd be walking away with. Those two figures used to live in a row
 * of three separate readout cards above the buttons; putting them ON the
 * buttons means the choice and the numbers behind it are the same glance, and
 * it gives the table back a third of the screen.
 *
 * (The third card, "last roll", is gone entirely — it's the score that just
 * flew up off the dice a second ago.)
 */
export function ActionBar({
  state,
  legal,
  isRolling,
  canAct,
  onRoll,
  onBank,
  variant = "classic",
}: ActionBarProps) {
  const { t, n } = useI18n();
  const turn = state.turn;
  const busy = isRolling || state.phase === "game-over";
  const remaining = turn.hotDice ? 5 : diceRemaining(turn);

  // Someone else's turn: the same two buttons, disabled, still showing the
  // numbers — so you can watch what the active seat is risking. Deliberately
  // NOT replaced by a "waiting for X" message: the guidance line right above
  // already says that in a full sentence, and the bar keeping its shape stops
  // the whole board shifting every time play passes round.
  return (
    <div className={variant === "scene" ? "scene-actions" : "actionbar"}>
      <button
        className={
          variant === "scene" ? "tp-action tp-action--roll" : "btn btn--roll actionbar__btn"
        }
        onClick={onRoll}
        disabled={!canAct || busy || !legal.canRoll}
      >
        <strong className="actionbar__verb">
          {t(variant === "scene" ? "scene.roll" : "controls.rollDice")}
        </strong>
        <span className="actionbar__num">
          {remaining === 1 ? t("action.diceCountOne") : t("action.diceCount", { count: remaining })}
        </span>
      </button>
      <button
        className={
          variant === "scene" ? "tp-action tp-action--bank" : "btn btn--bank actionbar__btn"
        }
        onClick={onBank}
        disabled={!canAct || busy || !legal.canBank}
      >
        <strong
          className="actionbar__verb"
          data-long-label={t("controls.bank").length > 6 || undefined}
        >
          {t("controls.bank")}
        </strong>
        <span className="actionbar__num">{n(pointsAtRisk(state))}</span>
      </button>
    </div>
  );
}
