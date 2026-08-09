/**
 * Account entry: sign up, log in, request a password reset, or set a new password
 * from a reset link. One screen with a few modes to keep the flows together.
 * (English-only for now; i18n of these strings is a follow-up.)
 */

import { useEffect, useRef, useState } from "react";
import { useAuth } from "../game/auth.js";
import {
  ApiError,
  checkUsername,
  requestReset,
  resetPassword,
  type AuthResult,
} from "../net/auth.js";

type Mode = "login" | "signup" | "forgot" | "reset";

interface AuthScreenProps {
  onDone: () => void;
  onBack: () => void;
  initialMode?: Mode;
  /** Present when the user arrived from a password-reset email link. */
  resetToken?: string;
}

export function AuthScreen({ onDone, onBack, initialMode = "login", resetToken }: AuthScreenProps) {
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
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
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
      if (nameFree === "taken") throw new ApiError(409, "That username is taken.");
      await auth.signup({ email: email.trim(), username: username.trim(), password });
      onDone();
    });

  const submitForgot = () =>
    run(async () => {
      const { emailSent } = await requestReset(email.trim());
      setNotice(
        emailSent
          ? "If that email has an account, a reset link is on its way. Check your inbox."
          : "Reset requested. (Email delivery isn't configured yet on this server.)",
      );
    });

  const submitReset = () =>
    run(async () => {
      const result: AuthResult = await resetPassword(resetToken ?? "", password);
      await auth.adopt(result);
      onDone();
    });

  const title =
    mode === "login"
      ? "Log in"
      : mode === "signup"
        ? "Create account"
        : mode === "forgot"
          ? "Reset password"
          : "Set a new password";

  return (
    <div className="setup">
      <div className="setup__hero">
        <h1 className="setup__logo">GREED</h1>
        <p className="setup__tagline">Your stats, achievements & locker — on every device.</p>
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
              <span className="field__label">Email or username</span>
              <input
                className="seats-config__name"
                value={loginId}
                autoComplete="username"
                onChange={(e) => setLoginId(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field__label">Password</span>
              <input
                className="seats-config__name"
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitLogin()}
              />
            </label>
            <button
              className="btn btn--roll btn--big"
              disabled={busy || !loginId.trim() || !password}
              onClick={submitLogin}
            >
              {busy ? "…" : "Log in"}
            </button>
            <div className="auth__links">
              <button className="btn btn--ghost" onClick={() => switchMode("forgot")}>
                Forgot password?
              </button>
              <button className="btn btn--ghost" onClick={() => switchMode("signup")}>
                Create an account
              </button>
            </div>
          </>
        )}

        {mode === "signup" && (
          <>
            <label className="field">
              <span className="field__label">Email</span>
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
                Username
                {nameFree === "checking" && <span className="auth__hint"> checking…</span>}
                {nameFree === "free" && (
                  <span className="auth__hint auth__hint--ok"> ✓ available</span>
                )}
                {nameFree === "taken" && (
                  <span className="auth__hint auth__hint--bad"> ✕ taken</span>
                )}
              </span>
              <input
                className="seats-config__name"
                value={username}
                maxLength={16}
                autoComplete="off"
                placeholder="3–16 characters"
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field__label">Password</span>
              <input
                className="seats-config__name"
                type="password"
                value={password}
                autoComplete="new-password"
                placeholder="at least 8 characters"
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button
              className="btn btn--roll btn--big"
              disabled={busy || !email.trim() || username.trim().length < 3 || password.length < 8}
              onClick={submitSignup}
            >
              {busy ? "…" : "Create account"}
            </button>
            <div className="auth__links">
              <button className="btn btn--ghost" onClick={() => switchMode("login")}>
                I already have an account
              </button>
            </div>
          </>
        )}

        {mode === "forgot" && (
          <>
            <label className="field">
              <span className="field__label">Email</span>
              <input
                className="seats-config__name"
                type="email"
                value={email}
                autoComplete="email"
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitForgot()}
              />
            </label>
            <button
              className="btn btn--roll btn--big"
              disabled={busy || !email.trim()}
              onClick={submitForgot}
            >
              {busy ? "…" : "Send reset link"}
            </button>
            <div className="auth__links">
              <button className="btn btn--ghost" onClick={() => switchMode("login")}>
                Back to log in
              </button>
            </div>
          </>
        )}

        {mode === "reset" && (
          <>
            <label className="field">
              <span className="field__label">New password</span>
              <input
                className="seats-config__name"
                type="password"
                value={password}
                autoComplete="new-password"
                placeholder="at least 8 characters"
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitReset()}
              />
            </label>
            <button
              className="btn btn--roll btn--big"
              disabled={busy || password.length < 8}
              onClick={submitReset}
            >
              {busy ? "…" : "Set password & log in"}
            </button>
          </>
        )}

        <div className="setup__actions">
          <button className="btn btn--ghost" onClick={onBack}>
            ← Back
          </button>
        </div>
      </div>
    </div>
  );
}
