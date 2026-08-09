/** Signed-in account overview: identity, verification status, and log out. */

import { useEffect, useState } from "react";
import { useAuth } from "../game/auth.js";
import { ApiError, resendVerification } from "../net/auth.js";
import { useT } from "../i18n/i18n.js";

interface AccountScreenProps {
  onBack: () => void;
}

const RESEND_CD_KEY = "greed:verify-resent-at";
const RESEND_COOLDOWN_MS = 5 * 60 * 1000;

/** Whole seconds left before the verification email may be re-sent (0 when ready). */
function resendCooldownLeft(): number {
  const last = Number(localStorage.getItem(RESEND_CD_KEY) ?? 0);
  return Math.max(0, Math.ceil((last + RESEND_COOLDOWN_MS - Date.now()) / 1000));
}

function formatCountdown(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function AccountScreen({ onBack }: AccountScreenProps) {
  const t = useT();
  const { user, logout } = useAuth();
  const [cooldown, setCooldown] = useState(() => resendCooldownLeft());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Tick the resend cooldown down to zero.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => setCooldown(resendCooldownLeft()), 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  if (!user) {
    return (
      <div className="setup">
        <div className="setup__panel">
          <p>{t("account.notSignedIn")}</p>
          <div className="setup__actions">
            <button className="btn btn--ghost" onClick={onBack}>
              {t("bar.home")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const resend = async () => {
    if (resendCooldownLeft() > 0) return;
    setBusy(true);
    setNotice(null);
    try {
      const { emailSent, alreadyVerified } = await resendVerification();
      if (alreadyVerified) {
        setNotice(t("account.alreadyVerified"));
      } else if (emailSent) {
        setNotice(t("account.resendSent"));
      } else {
        setNotice(t("account.resendNoEmail"));
      }
      // Start the cooldown whenever a real attempt was made.
      if (!alreadyVerified) {
        localStorage.setItem(RESEND_CD_KEY, String(Date.now()));
        setCooldown(resendCooldownLeft());
      }
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : t("account.resendFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="setup">
      <div className="setup__hero">
        <h1 className="setup__logo">GREED</h1>
        <p className="setup__tagline">{t("account.title")}</p>
      </div>

      <div className="setup__panel account">
        <div className="account__id">
          <div className="account__avatar">{user.username.slice(0, 2).toUpperCase()}</div>
          <div>
            <div className="account__name">{user.username}</div>
            <div className="account__email">{user.email}</div>
          </div>
        </div>

        <div className={`account__verify${user.emailVerified ? " account__verify--ok" : ""}`}>
          {user.emailVerified ? t("account.verified") : t("account.unverified")}
        </div>

        {!user.emailVerified && (
          <div className="account__resend">
            <button className="btn" disabled={busy || cooldown > 0} onClick={resend}>
              {busy
                ? t("account.sending")
                : cooldown > 0
                  ? t("account.resendIn", { time: formatCountdown(cooldown) })
                  : t("account.resend")}
            </button>
            {notice && <p className="account__resend-note">{notice}</p>}
          </div>
        )}

        <p className="account__note">{t("account.note", { name: user.username })}</p>

        <div className="setup__actions">
          <button className="btn btn--ghost" onClick={onBack}>
            {t("bar.home")}
          </button>
          <button className="btn btn--bank" onClick={logout}>
            {t("account.logout")}
          </button>
        </div>
      </div>
    </div>
  );
}
