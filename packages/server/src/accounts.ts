/**
 * Account operations: sign up, log in, verify email, reset password, and the
 * per-user profile (stats / achievements / equipped cosmetics) that syncs across
 * devices. The client still COMPUTES progression locally; the server just stores
 * a Profile snapshot and merges writes MONOTONICALLY (max of cumulative counters,
 * union of achievements) so re-syncing or a second device can never inflate or
 * roll back a stat.
 */

import { hasProfanity } from "@greed/core";
import { query } from "./db.js";
import { hashPassword, hashToken, newSingleUseToken, signSession, verifyPassword } from "./auth.js";
import { sendResetEmail, sendVerifyEmail, emailEnabled, verificationRequired } from "./email.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The stats blob synced per account. Mirrors the client's `Profile`. */
export interface StoredProfile {
  gamesPlayed: number;
  wins: number;
  currentStreak: number;
  bestStreak: number;
  bestTurn: number;
  bestTotal: number;
  totalBanks: number;
  totalBankedPoints: number;
  hotDiceTotal: number;
  achievements: string[];
  dice: string;
  table: string;
  /** Optional so profiles stored before avatars existed still normalize. */
  avatar?: string;
}

export interface PublicUser {
  id: string;
  email: string;
  username: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface AuthResult {
  token: string;
  user: PublicUser;
  profile: StoredProfile;
  /** Whether a verification email was actually delivered (vs. logged in dev). */
  emailSent: boolean;
}

interface UserRow {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  email_verified: boolean;
  profile: Partial<StoredProfile> | null;
  created_at: Date;
}

/** A validation / conflict failure the HTTP layer maps to a status code. */
export class AccountError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AccountError";
  }
}

// ---------------------------------------------------------------------------
// Profile helpers
// ---------------------------------------------------------------------------

export function emptyProfile(): StoredProfile {
  return {
    gamesPlayed: 0,
    wins: 0,
    currentStreak: 0,
    bestStreak: 0,
    bestTurn: 0,
    bestTotal: 0,
    totalBanks: 0,
    totalBankedPoints: 0,
    hotDiceTotal: 0,
    achievements: [],
    dice: "ivory",
    table: "classic",
    avatar: "",
  };
}

function normalizeProfile(raw: Partial<StoredProfile> | null): StoredProfile {
  const base = emptyProfile();
  if (!raw || typeof raw !== "object") return base;
  return {
    ...base,
    ...raw,
    achievements: Array.isArray(raw.achievements)
      ? raw.achievements.filter((a): a is string => typeof a === "string")
      : [],
  };
}

/** Merge an incoming snapshot into the stored one without ever losing progress:
 * cumulative counters and bests take the maximum; achievements union; the live
 * streak and equipped cosmetics take the incoming (most recent) value. */
export function mergeProfile(existing: StoredProfile, incoming: StoredProfile): StoredProfile {
  const max = (a: number, b: number) => Math.max(a || 0, b || 0);
  return {
    gamesPlayed: max(existing.gamesPlayed, incoming.gamesPlayed),
    wins: max(existing.wins, incoming.wins),
    currentStreak: incoming.currentStreak ?? existing.currentStreak,
    bestStreak: max(existing.bestStreak, incoming.bestStreak),
    bestTurn: max(existing.bestTurn, incoming.bestTurn),
    bestTotal: max(existing.bestTotal, incoming.bestTotal),
    totalBanks: max(existing.totalBanks, incoming.totalBanks),
    totalBankedPoints: max(existing.totalBankedPoints, incoming.totalBankedPoints),
    hotDiceTotal: max(existing.hotDiceTotal, incoming.hotDiceTotal),
    achievements: [...new Set([...existing.achievements, ...incoming.achievements])],
    dice: incoming.dice || existing.dice,
    table: incoming.table || existing.table,
    avatar: incoming.avatar || existing.avatar || "",
  };
}

function publicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    emailVerified: row.email_verified,
    createdAt: row.created_at.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,14}[a-zA-Z0-9]$/; // 3–16 chars

export function normalizeEmail(email: unknown): string {
  if (typeof email !== "string" || !EMAIL_RE.test(email.trim()) || email.length > 254) {
    throw new AccountError(400, "Enter a valid email address.");
  }
  return email.trim().toLowerCase();
}

export function validateUsername(username: unknown): string {
  if (typeof username !== "string") throw new AccountError(400, "Enter a username.");
  const u = username.trim();
  if (!USERNAME_RE.test(u)) {
    throw new AccountError(
      400,
      "Username must be 3–16 characters: letters, numbers, hyphen or underscore.",
    );
  }
  if (hasProfanity(u)) throw new AccountError(400, "Please choose a different username.");
  return u;
}

