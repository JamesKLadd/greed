/** Bootstrap: start a WebSocket server and hand connections to GreedServer. */

import { WebSocketServer } from "ws";
import { DEFAULT_SERVER_PORT } from "@greed/protocol";
import { GreedServer } from "./server.js";

const port = Number(process.env.PORT) || DEFAULT_SERVER_PORT;
const wss = new WebSocketServer({ port });
new GreedServer(wss);

console.log(`Greed server listening on ws://localhost:${port}`);
