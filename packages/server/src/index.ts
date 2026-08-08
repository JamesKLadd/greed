/** Bootstrap: start an HTTP + WebSocket server and hand connections to GreedServer. */

import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { DEFAULT_SERVER_PORT } from "@greed/protocol";
import { GreedServer } from "./server.js";

const port = Number(process.env.PORT) || DEFAULT_SERVER_PORT;

// A tiny HTTP layer so hosts (Render, Railway, …) can health-check the port with a
// plain GET, while WebSocket upgrades are handed to the same server. Greed itself
// speaks only WebSocket; the HTTP responses are just liveness/info.
const httpServer = createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("Greed server OK");
    return;
  }
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("Not found");
});

const wss = new WebSocketServer({ server: httpServer });
new GreedServer(wss);

httpServer.listen(port, () => {
  console.log(`Greed server listening on :${port} (ws + http)`);
});