function validatePassword(password: unknown): string {
  if (typeof password !== "string" || password.length < 8) {
    throw new AccountError(400, "Password must be at least 8 characters.");
  }
  if (password.length > 200) throw new AccountError(400, "Password is too long.");
  return password;
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const RESET_TTL_MS = 60 * 60 * 1000; // 1h

function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:5173").replace(/\/+$/, "");
}

async function findByEmailOrUsername(login: string): Promise<UserRow | null> {
  const { rows } = await query<UserRow>(
    `SELECT * FROM users WHERE lower(email) = lower($1) OR lower(username) = lower($1) LIMIT 1`,
    [login],
  );
  return rows[0] ?? null;
}

/** Is this username free? (Used by the live availability check on signup.) */
export async function usernameAvailable(username: string): Promise<boolean> {
  const u = validateUsername(username);
  const { rows } = await query(`SELECT 1 FROM users WHERE lower(username) = lower($1) LIMIT 1`, [
    u,
  ]);
  return rows.length === 0;
}

async function issueVerifyToken(userId: string): Promise<string> {
  const { raw, hash } = newSingleUseToken();
  await query(
    `INSERT INTO auth_tokens (token_hash, user_id, kind, expires_at) VALUES ($1, $2, 'verify', $3)`,
    [hash, userId, new Date(Date.now() + VERIFY_TTL_MS)],
  );
  return raw;
}

