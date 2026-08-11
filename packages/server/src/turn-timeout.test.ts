/**
 * Integration test for the turn-timeout rule: a connected player who never starts
 * their turn has it forfeited (a "skip"), and after the miss cap is kicked from the
 * room. Timings are shrunk to milliseconds via GreedServer options so this runs fast.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import type { AddressInfo } from "node:net";
import { encode, decode, type ClientMessage, type ServerMessage } from "@greed/protocol";
import { GreedServer } from "./server.js";

interface TestClient {
  ws: WebSocket;
  send(msg: ClientMessage): void;
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

describe("turn timeout", () => {
  let wss: WebSocketServer;
  let url: string;

  beforeEach(async () => {
    wss = new WebSocketServer({ port: 0 });
    // Shrunk timings so the whole forfeit→kick sequence plays out in well under a second.
    new GreedServer(wss, {
      rollOffMs: 20,
      interTurnMs: 15,
      botThinkMs: 15,
      turnIdleMs: 40,
      maxMissedTurns: 3,
    });
    await new Promise<void>((r) => wss.once("listening", () => r()));
    url = `ws://localhost:${(wss.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((r) => wss.close(() => r()));
  });

  it("forfeits idle turns and kicks the player after the miss cap", async () => {
    const idler = await connect(url);
    // High goal so the bot can't win before the idler is kicked.
    idler.send({ type: "create-room", name: "Idler", goal: 50000 });
    await idler.waitFor((m) => m.type === "welcome");
    idler.send({ type: "add-bot" });
    await idler.waitFor((m) => m.type === "lobby" && m.lobby.seats.length === 2);

    idler.send({ type: "start-game" });

    // The idler never acts: their turn is forfeited (a "skip" event appears)...
    await idler.waitFor(
      (m) => m.type === "game" && m.state.log.some((e) => e.type === "skip"),
      4000,
    );
    // ...and after three misses they're kicked from the room.
    const left = await idler.waitFor((m) => m.type === "left", 5000);
    expect(left.type).toBe("left");

    idler.ws.close();
  }, 10000);

  it("does not forfeit a player who starts their turn in time", async () => {
    const host = await connect(url);
    host.send({ type: "create-room", name: "Active", goal: 50000 });
    const welcome = await host.waitFor((m) => m.type === "welcome");
    const youId = (welcome as Extract<ServerMessage, { type: "welcome" }>).youId;
    host.send({ type: "add-bot" });
    await host.waitFor((m) => m.type === "lobby" && m.lobby.seats.length === 2);

    // React to every broadcast: roll as soon as it's our turn (before the idle
    // window), and flag if we're ever skipped or kicked.
    let kicked = false;
    let skippedUs = false;
    host.ws.on("message", (data) => {
      const m = decode<ServerMessage>(data.toString());
      if (m.type === "left") kicked = true;
      if (m.type !== "game") return;
      if (m.state.log.some((e) => e.type === "skip" && e.playerId === youId)) skippedUs = true;
      const cur = m.state.players[m.state.turn.playerIndex];
      if (cur.id === youId && !m.state.turn.outcome && m.state.phase !== "game-over") {
        host.send({ type: "game-action", action: { type: "ROLL" } });
      }
    });

    host.send({ type: "start-game" });
    await new Promise((r) => setTimeout(r, 500)); // let several turns cycle
    expect(kicked).toBe(false);
    expect(skippedUs).toBe(false);

    host.ws.close();
  }, 10000);

  it("broadcasts the countdown only while a human's turn is unstarted", async () => {
    // What the countdown ring on the active seat draws. The server only limits
    // STARTING a turn, so the clock must appear when it's a connected human's
    // turn and disappear the moment they roll — and never run for a bot.
    const host = await connect(url);
    host.send({ type: "create-room", name: "Ticker", goal: 50000 });
    const welcome = await host.waitFor((m) => m.type === "welcome");
    const youId = (welcome as Extract<ServerMessage, { type: "welcome" }>).youId;
    host.send({ type: "add-bot" });
    await host.waitFor((m) => m.type === "lobby" && m.lobby.seats.length === 2);
    host.send({ type: "start-game" });

    // Our turn, nothing rolled yet: a clock is running.
    const waiting = await host.waitFor(
      (m) =>
        m.type === "game" &&
        m.state.players[m.state.turn.playerIndex].id === youId &&
        m.state.turn.rollCount === 0 &&
        !m.state.turn.outcome,
      6000,
    );
    expect(waiting.type).toBe("game");
    const ticking = waiting as Extract<ServerMessage, { type: "game" }>;
    expect(ticking.turnTimerMs, "clock while waiting for a human to start").toBeGreaterThan(0);
    expect(ticking.turnTimerMs).toBeLessThanOrEqual(40); // the test config's turnIdleMs

    // Once we've rolled, the deadline is gone even though it's still our turn.
    host.send({ type: "game-action", action: { type: "ROLL" } });
    const rolled = await host.waitFor(
      (m) =>
        m.type === "game" &&
        m.state.players[m.state.turn.playerIndex].id === youId &&
        m.state.turn.rollCount > 0,
      4000,
    );
    expect(
      (rolled as Extract<ServerMessage, { type: "game" }>).turnTimerMs,
      "no clock once the turn has started",
    ).toBeUndefined();

    host.ws.close();
  }, 10000);
});
