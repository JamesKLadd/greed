/**
 * Auth primitives: password hashing (bcrypt), session tokens (signed JWTs), and
 * single-use email/reset tokens. The JWT is the one identity the whole backend
 * trusts — the HTTP API issues it and the WebSocket server verifies the SAME
 * token to bind an online seat to an account.
 */

import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { createHash, randomBytes } from "node:crypto";

const BCRYPT_ROUNDS = 10;
const SESSION_TTL = "30d";

/** Secret for signing sessions. Falls back to an ephemeral dev secret (a warning
 * is logged at boot); production MUST set JWT_SECRET so tokens survive restarts. */
let cachedSecret: Uint8Array | null = null;
function secret(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  const raw = process.env.JWT_SECRET || `dev-insecure-secret-${randomBytes(8).toString("hex")}`;
  cachedSecret = new TextEncoder().encode(raw);
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