export async function signup(input: {
  email: unknown;
  username: unknown;
  password: unknown;
}): Promise<AuthResult> {
  const email = normalizeEmail(input.email);
  const username = validateUsername(input.username);
  const password = validatePassword(input.password);

  // Pre-check for friendlier errors than a raw unique-constraint violation.
  const existing = await query(
    `SELECT lower(email) = $1 AS email_taken, lower(username) = lower($2) AS name_taken
       FROM users WHERE lower(email) = $1 OR lower(username) = lower($2)`,
    [email, username],
  );
  for (const r of existing.rows as { email_taken: boolean; name_taken: boolean }[]) {
    if (r.email_taken) throw new AccountError(409, "An account with that email already exists.");
    if (r.name_taken) throw new AccountError(409, "That username is taken.");
  }

  const passwordHash = await hashPassword(password);
  // With verification switched off there is no way for anyone to ever confirm an
  // address, so accounts start verified rather than stranded in a state that
  // can't be left. Turning verification back on only affects accounts made after.
  const startsVerified = !verificationRequired();
  let rows: UserRow[];
  try {
    ({ rows } = await query<UserRow>(
      `INSERT INTO users (email, username, password_hash, profile, email_verified)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [email, username, passwordHash, JSON.stringify(emptyProfile()), startsVerified],
    ));
  } catch (err) {
    // Lost a race against a concurrent signup on the unique index.
    if ((err as { code?: string }).code === "23505") {
      throw new AccountError(409, "That email or username is already taken.");
    }
    throw err;
  }
  const user = rows[0];

  if (verificationRequired()) {
    const rawToken = await issueVerifyToken(user.id);
    await sendVerifyEmail(user.email, user.username, `${appUrl()}/?verify=${rawToken}`);
  }

  return {
    token: await signSession({ sub: user.id, username: user.username }),
    user: publicUser(user),
    profile: normalizeProfile(user.profile),
    emailSent: verificationRequired() && emailEnabled(),
  };
}

export async function login(input: { login: unknown; password: unknown }): Promise<AuthResult> {
  if (typeof input.login !== "string" || typeof input.password !== "string") {
    throw new AccountError(400, "Enter your email/username and password.");
  }
  const user = await findByEmailOrUsername(input.login.trim());
  const ok = user ? await verifyPassword(input.password, user.password_hash) : false;
  if (!user || !ok) throw new AccountError(401, "Incorrect email/username or password.");

  return {
    token: await signSession({ sub: user.id, username: user.username }),
    user: publicUser(user),
    profile: normalizeProfile(user.profile),
    emailSent: false,
  };
}

/** Confirm an email-verification token. Returns true if it verified an account. */
export async function verifyEmail(rawToken: unknown): Promise<boolean> {
  if (typeof rawToken !== "string" || !rawToken) return false;
  const { rows } = await query<{ user_id: string }>(
    `DELETE FROM auth_tokens
       WHERE token_hash = $1 AND kind = 'verify' AND expires_at > now()
       RETURNING user_id`,
    [hashToken(rawToken)],
  );
  if (rows.length === 0) return false;
  await query(`UPDATE users SET email_verified = true, updated_at = now() WHERE id = $1`, [
    rows[0].user_id,
  ]);
  return true;
}

/** Re-issue and send a verification email for the signed-in user. No-op (with a
 * flag) if the account is already verified. */
export async function resendVerification(
  userId: string,
): Promise<{ emailSent: boolean; alreadyVerified: boolean }> {
  const { rows } = await query<UserRow>(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [userId]);
  const user = rows[0];
  if (!user) throw new AccountError(404, "Account not found.");
  // Nothing to confirm when verification is switched off.
  if (!verificationRequired()) return { emailSent: false, alreadyVerified: true };
  if (user.email_verified) return { emailSent: false, alreadyVerified: true };
  // Drop any outstanding verify tokens so only the newest link works.
  await query(`DELETE FROM auth_tokens WHERE user_id = $1 AND kind = 'verify'`, [user.id]);
  const raw = await issueVerifyToken(user.id);
  await sendVerifyEmail(user.email, user.username, `${appUrl()}/?verify=${raw}`);
  return { emailSent: emailEnabled(), alreadyVerified: false };
}

/** Start a password reset. Always resolves (never reveals whether the email
 * exists); sends a reset link only when the account is real. */
export async function requestReset(email: unknown): Promise<{ emailSent: boolean }> {
  let normalized: string;
  try {
    normalized = normalizeEmail(email);
  } catch {
    return { emailSent: false };
  }
  const { rows } = await query<UserRow>(`SELECT * FROM users WHERE lower(email) = $1 LIMIT 1`, [
    normalized,
  ]);
  const user = rows[0];
  if (user) {
    const { raw, hash } = newSingleUseToken();
    await query(
      `INSERT INTO auth_tokens (token_hash, user_id, kind, expires_at) VALUES ($1, $2, 'reset', $3)`,
      [hash, user.id, new Date(Date.now() + RESET_TTL_MS)],
    );
    await sendResetEmail(user.email, user.username, `${appUrl()}/?reset=${raw}`);
  }
  return { emailSent: emailEnabled() };
}

/** Complete a password reset with a valid token. */
export async function resetPassword(rawToken: unknown, newPassword: unknown): Promise<AuthResult> {
  const password = validatePassword(newPassword);
  if (typeof rawToken !== "string" || !rawToken) {
    throw new AccountError(400, "This reset link is invalid or has expired.");
  }
  const { rows } = await query<{ user_id: string }>(
    `DELETE FROM auth_tokens
       WHERE token_hash = $1 AND kind = 'reset' AND expires_at > now()
       RETURNING user_id`,
    [hashToken(rawToken)],
  );
  if (rows.length === 0) {
    throw new AccountError(400, "This reset link is invalid or has expired.");
  }
  const userId = rows[0].user_id;
  const passwordHash = await hashPassword(password);
  const updated = await query<UserRow>(
    `UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2 RETURNING *`,
    [passwordHash, userId],
  );
  // Invalidate any other outstanding reset tokens for this user.
  await query(`DELETE FROM auth_tokens WHERE user_id = $1 AND kind = 'reset'`, [userId]);
  const user = updated.rows[0];
  return {
    token: await signSession({ sub: user.id, username: user.username }),
    user: publicUser(user),
    profile: normalizeProfile(user.profile),
    emailSent: false,
  };
}

export async function getAccount(
  userId: string,
): Promise<{ user: PublicUser; profile: StoredProfile } | null> {
  const { rows } = await query<UserRow>(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [userId]);
  const user = rows[0];
  if (!user) return null;
  return { user: publicUser(user), profile: normalizeProfile(user.profile) };
}

/**
 * Permanently delete an account.
 *
 * The password is re-checked even though the caller already holds a valid
 * session: a session can be a borrowed phone or a tab left open, and this is
 * the one action with nothing to undo it. Everything the account owns goes with
 * it — every table referencing users(id) does so ON DELETE CASCADE, so the
 * single statement below also takes the auth tokens, daily-challenge runs and
 * friendships (in both directions).
 *
 * Local device stats are deliberately NOT touched: they live in the browser,
 * they predate the account, and destroying them was not what was asked for.
 */
export async function deleteAccount(userId: string, password: unknown): Promise<void> {
  if (typeof password !== "string" || password.length === 0) {
    throw new AccountError(400, "Enter your password to delete your account.");
  }
  const { rows } = await query<UserRow>(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [userId]);
  const user = rows[0];
  if (!user) throw new AccountError(404, "Account not found.");
  if (!(await verifyPassword(password, user.password_hash))) {
    throw new AccountError(401, "That password is incorrect.");
  }
  await query(`DELETE FROM users WHERE id = $1`, [userId]);
}

/** Store a profile snapshot for a user, merged monotonically with what's saved. */
export async function saveProfile(
  userId: string,
  incoming: Partial<StoredProfile> | null,
): Promise<StoredProfile> {
  const { rows } = await query<{ profile: Partial<StoredProfile> | null }>(
    `SELECT profile FROM users WHERE id = $1 LIMIT 1`,
    [userId],
  );
  if (rows.length === 0) throw new AccountError(404, "Account not found.");
  const merged = mergeProfile(normalizeProfile(rows[0].profile), normalizeProfile(incoming));
  await query(`UPDATE users SET profile = $1, updated_at = now() WHERE id = $2`, [
    JSON.stringify(merged),
    userId,
  ]);
  return merged;
}
