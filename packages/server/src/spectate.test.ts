/**
 * Integration tests for spectator mode: a watcher joins a room by code over a real
 * WebSocket, receives the same lobby / roll-off / game broadcasts the players get,
 * holds no seat, and can leave cleanly.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import type { AddressInfo } from "node:net";
import { encode, decode, type ClientMessage, type ServerMessage } from "@greed/protocol";
import { GreedServer } from "./server.js";
import type { RoomStore } from "./rooms.js";

interface TestClient {
  ws: WebSocket;
  send(msg: ClientMessage): void;
  /** Resolve with the first buffered-or-future message matching pred. */
  waitFor(pred: (m: ServerMessage) => boolean, timeout?: number): Promise<ServerMessage>;
}

async function connect(url: string): Promise<TestClient> {
  const ws = new WebSocket(url);
  const msgs: ServerMessage[] = [];
  const waiters: { pred: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] =
    [];
  ws.on("message", (data) => {
    const m = decode<ServerMessage>(data.toString());
    msgs.push(m);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].pred(m)) {
        waiters[i].resolve(m);
        waiters.splice(i, 1);
      }
    }
  });
  await new Promise<void>((res, rej) => {
    ws.once("open", () => res());
    ws.once("error", rej);
  });
  return {
    ws,
    send: (msg) => ws.send(encode(msg)),
    waitFor: (pred, timeout = 4000) => {
      const seen = msgs.find(pred);
      if (seen) return Promise.resolve(seen);
      return new Promise<ServerMessage>((resolve, reject) => {
        const waiter = {
          pred,
          resolve: (m: ServerMessage) => {
            clearTimeout(timer);
            resolve(m);
          },
        };
        const timer = setTimeout(() => {
          const i = waiters.indexOf(waiter);
          if (i >= 0) waiters.splice(i, 1);
          reject(new Error("timed out waiting for message"));
        }, timeout);
        waiters.push(waiter);
      });
    },
  };
}

