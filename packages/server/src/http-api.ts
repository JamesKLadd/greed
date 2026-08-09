/**
 * REST API for accounts, served on the SAME HTTP server as the WebSocket game
 * traffic. Everything lives under `/api/`; `handleApi` returns true when it has
 * taken responsibility for a request so the bootstrap can fall through to the
 * health endpoint otherwise.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { accountsEnabled } from "./db.js";
import { verifySession } from "./auth.js";
import { clientKey, rateLimit } from "./rate-limit.js";
import { dailyStatus, submitDailyRun } from "./daily.js";
import { acceptFriend, friendsView, publicProfile, removeFriend, requestFriend } from "./social.js";
import {
  AccountError,
  getAccount,
  login,
  requestReset,
  resendVerification,
  resetPassword,
  saveProfile,
  signup,
  usernameAvailable,
  verifyEmail,
} from "./accounts.js";

const MAX_BODY = 64 * 1024; // 64 KB is plenty for auth payloads.

/** Origins allowed to call the API from a browser. */
function allowedOrigin(origin: string | undefined): string | null {
  if (!origin) return null;
  const list = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const defaults = [process.env.APP_URL, "http://localhost:5173", "http://localhost:4173"].filter(
    (s): s is string => Boolean(s),
  );
  const allow = [...defaults, ...list];
  if (allow.includes(origin)) return origin;
  // Any Vercel preview/production URL for this app.
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) return origin;
  return null;
}

function cors(req: IncomingMessage, res: ServerResponse): void {
  const origin = allowedOrigin(req.headers.origin);
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(payload);
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new AccountError(413, "Request too large."));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new AccountError(400, "Malformed JSON body."));
      }
    });
    req.on("error", reject);
  });
}

/** Extract and verify the bearer session; throws 401 when missing/invalid. */
async function requireUser(req: IncomingMessage): Promise<{ id: string; username: string }> {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const claims = token ? await verifySession(token) : null;
  if (!claims) throw new AccountError(401, "Please log in again.");
  return { id: claims.sub, username: claims.username };
}

/**
 * Handle an API request. Returns true if the request was under `/api/` (and thus
 * fully handled here), false to let the caller serve something else.
 */
