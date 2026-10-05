/**
 * Account entry: sign up, log in, request a password reset, or set a new password
 * from a reset link. One screen with a few modes to keep the flows together.
 */

import { useEffect, useRef, useState } from "react";
import { useAuth } from "../game/auth.js";
import { useT } from "../i18n/i18n.js";
import { apiErrorText } from "../i18n/apiError.js";
import {
  ApiError,
  checkUsername,
  requestReset,
  resetPassword,
  type AuthResult,
} from "../net/auth.js";
import { Button, Icon, Screen, TextField } from "../ui/index.js";

type Mode = "login" | "signup" | "forgot" | "reset";

interface AuthScreenProps {
  onDone: () => void;
  onBack: () => void;
  initialMode?: Mode;
  /** Present when the user arrived from a password-reset email link. */
  resetToken?: string;
  contextHint?: string;
}

export function AuthScreen({
  onDone,
  onBack,
  initialMode = "login",
  resetToken,
  contextHint,
}: AuthScreenProps) {
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
      setError(apiErrorText(t, err, "auth.errorGeneric"));
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

  const canSubmit =
    !busy &&
    (mode === "login"
      ? Boolean(loginId.trim() && password)
      : mode === "signup"
        ? Boolean(email.trim() && username.trim().length >= 3 && password.length >= 8)
        : mode === "forgot"
          ? Boolean(email.trim())
          : password.length >= 8);

  const submit = () => {
    // The keyboard uses the same readiness rules as the visible submit button.
    if (!canSubmit) return;
    if (mode === "login") void submitLogin();
    else if (mode === "signup") void submitSignup();
    else if (mode === "forgot") void submitForgot();
    else void submitReset();
  };

  return (
    <Screen
      className="support-screen"
      panelClassName="support-panel support-auth auth"
      hero={false}
      actions={
        <Button variant="ghost" onClick={onBack} disabled={busy}>
          {t("auth.back")}
        </Button>
      }
    >
      <header className="support-panel__heading">
        <h1>{title}</h1>
        <p className="support-panel__intro">{t("auth.tagline")}</p>
        {contextHint && <p className="growth-invite">{contextHint}</p>}
      </header>

      {error && (
        <div className="support-auth__message support-auth__message--error" role="alert">
          <span>{error}</span>
          <Button
            size="icon"
            variant="ghost"
            aria-label={t("common.close")}
            onClick={() => setError(null)}
          >
            <Icon name="close" />
          </Button>
        </div>
      )}
      {notice && (
        <div className="support-auth__message auth__notice" role="status">
          {notice}
        </div>
      )}

      <form
        className="support-auth__form"
        aria-busy={busy}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {mode === "login" && (
          <>
            <TextField
              label={t("auth.loginId")}
              value={loginId}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={busy}
              required
              onChange={(e) => setLoginId(e.target.value)}
            />
            <TextField
              label={t("auth.password")}
              type="password"
              value={password}
              autoComplete="current-password"
              disabled={busy}
              required
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="submit" variant="roll" size="lg" disabled={!canSubmit}>
              {busy ? t("auth.working") : t("auth.login")}
            </Button>
            <div className="auth__links">
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => switchMode("forgot")}
              >
                {t("auth.forgotLink")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => switchMode("signup")}
              >
                {t("auth.createLink")}
              </Button>
            </div>
          </>
        )}

        {mode === "signup" && (
          <>
            <TextField
              label={t("auth.email")}
              type="email"
              value={email}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              disabled={busy}
              required
              onChange={(e) => setEmail(e.target.value)}
            />
            <TextField
              label={t("auth.username")}
              hint={
                <span role="status" aria-live="polite">
                  {t("auth.usernameHint")}
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
              }
              value={username}
              maxLength={16}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={busy}
              required
              onChange={(e) => setUsername(e.target.value)}
            />
            <TextField
              label={t("auth.password")}
              hint={t("auth.passwordHint")}
              type="password"
              value={password}
              autoComplete="new-password"
              disabled={busy}
              required
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="submit" variant="roll" size="lg" disabled={!canSubmit}>
              {busy ? t("auth.working") : t("auth.signup")}
            </Button>
            <div className="auth__links">
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => switchMode("login")}
              >
                {t("auth.haveAccount")}
              </Button>
            </div>
          </>
        )}

        {mode === "forgot" && (
          <>
            <TextField
              label={t("auth.email")}
              type="email"
              value={email}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              disabled={busy}
              required
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button type="submit" variant="roll" size="lg" disabled={!canSubmit}>
              {busy ? t("auth.working") : t("auth.sendReset")}
            </Button>
            <div className="auth__links">
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => switchMode("login")}
              >
                {t("auth.backToLogin")}
              </Button>
            </div>
          </>
        )}

        {mode === "reset" && (
          <>
            <TextField
              label={t("auth.newPassword")}
              hint={t("auth.passwordHint")}
              type="password"
              value={password}
              autoComplete="new-password"
              disabled={busy}
              required
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="submit" variant="roll" size="lg" disabled={!canSubmit}>
              {busy ? t("auth.working") : t("auth.setPassword")}
            </Button>
          </>
        )}
      </form>
    </Screen>
  );
}
