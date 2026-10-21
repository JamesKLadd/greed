/**
 * REST API for accounts, served on the SAME HTTP server as the WebSocket game
 * traffic. Everything lives under `/api/`; `handleApi` returns true when it has
 * taken responsibility for a request so the bootstrap can fall through to the
 * health endpoint otherwise.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { accountsEnabled } from "./db.js";
import { growthReport, isGrowthAdmin, parseGrowthBatch, recordGrowth } from "./growth.js";
import { sessionIsCurrent, verifySession } from "./auth.js";
import { dailyKey, weekKey } from "@greed/core";
import { clientKey, rateLimit } from "./rate-limit.js";
import { dailyStatus, playDailyMove, resumeDailyRun, startDailyRun } from "./daily.js";
import { playWeeklyMove, resumeWeeklyRun, startWeeklyRun, weeklyStatus } from "./weekly.js";
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
  deleteAccount,
} from "./accounts.js";
import { verificationRequired } from "./email.js";
import {
  isStatsAdmin,
  isStatsView,
  recordLocalGame,
  rollExport,
  rollSummary,
  type StatsView,
} from "./rollStats.js";
import {
  dailyBest,
  isLeaderboardCategory,
  leaderboard,
  matchHistory,
  weeklyBest,
} from "./leaderboards.js";

const MAX_BODY = 64 * 1024; // 64 KB is plenty for auth payloads.

/**
 * The account as the client sees it, with what it may open. `statsAdmin` is
 * read from the database (stats_admins), never from the name — see
 * snapshotStatsAdmins — and only decides whether a button is shown; the
 * all-players endpoints check it again for themselves.
 */
async function withAdmins<T extends { user: { id: string; username: string } }>(result: T) {
  return {
    ...result,
    user: {
      ...result.user,
      growthAdmin: isGrowthAdmin(result.user.username),
      statsAdmin: await isStatsAdmin(result.user.id),
    },
  };
}

