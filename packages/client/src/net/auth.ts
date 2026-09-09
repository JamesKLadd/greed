/**
 * Accounts API client. The REST backend lives on the SAME host as the WebSocket
 * game server (Render), so the HTTP base is derived from SERVER_URL (ws→http,
 * wss→https). The session token is a JWT kept in localStorage and sent both as a
 * Bearer header here and as `auth` on WebSocket room-entry messages.
 */

import { SERVER_URL } from "../game/online.js";
import { loadProfile, type Profile } from "../game/profile.js";

export const API_BASE = SERVER_URL.replace(/^ws/, "http").replace(/\/+$/, "");

const TOKEN_KEY = "greed:auth";

export interface AccountUser {
  id: string;
  email: string;
  username: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface AuthResult {
  token: string;
  user: AccountUser;
  profile: Profile;
  emailSent: boolean;
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/** Thrown for any non-2xx response; `message` is safe to show to the user. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /**
     * A stable id for what went wrong, when the server sent one.
     *
     * `message` is the server's own English. Screens translate the CODE and
     * fall back to the message, so a code this build has no wording for still
     * says something true — which is what a release needs, since the two halves
     * do not deploy together and either can be the newer one.
     */
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Shared fetch wrapper: JSON in/out, bearer auth, and ApiError on failure.
 *  Exported so other API modules (daily, social) get the same handling. */
export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.auth) {
    const token = getToken();
    if (token) headers["authorization"] = `Bearer ${token}`;
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* some responses (204) have no body */
  }
  if (!res.ok) {
    const body = data as { error?: string; code?: string } | null;
    const msg = body?.error ?? "Something went wrong. Please try again.";
    throw new ApiError(res.status, msg, body?.code);
  }
  return data as T;
}

export function signup(input: {
  email: string;
  username: string;
  password: string;
}): Promise<AuthResult> {
  return api<AuthResult>("/api/auth/signup", { body: input });
}

export function login(input: { login: string; password: string }): Promise<AuthResult> {
  return api<AuthResult>("/api/auth/login", { body: input });
}

export function verifyEmail(token: string): Promise<{ verified: boolean }> {
  return api("/api/auth/verify", { body: { token } });
}

export function requestReset(email: string): Promise<{ emailSent: boolean }> {
  return api("/api/auth/request-reset", { body: { email } });
}

export function resetPassword(token: string, password: string): Promise<AuthResult> {
  return api<AuthResult>("/api/auth/reset", { body: { token, password } });
}

export function checkUsername(u: string): Promise<{ available: boolean }> {
  return api(`/api/auth/username-available?u=${encodeURIComponent(u)}`);
}

export function fetchMe(): Promise<{
  user: AccountUser;
  profile: Profile;
  /** Whether the server asks new accounts to confirm their email at all. */
  verificationRequired?: boolean;
}> {
  return api("/api/me", { auth: true });
}

/** Permanently delete the signed-in account. Irreversible; needs the password. */
export function deleteAccount(password: string): Promise<{ deleted: boolean }> {
  return api("/api/me/delete", { method: "POST", auth: true, body: { password } });
}

export function resendVerification(): Promise<{ emailSent: boolean; alreadyVerified: boolean }> {
  return api("/api/auth/resend-verification", { method: "POST", auth: true });
}

export function pushProfile(profile: Profile): Promise<{ profile: Profile }> {
  return api("/api/me/profile", { method: "PUT", body: { profile }, auth: true });
}

/**
 * Fire-and-forget: push the current local profile to the server if signed in.
 * Call after recording a game or equipping a cosmetic so stats follow the account.
 */
export async function syncProfileUp(): Promise<void> {
  if (!getToken()) return;
  try {
    await pushProfile(loadProfile());
  } catch {
    /* best-effort; local profile stays the source of truth until next sync */
  }
}
