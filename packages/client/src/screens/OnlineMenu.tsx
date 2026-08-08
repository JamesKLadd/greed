import { useState } from "react";
import type { OnlineController } from "../net/useOnlineGame.js";
import { useT } from "../i18n/i18n.js";

interface OnlineMenuProps {
  net: OnlineController;
  onBack: () => void;
}

const NAME_KEY = "greed-name";

export function OnlineMenu({ net, onBack }: OnlineMenuProps) {
  const t = useT();
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? "");
  const [code, setCode] = useState("");

  const rememberName = () => localStorage.setItem(NAME_KEY, name.trim());
  const displayName = name.trim() || t("common.playerDefault");

  return (
    <div className="setup">
      <div className="setup__hero">
        <h1 className="setup__logo">GREED</h1>
        <p className="setup__tagline">{t("onlineMenu.tagline")}</p>
      </div>

      <div className="setup__panel">
        {net.error && (
          <div className="banner banner--sd online-error" onClick={net.dismissError}>
            {net.error} <span className="online-error__x">✕</span>
          </div>
        )}

        <label className="field">
          <span className="field__label">{t("onlineMenu.yourName")}</span>
          <input
            className="seats-config__name"
            value={name}
            maxLength={16}
            placeholder={t("common.playerDefault")}
            onChange={(e) => setName(e.target.value)}
            onBlur={rememberName}
          />
        </label>

        <div className="online-actions">
          <button
            className="btn btn--roll btn--big"
            onClick={() => {
              rememberName();
              net.quickMatch(displayName);
            }}
          >
            {t("onlineMenu.quickMatch")}
          </button>
          <button
            className="btn btn--bank btn--big"
            onClick={() => {
              rememberName();
              net.createRoom(displayName);
            }}
          >
            {t("onlineMenu.createRoom")}
          </button>
        </div>

        <div className="join-row">
          <input
            className="seats-config__name join-row__code"
            value={code}
            maxLength={4}
            placeholder={t("onlineMenu.roomCodePlaceholder")}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <button
            className="btn"
            disabled={code.length < 4}
            onClick={() => {
              rememberName();
              net.joinRoom(code, displayName);
            }}
          >
            {t("onlineMenu.join")}
          </button>
        </div>

        <div className="setup__actions">
          <button className="btn btn--ghost" onClick={onBack}>
            {t("bar.home")}
          </button>
        </div>
      </div>
    </div>
  );
}
