import type { GameState } from "@greed/core";
import { coachHint } from "../game/coach.js";
import { useT } from "../i18n/i18n.js";

/** A contextual coaching tip shown under the top bar during practice games. */
export function CoachBar({ state, canAct }: { state: GameState; canAct: boolean }) {
  const t = useT();
  const hint = coachHint(state, canAct);
  if (!hint) return null;
  return (
    <div className={`coach coach--${hint.tone}`} role="status" aria-live="polite">
      <span className="coach__icon" aria-hidden="true">
        💡
      </span>
      <span className="coach__text">{t(hint.key, hint.params)}</span>
    </div>
  );
}
