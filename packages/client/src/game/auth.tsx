/**
 * Auth state for the whole app. Holds the signed-in account (if any), runs the
 * profile reconciliation on sign-in (merge local progress with the account so
 * nothing is lost), and exposes sign-up / log-in / log-out.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ApiError,
  clearToken,
  fetchMe,
  getToken,
  login as apiLogin,
  pushProfile,
  setToken,
  signup as apiSignup,
  type AccountUser,
  type AuthResult,
} from "../net/auth.js";
import {
  loadProfile,
  mergeProfiles,
  replaceProfile,
  resetProfile,
  type Profile,
} from "./profile.js";

type Status = "loading" | "anon" | "authed";

interface AuthContextValue {
  status: Status;
  user: AccountUser | null;
  /** Whether this server asks new accounts to confirm their email address. */
  verificationRequired: boolean;
  signup: (input: { email: string; username: string; password: string }) => Promise<void>;
  login: (input: { login: string; password: string }) => Promise<void>;
  logout: () => void;
  /** Replace the in-memory user (e.g. after a password reset that returns a session). */
  adopt: (result: AuthResult) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Reconcile local progress with the account's stored profile, keeping the best
 * of both, then adopt the reconciled profile locally and on the server. */
async function reconcileProfile(serverProfile: Profile): Promise<void> {
  const merged = mergeProfiles(loadProfile(), serverProfile);
  replaceProfile(merged);
  try {
    const res = await pushProfile(merged);
    replaceProfile(res.profile); // adopt the authoritative merged copy
  } catch {
    /* offline is fine — local keeps the merged copy until the next sync */
  }
}

/**
 * The last account this browser was signed in as, kept beside the token.
 *
 * The token alone was not enough to show a signed-in app: the account had to be
 * fetched before anything could be rendered, so every launch began signed out
 * and stayed that way until the server answered. On a host that sleeps when
 * idle, that answer can take the best part of a minute — and if it never came,
 * the token was thrown away and the player was asked to log in again. Caching
 * who they are means the session is restored from the device, and the network
 * is only asked to CONTRADICT it.
 */
const ME_KEY = "greed:me";

function cachedUser(): AccountUser | null {
  try {
    const raw = localStorage.getItem(ME_KEY);
    return raw ? (JSON.parse(raw) as AccountUser) : null;
  } catch {
    return null;
  }
}

function rememberUser(user: AccountUser | null): void {
  try {
    if (user) localStorage.setItem(ME_KEY, JSON.stringify(user));
    else localStorage.removeItem(ME_KEY);
  } catch {
    /* ignore storage failures */
  }
}

/**
 * Does this failure mean the session is genuinely no good?
 *
 * Only the server saying so. A network error, a timeout, a cold start, a 500 —
 * none of those are evidence about the token, and treating them as such is what
 * signed people out for having opened the game at the wrong moment.
 */
function sessionRejected(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 401 || err.status === 403);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const restored = getToken() ? cachedUser() : null;
  // Signed in from the first frame when this device already knows who it is.
  const [status, setStatus] = useState<Status>(() =>
    getToken() ? (restored ? "authed" : "loading") : "anon",
  );
  const [user, setUser] = useState<AccountUser | null>(restored);
  // Defaults to false so no verification UI appears until the server says it
  // wants any — the wrong guess in that direction is harmless, the other way
  // round shows people a step that doesn't exist.
  const [verificationRequired, setVerificationRequired] = useState(false);

  // Confirm the session in the background and reconcile the profile. The screen
  // is already usable by now if this device remembered the account.
  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    (async () => {
      try {
        const me = await fetchMe();
        if (cancelled) return;
        setUser(me.user);
        rememberUser(me.user);
        setVerificationRequired(me.verificationRequired ?? false);
        setStatus("authed");
        await reconcileProfile(me.profile);
      } catch (err) {
        if (cancelled) return;
        if (sessionRejected(err)) {
          // The server refused the token: that is a real sign-out.
          clearToken();
          rememberUser(null);
          setUser(null);
          setStatus("anon");
        } else if (!restored) {
          // Couldn't reach the server and nothing to fall back on. The token is
          // KEPT — it is probably fine, and the next launch will try again.
          setStatus("anon");
        }
        // Otherwise: stay signed in as the remembered account. Any call that
        // really needs the server will surface its own error.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const adopt = useCallback(async (result: AuthResult) => {
    setToken(result.token);
    setUser(result.user);
    rememberUser(result.user);
    setStatus("authed");
    await reconcileProfile(result.profile);
  }, []);

  const signup = useCallback(
    async (input: { email: string; username: string; password: string }) => {
      await adopt(await apiSignup(input));
    },
    [adopt],
  );

  const login = useCallback(
    async (input: { login: string; password: string }) => {
      await adopt(await apiLogin(input));
    },
    [adopt],
  );

  const logout = useCallback(() => {
    clearToken();
    rememberUser(null);
    setUser(null);
    setStatus("anon");
    // Take the progress with it. Signing in MERGES whatever is on the device
    // into the account, which is how a guest keeps what they played before
    // signing up — but it also meant the next account created on this device
    // inherited the last one's career. Two people sharing a tablet, or one
    // person making a second account, ended up with the same stats. The
    // account's own copy is safe on the server, so signing back in restores it.
    resetProfile();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, verificationRequired, signup, login, logout, adopt }),
    [status, user, verificationRequired, signup, login, logout, adopt],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