describe("spectator mode", () => {
  let wss: WebSocketServer;
  let url: string;
  let server: GreedServer;

  beforeEach(async () => {
    wss = new WebSocketServer({ port: 0 });
    server = new GreedServer(wss);
    await new Promise<void>((r) => wss.once("listening", () => r()));
    url = `ws://localhost:${(wss.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((r) => wss.close(() => r()));
  });

  async function hostRoom(): Promise<{ host: TestClient; code: string }> {
    const host = await connect(url);
    host.send({ type: "create-room", name: "Host" });
    const welcome = await host.waitFor((m) => m.type === "welcome");
    return { host, code: (welcome as Extract<ServerMessage, { type: "welcome" }>).code };
  }

  it("shares beta looks with classic seats and spectators, retaining them on reconnect", async () => {
    const host = await connect(url);
    const beta = {
      version: 1 as const,
      mascot: "cat",
      frame: "neon",
      background: "stars",
      nameplate: "ticket",
      // A hat travels with the look, to classic seats and spectators alike.
      hat: "witch-hat",
      badge: "",
      dice: "circuit",
    };
    host.send({ type: "create-room", name: "Beta", dice: "ivory", beta });
    const welcome = (await host.waitFor((m) => m.type === "welcome")) as Extract<
      ServerMessage,
      { type: "welcome" }
    >;
    const classic = await connect(url);
    classic.send({ type: "join-room", code: welcome.code, name: "Classic" });
    await classic.waitFor((m) => m.type === "welcome");
    classic.send({ type: "set-ready", ready: true });
    await host.waitFor(
      (m) =>
        m.type === "lobby" && m.lobby.seats.length === 2 && m.lobby.seats.every((s) => s.ready),
    );
    host.send({ type: "start-game" });
    const game = (await classic.waitFor((m) => m.type === "game", 8000)) as Extract<
      ServerMessage,
      { type: "game" }
    >;
    expect(game.skins.find((s) => s.beta)?.beta).toEqual(beta);
    expect(game.skins.find((s) => s.beta)?.dice).toBe("ivory");
    expect(game.skins.filter((s) => !s.beta)).toHaveLength(1);
    const watcher = await connect(url);
    watcher.send({ type: "spectate", code: welcome.code });
    const seen = (await watcher.waitFor((m) => m.type === "game")) as Extract<
      ServerMessage,
      { type: "game" }
    >;
    expect(seen.skins).toEqual(game.skins);
    expect(seen.state.order).toEqual(game.state.order);
    host.ws.close();
    const dropped = (await classic.waitFor(
      (m) => m.type === "game" && m.presence.some((p) => p.id === welcome.youId && !p.connected),
    )) as Extract<ServerMessage, { type: "game" }>;
    expect(dropped.state.players.map((p) => p.id)).toEqual(game.state.players.map((p) => p.id));
    expect(dropped.state.order).toEqual(game.state.order);
    const resumed = await connect(url);
    resumed.send({ type: "reconnect", token: welcome.token });
    const roomInfo = (await resumed.waitFor((m) => m.type === "lobby")) as Extract<
      ServerMessage,
      { type: "lobby" }
    >;
    expect(roomInfo.lobby.hostId).toBe(welcome.youId);
    expect(roomInfo.lobby.seats.find((p) => p.id === welcome.youId)?.isHost).toBe(true);
    expect(roomInfo.lobby.seats.filter((p) => p.isHost)).toHaveLength(1);
    const restored = (await resumed.waitFor((m) => m.type === "game")) as Extract<
      ServerMessage,
      { type: "game" }
    >;
    expect(restored.skins).toEqual(game.skins);
    expect(restored.state.order).toEqual(game.state.order);
    expect(restored.presence.find((p) => p.id === welcome.youId)?.connected).toBe(true);
    classic.ws.close();
    watcher.ws.close();
    resumed.ws.close();
  }, 12000);

  it("spectating an unknown room returns an error", async () => {
    const spec = await connect(url);
    spec.send({ type: "spectate", code: "ZZZZ" });
    const err = await spec.waitFor((m) => m.type === "error");
    expect((err as Extract<ServerMessage, { type: "error" }>).message).toMatch(/no room/i);
    spec.ws.close();
  });

  it("a watcher receives the lobby snapshot and live lobby updates", async () => {
    const { host, code } = await hostRoom();

    const spec = await connect(url);
    spec.send({ type: "spectate", code });
    const spectating = await spec.waitFor((m) => m.type === "spectating");
    expect((spectating as Extract<ServerMessage, { type: "spectating" }>).code).toBe(code);

    // Immediate snapshot: the one-seat lobby.
    const snap = await spec.waitFor((m) => m.type === "lobby");
    expect((snap as Extract<ServerMessage, { type: "lobby" }>).lobby.seats).toHaveLength(1);

    // Host adds a bot → the watcher sees the updated lobby too.
    host.send({ type: "add-bot" });
    const updated = await spec.waitFor((m) => m.type === "lobby" && m.lobby.seats.length === 2);
    expect((updated as Extract<ServerMessage, { type: "lobby" }>).lobby.seats).toHaveLength(2);

    host.ws.close();
    spec.ws.close();
  });

  it("a watcher receives the roll-off and the live game state, holding no seat", async () => {
    const { host, code } = await hostRoom();
    host.send({ type: "add-bot" });

    const spec = await connect(url);
    spec.send({ type: "spectate", code });
    await spec.waitFor((m) => m.type === "lobby" && m.lobby.seats.length === 2);

    host.send({ type: "start-game" });

    const rollOff = await spec.waitFor((m) => m.type === "roll-off");
    expect((rollOff as Extract<ServerMessage, { type: "roll-off" }>).rows).toHaveLength(2);

    // The live game arrives after the roll-off beat; the watcher gets it with no youId.
    const game = await spec.waitFor((m) => m.type === "game", 8000);
    const g = game as Extract<ServerMessage, { type: "game" }>;
    expect(g.code).toBe(code);
    expect(g.state.players).toHaveLength(2);
    const authoritative = (server as unknown as { store: RoomStore }).store.get(code)!.game!;
    expect(g.state.rng).toBe(0);
    expect(g.state.config.seed).not.toBe(authoritative.config.seed);
    expect(authoritative.rng).not.toBe(0);
    const playerView = (await host.waitFor((m) => m.type === "game")) as Extract<
      ServerMessage,
      { type: "game" }
    >;
    expect(playerView.state.config.seed).toBe(g.state.config.seed);
    expect(playerView.state.rng).toBe(0);
    expect(playerView.state.turn.dice).toEqual(g.state.turn.dice);

    host.ws.close();
    spec.ws.close();
  }, 12000);

  it("a watcher can leave and is released", async () => {
    const { host, code } = await hostRoom();
    const spec = await connect(url);
    spec.send({ type: "spectate", code });
    await spec.waitFor((m) => m.type === "spectating");

    spec.send({ type: "leave" });
    const left = await spec.waitFor((m) => m.type === "left");
    expect(left.type).toBe("left");

    host.ws.close();
    spec.ws.close();
  });
});
