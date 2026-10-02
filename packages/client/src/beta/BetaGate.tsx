import { useRef, useState } from "react";
import { Modal, Button } from "../ui/index.js";
import { useT } from "../i18n/i18n.js";
import { useBeta } from "./BetaContext.js";
import { acceptsBetaCode, BETA_AVAILABLE } from "./access.js";

export function BetaGate() {
  const t = useT();
  const { enabled, setEnabled } = useBeta();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  if (!BETA_AVAILABLE) return null;
  return (
    <div className="beta-entry">
      <button
        className="beta-entry__button"
        onClick={() => {
          if (enabled) setEnabled(false);
          else {
            setCode("");
            setError(false);
            setOpen(true);
          }
        }}
      >
        {t(enabled ? "beta.classic" : "beta.enter")} <span aria-hidden="true">↗</span>
      </button>
      {open && (
        <Modal
          title={t("beta.enter")}
          onClose={() => setOpen(false)}
          initialFocusRef={input}
          scroll
        >
          <p className="beta-gate__intro">{t("beta.gateIntro")}</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!acceptsBetaCode(code)) {
                setError(true);
                input.current?.select();
                return;
              }
              setOpen(false);
              setEnabled(true);
            }}
          >
            <label className="beta-gate__label" htmlFor="beta-code">
              {t("beta.code")}
            </label>
            <input
              ref={input}
              id="beta-code"
              className="beta-gate__input"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={12}
              value={code}
              aria-invalid={error}
              aria-describedby={error ? "beta-code-error" : undefined}
              onChange={(e) => {
                setCode(e.target.value);
                setError(false);
              }}
            />
            {error && (
              <p id="beta-code-error" role="alert">
                {t("beta.wrongCode")}
              </p>
            )}
            <div className="overlay__actions">
              <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
                {t("beta.cancel")}
              </Button>
              <Button variant="roll" type="submit">
                {t("beta.unlock")}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