function csv(res: ServerResponse, filename: string, body: string): void {
  res.writeHead(200, {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="${filename}"`,
    "cache-control": "no-store",
  });
  res.end(body);
}

function statsView(url: URL): StatsView {
  const raw = url.searchParams.get("view") ?? "games";
  if (!isStatsView(raw)) throw new AccountError(400, "Unknown statistics view.", "stats.view");
  return raw;
}

function exportKind(url: URL): "games" | "throws" {
  return url.searchParams.get("kind") === "throws" ? "throws" : "games";
}

async function requireStatsAdmin(req: IncomingMessage): Promise<{ id: string }> {
  const user = await requireUser(req);
  if (!(await isStatsAdmin(user.id)))
    throw new AccountError(403, "These statistics are for the game owner only.", "stats.admin");
  return user;
}

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
        reject(new AccountError(413, "Request too large.", "body.tooLarge"));
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
        reject(new AccountError(400, "Malformed JSON body.", "body.malformed"));
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
  if (!claims) throw new AccountError(401, "Please log in again.", "auth.expired");
  // A valid signature is not the whole question. The account may have reset its
  // password since — which is meant to end other sessions — or been deleted
  // outright, in which case this token was still authenticating a user that no
  // longer exists. See sessionIsCurrent.
  if (!(await sessionIsCurrent(claims)))
    throw new AccountError(401, "Please log in again.", "auth.expired");
  return { id: claims.sub, username: claims.username };
}

/** The signed-in caller, or null. For endpoints that work either way. */
async function optionalUser(req: IncomingMessage): Promise<{ id: string } | null> {
  try {
    return await requireUser(req);
  } catch {
    return null;
  }
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
    // A run is a few dozen moves; this only stops a hammering client.
    "/api/daily/move": { limit: 400, windowMs: 60 * 60_000 },
    "/api/daily/start": { limit: 20, windowMs: 60 * 60_000 },
    // The weekly is unlimited by design, so its caps are sized for someone
    // genuinely grinding a score rather than for one run a day: a ten-turn
    // attempt is a few dozen moves, and a determined player might play dozens
    // of attempts in an evening. These only stop a client hammering the API.
    "/api/weekly/move": { limit: 6000, windowMs: 60 * 60_000 },
    "/api/weekly/start": { limit: 300, windowMs: 60 * 60_000 },
    // Friend requests are the one social action that reaches another person,
    // so cap them; browsing profiles and lists is unrestricted.
    "/api/friends/request": { limit: 30, windowMs: 60 * 60_000 },
    "/api/growth": { limit: 30, windowMs: 60_000 },
    "/api/growth/report": { limit: 30, windowMs: 60_000 },
    // One upload per finished solo game; generous for a marathon evening.
    "/api/stats/local": { limit: 300, windowMs: 60 * 60_000 },
    // Exports read every throw in the window, so they are the costly reads.
    "/api/stats/me/export": { limit: 30, windowMs: 60 * 60_000 },
    "/api/stats/all/export": { limit: 30, windowMs: 60 * 60_000 },
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
    if (method === "POST" && path === "/api/growth") {
      if (req.headers.origin && !allowedOrigin(req.headers.origin))
        throw new AccountError(403, "Origin not allowed.");
      await recordGrowth(parseGrowthBatch(await readBody(req)));
      json(res, 202, { accepted: true });
    } else if (method === "GET" && path === "/api/growth/report") {
      res.setHeader("Cache-Control", "no-store");
      const { username } = await requireUser(req);
      if (!isGrowthAdmin(username))
        throw new AccountError(403, "This report is available to the game owner only.");
      json(res, 200, await growthReport());
    } else if (method === "POST" && path === "/api/auth/signup") {
      const b = (await readBody(req)) as Record<string, unknown>;
      json(
        res,
        201,
        await withAdmins(
          await signup({ email: b.email, username: b.username, password: b.password }),
        ),
      );
    } else if (method === "POST" && path === "/api/auth/login") {
      const b = (await readBody(req)) as Record<string, unknown>;
      json(res, 200, await withAdmins(await login({ login: b.login, password: b.password })));
    } else if (method === "POST" && path === "/api/auth/verify") {
      const b = (await readBody(req)) as Record<string, unknown>;
      json(res, 200, { verified: await verifyEmail(b.token) });
    } else if (method === "POST" && path === "/api/auth/request-reset") {
      const b = (await readBody(req)) as Record<string, unknown>;
      json(res, 200, await requestReset(b.email));
    } else if (method === "POST" && path === "/api/auth/reset") {
      const b = (await readBody(req)) as Record<string, unknown>;
      json(res, 200, await withAdmins(await resetPassword(b.token, b.password)));
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
    } else if (method === "POST" && path === "/api/daily/start") {
      const { id } = await requireUser(req);
      json(res, 200, await startDailyRun(id));
    } else if (method === "POST" && path === "/api/daily/move") {
      const { id } = await requireUser(req);
      const b = (await readBody(req)) as Record<string, unknown>;
      // The server owns the dice: it appends the move, replays from the seed
      // and returns the position. The client never sees the seed at all.
      //
      // The position and NOTHING else — see the weekly's move below for why the
      // refreshed board is not bundled in here.
      json(res, 200, await playDailyMove(id, b.move));
    } else if (method === "GET" && path === "/api/daily/resume") {
      const { id } = await requireUser(req);
      json(res, 200, { run: await resumeDailyRun(id) });
    } else if (method === "GET" && path === "/api/weekly") {
      const { id } = await requireUser(req);
      json(res, 200, await weeklyStatus(id));
    } else if (method === "POST" && path === "/api/weekly/start") {
      const { id } = await requireUser(req);
      json(res, 200, await startWeeklyRun(id));
    } else if (method === "POST" && path === "/api/weekly/move") {
      const { id } = await requireUser(req);
      const b = (await readBody(req)) as Record<string, unknown>;
      // Same shape as the daily: the server owns the dice, appends the move,
      // replays from the seed and returns the position.
      //
      // The move that ENDS a run used to carry the refreshed board with it, to
      // save a round trip. It cost one instead: weeklyStatus is seven queries
      // run one after another (your row, the board, the count, closed-week
      // placings, champions, the streak), and they landed in front of the only
      // reply the player was waiting on. Worse, they landed SELECTIVELY — a
      // roll only ends a run by busting it, so on the last turn the pause
      // before the dice moved WAS the result. Players read it and knew they had
      // busted before the throw played out.
      //
      // Nothing was gained for it, either: both screens re-read the board when
      // the run finishes (`onFinished`), so the bundled copy was parsed and
      // dropped. The board is fetched a moment later, while the result is being
      // read, which is where that work belongs.
      json(res, 200, await playWeeklyMove(id, b.move));
    } else if (method === "GET" && path === "/api/weekly/resume") {
      const { id } = await requireUser(req);
      json(res, 200, { run: await resumeWeeklyRun(id) });
    } else if (method === "GET" && path === "/api/leaderboard") {
      // Signed-out callers can browse the boards; they just have no own-rank.
      const viewer = await optionalUser(req);
      const raw = url.searchParams.get("category") ?? "wins";
      if (!isLeaderboardCategory(raw))
        throw new AccountError(400, "Unknown leaderboard.", "board.unknown");
      json(res, 200, await leaderboard(raw, viewer?.id ?? null));
    } else if (method === "GET" && path === "/api/leaderboard/daily") {
      // The best daily runs ever played. Public like the other boards; today's
      // runs are held back from anyone who hasn't finished today's yet.
      const viewer = await optionalUser(req);
      json(res, 200, await dailyBest(viewer?.id ?? null, dailyKey()));
    } else if (method === "GET" && path === "/api/leaderboard/weekly") {
      // The best weekly attempts ever played. Fully public: this week's board
      // is open from the start, so there is nothing here to hold back.
      const viewer = await optionalUser(req);
      json(res, 200, await weeklyBest(viewer?.id ?? null, weekKey()));
    } else if (method === "POST" && path === "/api/stats/local") {
      // A solo game finished on the player's own device. The server cannot
      // vouch for those dice, so they are bounded and kept as their own mode.
      const { id } = await requireUser(req);
      await recordLocalGame(id, await readBody(req));
      json(res, 202, { recorded: true });
    } else if (method === "GET" && path === "/api/stats/me") {
      res.setHeader("Cache-Control", "no-store");
      const { id } = await requireUser(req);
      json(res, 200, await rollSummary(statsView(url), id));
    } else if (method === "GET" && path === "/api/stats/me/export") {
      const { id } = await requireUser(req);
      const view = statsView(url);
      const kind = exportKind(url);
      csv(res, `greed-${view}-${kind}.csv`, await rollExport(view, kind, id));
    } else if (method === "GET" && path === "/api/stats/all") {
      res.setHeader("Cache-Control", "no-store");
      await requireStatsAdmin(req);
      json(res, 200, await rollSummary(statsView(url), null));
    } else if (method === "GET" && path === "/api/stats/all/export") {
      await requireStatsAdmin(req);
      const view = statsView(url);
      const kind = exportKind(url);
      csv(res, `greed-all-players-${view}-${kind}.csv`, await rollExport(view, kind, null));
    } else if (method === "GET" && path === "/api/me/matches") {
      const { id } = await requireUser(req);
      json(res, 200, { matches: await matchHistory(id) });
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
      if (!account) throw new AccountError(404, "Account not found.", "account.missing");
      // The client can't infer this from the account alone, and it decides
      // whether any verification UI is worth showing at all.
      json(res, 200, {
        ...(await withAdmins(account)),
        verificationRequired: verificationRequired(),
      });
    } else if (method === "POST" && path === "/api/me/delete") {
      const { id } = await requireUser(req);
      const b = (await readBody(req)) as Record<string, unknown>;
      await deleteAccount(id, b.password);
      json(res, 200, { deleted: true });
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
      json(res, err.status, { error: err.message, code: err.code });
    } else {
      console.error("[api] error:", err);
      json(res, 500, { error: "Something went wrong. Please try again." });
    }
  }
  return true;
}
