import { useT } from "../i18n/i18n.js";
import { useBeta } from "./BetaContext.js";
import { BETA_AVAILABLE } from "./access.js";

/** Both presentations are public; Classic remains a reversible fallback. */
export function BetaGate() {
  const t = useT();
  const { enabled, setEnabled } = useBeta();
  if (!BETA_AVAILABLE) return null;
  return (
    <div className="beta-entry">
      <button className="beta-entry__button" onClick={() => setEnabled(!enabled)}>
        {t(enabled ? "beta.classic" : "beta.enter")} <span aria-hidden="true">↗</span>
      </button>
    </div>
  );
}
