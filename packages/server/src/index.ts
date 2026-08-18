/** Bootstrap: start an HTTP + WebSocket server and hand connections to GreedServer. */

import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { DEFAULT_SERVER_PORT } from "@greed/protocol";
import { GreedServer } from "./server.js";
import { accountsEnabled, migrate } from "./db.js";
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

const wss = new WebSocketServer({ server: httpServer });
new GreedServer(wss);

async function start(): Promise<void> {
  if (accountsEnabled()) {
    try {
      await migrate();
      console.log("Accounts: enabled (database ready).");
    } catch (err) {
      console.error("Accounts: database migration failed —", (err as Error).message);
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
