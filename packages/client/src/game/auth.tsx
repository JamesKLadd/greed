/**
 * Auth state for the whole app. Holds the signed-in account (if any), runs the
 * profile reconciliation on sign-in (merge local progress with the account so
 * nothing is lost), and exposes sign-up / log-in / log-out.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
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
import { loadProfile, mergeProfiles, replaceProfile, type Profile } from "./profile.js";

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(() => (getToken() ? "loading" : "anon"));
  const [user, setUser] = useState<AccountUser | null>(null);
  // Defaults to false so no verification UI appears until the server says it
  // wants any — the wrong guess in that direction is harmless, the other way
  // round shows people a step that doesn't exist.
  const [verificationRequired, setVerificationRequired] = useState(false);

  // Restore a session on load: validate the token and reconcile the profile.
  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    (async () => {
      try {
        const me = await fetchMe();
        if (cancelled) return;
        setUser(me.user);
        setVerificationRequired(me.verificationRequired ?? false);
        setStatus("authed");
        await reconcileProfile(me.profile);
      } catch {
        if (cancelled) return;
        clearToken();
        setUser(null);
        setStatus("anon");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const adopt = useCallback(async (result: AuthResult) => {
    setToken(result.token);
    setUser(result.user);
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
    setUser(null);
    setStatus("anon");
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
