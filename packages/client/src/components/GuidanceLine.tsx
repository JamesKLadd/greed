import type { GameState } from "@greed/core";
import { coachHint } from "../game/coach.js";
import { useT } from "../i18n/i18n.js";

/**
 * One plain sentence, directly above the buttons, saying what is happening and
 * what you can do about it — "Roll again, or bank 450?", "Robo 2 is thinking…",
 * "Busted. Nothing banked this turn."
 *
 * This is always on, for every player, in every mode. It used to be an opt-in
 * "coach hints" bar in practice games only, which meant the people most likely
 * to need it were the least likely to find the toggle. It is the single highest
 * value thing on screen for someone who doesn't play games, and it costs one
 * line, so it earns its place permanently.
 *
 * The wording comes from `coachHint`, which already derives the right sentence
 * from game state for every situation and returns it as a translatable key.
 *
 * `muted` is the "show tips during play" setting turned off. It hides the line
 * from SIGHT but keeps it in the accessibility tree, because this is also the
 * live region that announces "busted", "banked" and "your turn" — for a screen
 * reader it isn't a tip, it's the only running commentary there is. The setting
 * is about visual noise; it shouldn't cost anyone information.
 */
export function GuidanceLine({
  state,
  canAct,
  muted = false,
  compact = false,
}: {
  state: GameState;
  canAct: boolean;
  muted?: boolean;
  /** Short felt copy; the full coaching sentence remains available to AT. */
  compact?: boolean;
}) {
  const t = useT();
  const hint = coachHint(state, canAct);
  const name = state.players[state.turn.playerIndex].name;
  const brief =
    state.phase === "game-over"
      ? t("controls.gameOver")
      : state.turn.outcome === "busted"
        ? t("controls.busted", { name })
        : state.turn.outcome === "banked"
          ? t("controls.banked", { name, points: state.turn.turnScore })
          : !canAct
            ? t("controls.waiting", { name })
            : state.turn.hotDice
              ? t("controls.hotDice")
              : state.turn.lastRoll
                ? t("controls.rollOrBank")
                : t("controls.rollToStart");
  return (
    <p
      className={muted ? "guide guide--muted" : `guide guide--${hint?.tone ?? "info"}`}
      role="status"
      aria-live="polite"
    >
      {compact ? (
        <>
          <span aria-hidden="true">{brief}</span>
          <span className="guide--muted">{hint ? t(hint.key, hint.params) : ""}</span>
        </>
      ) : hint ? (
        t(hint.key, hint.params)
      ) : (
        ""
      )}
    </p>
  );
}
