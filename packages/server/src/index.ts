/** Bootstrap: start an HTTP + WebSocket server and hand connections to GreedServer. */

import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { DEFAULT_SERVER_PORT } from "@greed/protocol";
import { GreedServer } from "./server.js";
import { accountsEnabled, disableAccounts, migrate, startPruning } from "./db.js";
import { handleApi } from "./http-api.js";
import { emailStatus, verificationStatus } from "./email.js";
import { loadSecret, secretSource } from "./auth.js";

// Load local dev secrets (Vercel `env pull` writes .env.local at the repo root).
// In production the host injects env vars, so a missing file is fine.
for (const path of [".env.local", "../../.env.local", "../../../.env.local"]) {
  try {
    process.loadEnvFile(path);
    break;
  } catch {
    /* try the next candidate */
  }
}

const port = Number(process.env.PORT) || DEFAULT_SERVER_PORT;

// HTTP layer: the accounts REST API under /api/, plus a plain liveness endpoint
// for hosts (Render, Railway, …). WebSocket upgrades are handed to the same
// server; Greed's game traffic itself speaks only WebSocket.
const httpServer = createServer((req, res) => {
  handleApi(req, res)
    .then((handled) => {
      if (handled) return;
      if (req.url === "/health" || req.url === "/") {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("Greed server OK");
        return;
      }
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Not found");
    })
    .catch((err) => {
      console.error("[http] unhandled error:", err);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
});

/**
 * Origins allowed to open a game socket.
 *
 * CORS does not apply to WebSockets, so without this any page on the internet
 * could open a connection and drive the game server. Mirrors the HTTP API's
 * allow-list; a request with no Origin header at all (a native client, a
 * script, a health check) is allowed through, because there is nothing to
 * protect it from — the browser is the only thing that sends one.
 */
function wsOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  const list = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allow = [
    process.env.APP_URL,
    "http://localhost:5173",
    "http://localhost:4173",
    ...list,
  ].filter((s): s is string => Boolean(s));
  if (allow.includes(origin)) return true;
  return /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin);
}

const wss = new WebSocketServer({
  server: httpServer,
  // A game message is a few hundred bytes; the library's default ceiling is
  // 100 MB, which is a lot of memory to hand an anonymous socket.
  maxPayload: 64 * 1024,
  verifyClient: ({ origin }, done) => done(wsOriginAllowed(origin)),
});
new GreedServer(wss);

async function start(): Promise<void> {
  if (accountsEnabled()) {
    try {
      await migrate();
      startPruning();
      console.log("Accounts: enabled (database ready).");
    } catch (err) {
      // A database that cannot be migrated is one that cannot be used, and
      // every account request would have 500'd against it. Fall back to the
      // guest-play path the server already supports rather than looking like a
      // working server that fails everything an account touches.
      console.error("Accounts: database migration failed —", (err as Error).message);
      console.error("Accounts: DISABLED for this boot. Online play continues as guests.");
      disableAccounts();
    }
  } else {
    console.log("Accounts: disabled (no DATABASE_URL). Guest play only.");
  }
  // Where verification/reset links point, and whether mail actually leaves the
  // building. Both are pure env config, so logging them makes a bad deploy
  // obvious at boot instead of at the first signup.
  // Resolve the session secret before anything can sign a token with it. What
  // it resolved to is logged, because a server quietly signing with a value it
  // invented at boot looks exactly like a server that works — until it restarts
  // and everyone has to log in again.
  await loadSecret();
  console.log(`Sessions signed with: ${secretSource}`);
  console.log(`App URL: ${process.env.APP_URL || "http://localhost:5173 (default)"}`);
  console.log(emailStatus());
  console.log(verificationStatus());
  httpServer.listen(port, () => {
    console.log(`Greed server listening on :${port} (ws + http)`);
  });
}

void start();
