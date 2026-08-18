/**
 * Auth primitives: password hashing (bcrypt), session tokens (signed JWTs), and
 * single-use email/reset tokens. The JWT is the one identity the whole backend
 * trusts — the HTTP API issues it and the WebSocket server verifies the SAME
 * token to bind an online seat to an account.
 */

import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { createHash, randomBytes } from "node:crypto";
import { accountsEnabled, query } from "./db.js";

const BCRYPT_ROUNDS = 10;
const SESSION_TTL = "30d";

/**
 * Secret for signing sessions.
 *
 * JWT_SECRET if it is set. Failing that, one kept in the database — because the
 * old fallback was a random string generated at boot, and a host that restarts
 * (a free instance going to sleep and waking up, a redeploy) therefore threw
 * every session away with it. Players read that as "the game keeps logging me
 * out", which is exactly what it was doing.
 *
 * The stored secret is written once and then read, so it survives restarts the
 * same way the accounts themselves do. The random per-process value is kept as
 * the last resort for a server with no database at all, where there are no
 * accounts to stay signed in to anyway.
 */
let cachedSecret: Uint8Array | null = null;
const ephemeral = `dev-insecure-secret-${randomBytes(8).toString("hex")}`;

/** Where the secret came from, for the boot log. */
export let secretSource = "not yet resolved";

export async function loadSecret(): Promise<void> {
  if (cachedSecret) return;
  if (process.env.JWT_SECRET) {
    cachedSecret = new TextEncoder().encode(process.env.JWT_SECRET);
    secretSource = "JWT_SECRET";
    return;
  }
  if (accountsEnabled()) {
    try {
      await query(`CREATE TABLE IF NOT EXISTS server_secrets (
         name       text PRIMARY KEY,
         value      text NOT NULL,
         created_at timestamptz NOT NULL DEFAULT now()
       );`);
      // Insert-then-read, so two instances starting at once still agree on one
      // value: whoever loses the race reads the winner's row.
      await query(
        `INSERT INTO server_secrets (name, value) VALUES ('session', $1)
           ON CONFLICT (name) DO NOTHING`,
        [randomBytes(32).toString("hex")],
      );
      const { rows } = await query<{ value: string }>(
        `SELECT value FROM server_secrets WHERE name = 'session'`,
      );
      if (rows[0]) {
        cachedSecret = new TextEncoder().encode(rows[0].value);
        secretSource = "the database (set JWT_SECRET to override)";
        return;
      }
    } catch {
      /* fall through to the ephemeral secret */
    }
  }
  cachedSecret = new TextEncoder().encode(ephemeral);
  secretSource = "a NEW random value — sessions will not survive a restart";
}

function secret(): Uint8Array {
  // Every caller is behind loadSecret() (called at boot), but a lazy fallback
  // means a missed call degrades to the old behaviour instead of throwing.
  if (!cachedSecret) cachedSecret = new TextEncoder().encode(ephemeral);
  return cachedSecret;
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export interface SessionClaims {
  /** User id (JWT subject). */
  sub: string;
  username: string;
}

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ username: claims.username })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(secret());
}

/** Verify a session JWT; returns the claims, or null if invalid/expired. */
export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.sub !== "string" || typeof payload.username !== "string") return null;
    return { sub: payload.sub, username: payload.username };
  } catch {
    return null;
  }
}

/** A fresh single-use token: the raw value goes in the email link; only its hash
 * is stored, so a database leak can't be used to verify/reset accounts. */
export function newSingleUseToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("hex");
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
