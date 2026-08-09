/** Bootstrap: start an HTTP + WebSocket server and hand connections to GreedServer. */

import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { DEFAULT_SERVER_PORT } from "@greed/protocol";
import { GreedServer } from "./server.js";
import { accountsEnabled, migrate } from "./db.js";
import { handleApi } from "./http-api.js";

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
  httpServer.listen(port, () => {
    console.log(`Greed server listening on :${port} (ws + http)`);
  });
}

void start();
