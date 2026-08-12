/**
 * Account entry: sign up, log in, request a password reset, or set a new password
 * from a reset link. One screen with a few modes to keep the flows together.
 */

import { useEffect, useRef, useState } from "react";
import { useAuth } from "../game/auth.js";
import { useT } from "../i18n/i18n.js";
import {
  ApiError,
  checkUsername,
  requestReset,
  resetPassword,
  type AuthResult,
} from "../net/auth.js";
import { Button } from "../ui/index.js";

type Mode = "login" | "signup" | "forgot" | "reset";

interface AuthScreenProps {
  onDone: () => void;
  onBack: () => void;
  initialMode?: Mode;
  /** Present when the user arrived from a password-reset email link. */
  resetToken?: string;
}

export function AuthScreen({ onDone, onBack, initialMode = "login", resetToken }: AuthScreenProps) {
  const t = useT();
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>(resetToken ? "reset" : initialMode);
  const [email, setEmail] = useState("");
  const [loginId, setLoginId] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [nameFree, setNameFree] = useState<"unknown" | "checking" | "free" | "taken">("unknown");

  // Debounced username-availability check while signing up.
  const nameTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (mode !== "signup") return;
    const u = username.trim();
    setNameFree("unknown");
    if (u.length < 3) return;
    setNameFree("checking");
    window.clearTimeout(nameTimer.current);
    nameTimer.current = window.setTimeout(async () => {
      try {
        const { available } = await checkUsername(u);
        setNameFree(available ? "free" : "taken");
      } catch {
        setNameFree("unknown");
      }
    }, 400);
    return () => window.clearTimeout(nameTimer.current);
  }, [username, mode]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setNotice(null);
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("auth.errorGeneric"));
    } finally {
      setBusy(false);
    }
  };

  const submitLogin = () =>
    run(async () => {
      await auth.login({ login: loginId.trim(), password });
      onDone();
    });

  const submitSignup = () =>
    run(async () => {
      if (nameFree === "taken") throw new ApiError(409, t("auth.usernameTaken"));
      await auth.signup({ email: email.trim(), username: username.trim(), password });
      onDone();
    });

  const submitForgot = () =>
    run(async () => {
      const { emailSent } = await requestReset(email.trim());
      setNotice(emailSent ? t("auth.resetSent") : t("auth.resetNoEmail"));
    });

  const submitReset = () =>
    run(async () => {
      const result: AuthResult = await resetPassword(resetToken ?? "", password);
      await auth.adopt(result);
      onDone();
    });

  const title =
    mode === "login"
      ? t("auth.login")
      : mode === "signup"
        ? t("auth.signup")
        : mode === "forgot"
          ? t("auth.forgot")
          : t("auth.reset");

  return (
    <div className="setup">
      <div className="setup__hero">
        <h1 className="setup__logo">GREED</h1>
        <p className="setup__tagline">{t("auth.tagline")}</p>
      </div>

      <div className="setup__panel auth">
        <h2 className="auth__title">{title}</h2>

        {error && (
          <div className="banner banner--sd online-error" onClick={() => setError(null)}>
            {error} <span className="online-error__x">✕</span>
          </div>
        )}
        {notice && <div className="banner auth__notice">{notice}</div>}

        {mode === "login" && (
          <>
            <label className="field">
              <span className="field__label">{t("auth.loginId")}</span>
              <input
                className="seats-config__name"
                value={loginId}
                autoComplete="username"
                onChange={(e) => setLoginId(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field__label">{t("auth.password")}</span>
              <input
                className="seats-config__name"
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitLogin()}
              />
            </label>
            <Button
              variant="roll"
              size="lg"
              disabled={busy || !loginId.trim() || !password}
              onClick={submitLogin}
            >
              {busy ? t("auth.working") : t("auth.login")}
            </Button>
            <div className="auth__links">
              <Button variant="ghost" onClick={() => switchMode("forgot")}>
                {t("auth.forgotLink")}
              </Button>
              <Button variant="ghost" onClick={() => switchMode("signup")}>
                {t("auth.createLink")}
              </Button>
            </div>
          </>
        )}

        {mode === "signup" && (
          <>
            <label className="field">
              <span className="field__label">{t("auth.email")}</span>
              <input
                className="seats-config__name"
                type="email"
                value={email}
                autoComplete="email"
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field__label">
                {t("auth.username")}
                {nameFree === "checking" && (
                  <span className="auth__hint"> {t("auth.checking")}</span>
                )}
                {nameFree === "free" && (
                  <span className="auth__hint auth__hint--ok"> ✓ {t("auth.available")}</span>
                )}
                {nameFree === "taken" && (
                  <span className="auth__hint auth__hint--bad"> ✕ {t("auth.taken")}</span>
                )}
              </span>
              <input
                className="seats-config__name"
                value={username}
                maxLength={16}
                autoComplete="off"
                placeholder={t("auth.usernameHint")}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field__label">{t("auth.password")}</span>
              <input
                className="seats-config__name"
                type="password"
                value={password}
                autoComplete="new-password"
                placeholder={t("auth.passwordHint")}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <Button
              variant="roll"
              size="lg"
              disabled={busy || !email.trim() || username.trim().length < 3 || password.length < 8}
              onClick={submitSignup}
            >
              {busy ? t("auth.working") : t("auth.signup")}
            </Button>
            <div className="auth__links">
              <Button variant="ghost" onClick={() => switchMode("login")}>
                {t("auth.haveAccount")}
              </Button>
            </div>
          </>
        )}

        {mode === "forgot" && (
          <>
            <label className="field">
              <span className="field__label">{t("auth.email")}</span>
              <input
                className="seats-config__name"
                type="email"
                value={email}
                autoComplete="email"
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitForgot()}
              />
            </label>
            <Button
              variant="roll"
              size="lg"
              disabled={busy || !email.trim()}
              onClick={submitForgot}
            >
              {busy ? t("auth.working") : t("auth.sendReset")}
            </Button>
            <div className="auth__links">
              <Button variant="ghost" onClick={() => switchMode("login")}>
                {t("auth.backToLogin")}
              </Button>
            </div>
          </>
        )}

        {mode === "reset" && (
          <>
            <label className="field">
              <span className="field__label">{t("auth.newPassword")}</span>
              <input
                className="seats-config__name"
                type="password"
                value={password}
                autoComplete="new-password"
                placeholder={t("auth.passwordHint")}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitReset()}
              />
            </label>
            <Button
              variant="roll"
              size="lg"
              disabled={busy || password.length < 8}
              onClick={submitReset}
            >
              {busy ? t("auth.working") : t("auth.setPassword")}
            </Button>
          </>
        )}

        <div className="setup__actions">
          <Button variant="ghost" onClick={onBack}>
            {t("auth.back")}
          </Button>
        </div>
      </div>
    </div>
  );
}