export async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/api/")) return false;

  cors(req, res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }

  if (!accountsEnabled()) {
    json(res, 503, { error: "Accounts are not available on this server." });
    return true;
  }

  const path = url.pathname;
  const method = req.method ?? "GET";

  // Throttle the endpoints worth attacking: credential guessing on login, mass
  // account creation on signup, and mail-flooding via the reset/resend flows.
  // Generous enough that a real person retyping a password never notices.
  const LIMITS: Record<string, { limit: number; windowMs: number }> = {
    "/api/auth/login": { limit: 10, windowMs: 5 * 60_000 },
    "/api/auth/signup": { limit: 5, windowMs: 60 * 60_000 },
    "/api/auth/request-reset": { limit: 5, windowMs: 60 * 60_000 },
    "/api/auth/resend-verification": { limit: 5, windowMs: 60 * 60_000 },
    "/api/auth/reset": { limit: 10, windowMs: 60 * 60_000 },
    // A GET, but still worth capping: it's the natural username-enumeration
    // endpoint. High enough that the debounced check while typing never trips.
    "/api/auth/username-available": { limit: 120, windowMs: 60_000 },
    // One legitimate run exists per day; this only stops replay hammering.
    "/api/daily/run": { limit: 20, windowMs: 60 * 60_000 },
    // Friend requests are the one social action that reaches another person,
    // so cap them; browsing profiles and lists is unrestricted.
    "/api/friends/request": { limit: 30, windowMs: 60 * 60_000 },
  };
  const rule = LIMITS[path];
  if (rule) {
    const hit = rateLimit(
      path,
      clientKey(req.headers, req.socket.remoteAddress ?? ""),
      rule.limit,
      rule.windowMs,
    );
    if (!hit.allowed) {
      res.setHeader("Retry-After", String(hit.retryAfter));
      json(res, 429, { error: "Too many attempts. Please wait a moment and try again." });
      return true;
    }
  }

  try {
    if (method === "POST" && path === "/api/auth/signup") {
      const b = (await readBody(req)) as Record<string, unknown>;
      json(res, 201, await signup({ email: b.email, username: b.username, password: b.password }));
    } else if (method === "POST" && path === "/api/auth/login") {
      const b = (await readBody(req)) as Record<string, unknown>;
      json(res, 200, await login({ login: b.login, password: b.password }));
    } else if (method === "POST" && path === "/api/auth/verify") {
      const b = (await readBody(req)) as Record<string, unknown>;
      json(res, 200, { verified: await verifyEmail(b.token) });
    } else if (method === "POST" && path === "/api/auth/request-reset") {
      const b = (await readBody(req)) as Record<string, unknown>;
      json(res, 200, await requestReset(b.email));
    } else if (method === "POST" && path === "/api/auth/reset") {
      const b = (await readBody(req)) as Record<string, unknown>;
      json(res, 200, await resetPassword(b.token, b.password));
    } else if (method === "GET" && path === "/api/auth/username-available") {
      const u = url.searchParams.get("u") ?? "";
      let available = false;
      try {
        available = await usernameAvailable(u);
      } catch {
        available = false; // invalid usernames simply aren't "available"
      }
      json(res, 200, { available });
    } else if (method === "POST" && path === "/api/auth/resend-verification") {
      const { id } = await requireUser(req);
      json(res, 200, await resendVerification(id));
    } else if (method === "GET" && path === "/api/daily") {
      const { id } = await requireUser(req);
      json(res, 200, await dailyStatus(id));
    } else if (method === "POST" && path === "/api/daily/run") {
      const { id } = await requireUser(req);
      const b = (await readBody(req)) as Record<string, unknown>;
      // The score is derived from the moves here, never read from the body.
      const { result, alreadyPlayed } = await submitDailyRun(id, b.moves);
      json(res, alreadyPlayed ? 409 : 201, {
        result,
        alreadyPlayed,
        status: await dailyStatus(id),
      });
    } else if (method === "GET" && path === "/api/friends") {
      const { id } = await requireUser(req);
      json(res, 200, await friendsView(id));
    } else if (method === "POST" && path === "/api/friends/request") {
      const { id } = await requireUser(req);
      const b = (await readBody(req)) as Record<string, unknown>;
      json(res, 200, await requestFriend(id, b.username));
    } else if (method === "POST" && path === "/api/friends/accept") {
      const { id } = await requireUser(req);
      const b = (await readBody(req)) as Record<string, unknown>;
      json(res, 200, await acceptFriend(id, b.username));
    } else if (method === "POST" && path === "/api/friends/remove") {
      const { id } = await requireUser(req);
      const b = (await readBody(req)) as Record<string, unknown>;
      json(res, 200, await removeFriend(id, b.username));
    } else if (method === "GET" && path.startsWith("/api/users/")) {
      const { id } = await requireUser(req);
      const username = decodeURIComponent(path.slice("/api/users/".length));
      json(res, 200, await publicProfile(id, username));
    } else if (method === "GET" && path === "/api/me") {
      const { id } = await requireUser(req);
      const account = await getAccount(id);
      if (!account) throw new AccountError(404, "Account not found.");
      json(res, 200, account);
    } else if (method === "PUT" && path === "/api/me/profile") {
      const { id } = await requireUser(req);
      const b = (await readBody(req)) as Record<string, unknown>;
      const profile = await saveProfile(id, (b.profile ?? b) as never);
      json(res, 200, { profile });
    } else {
      json(res, 404, { error: "Not found." });
    }
  } catch (err) {
    if (err instanceof AccountError) {
      json(res, err.status, { error: err.message });
    } else {
      console.error("[api] error:", err);
      json(res, 500, { error: "Something went wrong. Please try again." });
    }
  }
  return true;
}
