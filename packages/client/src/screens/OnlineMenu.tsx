import { useEffect, useState } from "react";
import type { OnlineController } from "../net/useOnlineGame.js";
import { useAuth } from "../game/auth.js";
import { useT } from "../i18n/i18n.js";

interface OnlineMenuProps {
  net: OnlineController;
  onBack: () => void;
}

const NAME_KEY = "greed-name";
const CREATE_CD_KEY = "greed-create-cd";
const CREATE_COOLDOWN_MS = 8000;

/** Whole seconds left before another private room may be created (0 when ready). */
function createCooldownLeft(): number {
  const last = Number(localStorage.getItem(CREATE_CD_KEY) ?? 0);
  return Math.max(0, Math.ceil((last + CREATE_COOLDOWN_MS - Date.now()) / 1000));
}

export function OnlineMenu({ net, onBack }: OnlineMenuProps) {
  const t = useT();
  const { user } = useAuth();
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? "");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(() => createCooldownLeft());
  // Signed-in players always play under their account username.
  const locked = Boolean(user);

  // Tick the create-room cooldown down to zero.
  useEffect(() => {
    const id = window.setInterval(() => setCooldown(createCooldownLeft()), 250);
    return () => window.clearInterval(id);
  }, []);

  const rememberName = () => {
    if (!locked) localStorage.setItem(NAME_KEY, name.trim());
  };
  // When signed in, the server uses the account username regardless of this value,
  // but we send it for a correct pre-connect display.
  const displayName = locked ? user!.username : name.trim() || t("common.playerDefault");

  const createRoom = () => {
    if (createCooldownLeft() > 0) return; // rate-limit spam-creating rooms
    localStorage.setItem(CREATE_CD_KEY, String(Date.now()));
    setCooldown(createCooldownLeft());
    rememberName();
    net.createRoom(displayName);
  };

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
            value={locked ? user!.username : name}
            maxLength={16}
            placeholder={t("common.playerDefault")}
            readOnly={locked}
            onChange={(e) => setName(e.target.value)}
            onBlur={rememberName}
          />
          {locked && <span className="field__hint">Playing as your account username.</span>}
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
          <button className="btn btn--bank btn--big" disabled={cooldown > 0} onClick={createRoom}>
            {cooldown > 0
              ? t("onlineMenu.createWait", { s: cooldown })
              : t("onlineMenu.createRoom")}
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
          <button
            className="btn btn--ghost"
            disabled={code.length < 4}
            title={t("onlineMenu.watchHint")}
            onClick={() => net.spectate(code)}
          >
            {t("onlineMenu.watch")}
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
