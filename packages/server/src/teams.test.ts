/**
 * Integration tests for team rooms and the in-place rematch, over real
 * WebSockets against the authoritative server.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import type { AddressInfo } from "node:net";
import { encode, decode, type ClientMessage, type ServerMessage } from "@greed/protocol";
import { GreedServer } from "./server.js";

type Lobby = Extract<ServerMessage, { type: "lobby" }>;
type Game = Extract<ServerMessage, { type: "game" }>;
type Welcome = Extract<ServerMessage, { type: "welcome" }>;

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

describe("team rooms", () => {
  let wss: WebSocketServer;
  let url: string;

  beforeEach(async () => {
    wss = new WebSocketServer({ port: 0 });
    // Fast pacing so a whole game plays out inside a test.
    new GreedServer(wss, { rollOffMs: 20, interTurnMs: 5, botThinkMs: 5 });
    await new Promise<void>((r) => wss.once("listening", () => r()));
    url = `ws://localhost:${(wss.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((r) => wss.close(() => r()));
  });

  /** A room with the host plus `bots` bot seats. */
  async function hostRoom(bots: number): Promise<{ host: TestClient; code: string }> {
    const host = await connect(url);
    host.send({ type: "create-room", name: "Host" });
    const welcome = (await host.waitFor((m) => m.type === "welcome")) as Welcome;
    for (let i = 0; i < bots; i++) host.send({ type: "add-bot" });
    await host.waitFor((m) => m.type === "lobby" && (m as Lobby).lobby.seats.length === bots + 1);
    return { host, code: welcome.code };
  }

  it("offers teams only at a table that splits into two equal sides", async () => {
    const { host } = await hostRoom(2); // 3 seats
    const three = (await host.waitFor(
      (m) => m.type === "lobby" && (m as Lobby).lobby.seats.length === 3,
    )) as Lobby;
    expect(three.lobby.teamsAvailable).toBe(false);

    host.send({ type: "add-bot" }); // 4 seats
    const four = (await host.waitFor(
      (m) => m.type === "lobby" && (m as Lobby).lobby.seats.length === 4,
    )) as Lobby;
    expect(four.lobby.teamsAvailable).toBe(true);
    host.ws.close();
  });

  it("ignores a request to turn teams on at an impossible table size", async () => {
    const { host } = await hostRoom(2); // 3 seats
    host.send({ type: "set-teams", teams: true });
    host.send({ type: "set-goal", goal: 1500 }); // a change we CAN observe landing
    const after = (await host.waitFor(
      (m) => m.type === "lobby" && (m as Lobby).lobby.goal === 1500,
    )) as Lobby;
    expect(after.lobby.teams).toBe(false);
    host.ws.close();
  });

  it("balances the sides automatically when teams are switched on", async () => {
    const { host } = await hostRoom(3); // 4 seats
    host.send({ type: "set-teams", teams: true });
    const lobby = (await host.waitFor(
      (m) => m.type === "lobby" && (m as Lobby).lobby.teams,
    )) as Lobby;
    const sides = lobby.lobby.seats.map((s) => s.team);
    expect(sides.filter((t) => t === 0)).toHaveLength(2);
    expect(sides.filter((t) => t === 1)).toHaveLength(2);
    expect(lobby.lobby.canStart).toBe(true);
    host.ws.close();
  });

  it("will not start a lopsided team room", async () => {
    const { host } = await hostRoom(3);
    host.send({ type: "set-teams", teams: true });
    const balanced = (await host.waitFor(
      (m) => m.type === "lobby" && (m as Lobby).lobby.teams,
    )) as Lobby;

    // Shove one seat across so it is 3 v 1.
    const stray = balanced.lobby.seats.find((s) => s.team === 1)!;
    host.send({ type: "set-seat-team", seatId: stray.id, team: 0 });
    const lopsided = (await host.waitFor(
      (m) =>
        m.type === "lobby" && (m as Lobby).lobby.seats.filter((s) => s.team === 0).length === 3,
    )) as Lobby;
    expect(lopsided.lobby.canStart).toBe(false);
    host.ws.close();
  });

  it("deals a team game whose sides share a score", async () => {
    const { host } = await hostRoom(3);
    host.send({ type: "set-teams", teams: true });
    await host.waitFor((m) => m.type === "lobby" && (m as Lobby).lobby.teams);
    host.send({ type: "start-game" });

    const game = (await host.waitFor((m) => m.type === "game")) as Game;
    expect(game.state.teams).not.toBeNull();
    expect(game.state.teams).toHaveLength(2);
    expect(game.state.teams!.flat().sort()).toEqual([0, 1, 2, 3]);
    // Every player carries a side, and the seating alternates them.
    const sidesInOrder = game.state.order.map((i) => game.state.players[i].team);
    for (let k = 1; k < sidesInOrder.length; k++) {
      expect(sidesInOrder[k]).not.toBe(sidesInOrder[k - 1]);
    }
    host.ws.close();
  });

  it("shows the roll-off in the seating the team game will actually use", async () => {
    const { host } = await hostRoom(3);
    host.send({ type: "set-teams", teams: true });
    await host.waitFor((m) => m.type === "lobby" && (m as Lobby).lobby.teams);
    host.send({ type: "start-game" });

    const rollOff = (await host.waitFor((m) => m.type === "roll-off")) as Extract<
      ServerMessage,
      { type: "roll-off" }
    >;
    expect(rollOff.rows.every((r) => r.team === 0 || r.team === 1)).toBe(true);
    for (let k = 1; k < rollOff.rows.length; k++) {
      expect(rollOff.rows[k].team).not.toBe(rollOff.rows[k - 1].team);
    }

    // …and the game that follows seats them in exactly that order.
    const game = (await host.waitFor((m) => m.type === "game")) as Game;
    const names = game.state.order.map((i) => game.state.players[i].name);
    expect(names).toEqual(rollOff.rows.map((r) => r.name));
    host.ws.close();
  });
});

describe("in-place rematch", () => {
  let wss: WebSocketServer;
  let url: string;

  beforeEach(async () => {
    wss = new WebSocketServer({ port: 0 });
    new GreedServer(wss, { rollOffMs: 20, interTurnMs: 5, botThinkMs: 5 });
    await new Promise<void>((r) => wss.once("listening", () => r()));
    url = `ws://localhost:${(wss.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((r) => wss.close(() => r()));
  });

  /**
   * A human plus two bots, played through to game over. The human seat is
   * driven by a greedy auto-player rather than left to time out: the rematch
   * vote only counts CONNECTED humans, so the table has to finish with a real
   * player still sitting at it.
   */
  async function playedOutRoom(): Promise<TestClient> {
    const host = await connect(url);
    host.send({ type: "create-room", name: "Host", goal: 500 });
    const welcome = (await host.waitFor((m) => m.type === "welcome")) as Welcome;
    host.send({ type: "add-bot" });
    host.send({ type: "add-bot" });
    await host.waitFor((m) => m.type === "lobby" && (m as Lobby).lobby.seats.length === 3);

    // Bank as soon as there is anything to bank; otherwise roll.
    host.ws.on("message", (data) => {
      const m = decode<ServerMessage>(data.toString());
      if (m.type !== "game" || m.state.phase === "game-over") return;
      const turn = m.state.turn;
      if (m.state.players[turn.playerIndex].id !== welcome.youId) return;
      if (turn.outcome) return; // the server owns ADVANCE
      const action = turn.turnScore > 0 ? "BANK" : "ROLL";
      host.send({ type: "game-action", action: { type: action } });
    });

    host.send({ type: "start-game" });
    await host.waitFor((m) => m.type === "game" && (m as Game).state.phase === "game-over", 20000);
    return host;
  }

  it("carries a rematch tally once the game is over", async () => {
    const host = await playedOutRoom();
    const over = (await host.waitFor(
      (m) => m.type === "game" && (m as Game).state.phase === "game-over",
    )) as Game;
    expect(over.rematch).toBeDefined();
    expect(over.rematch!.votes).toEqual([]);
    expect(over.rematch!.needed).toBe(1); // one connected human
    host.ws.close();
  }, 30000);

  it("restarts the same table in place when everyone has voted", async () => {
    const host = await playedOutRoom();
    await host.waitFor((m) => m.type === "game" && (m as Game).state.phase === "game-over");

    host.send({ type: "rematch" });
    // The sole human voting is enough — a new roll-off, no trip via the lobby.
    const rollOff = await host.waitFor((m) => m.type === "roll-off", 8000);
    expect(rollOff.type).toBe("roll-off");
    const fresh = (await host.waitFor(
      (m) => m.type === "game" && (m as Game).state.phase !== "game-over",
      8000,
    )) as Game;
    expect(fresh.state.players).toHaveLength(3);
    expect(fresh.state.log.some((e) => e.type === "game-over")).toBe(false);
    host.ws.close();
  }, 30000);

  it("lets the host take the table back to the lobby instead", async () => {
    const host = await playedOutRoom();
    await host.waitFor((m) => m.type === "game" && (m as Game).state.phase === "game-over");

    host.send({ type: "to-lobby" });
    // Wait for a lobby broadcast with the full table — the first buffered lobby
    // message is the one-seat snapshot from before the bots were added.
    const lobby = (await host.waitFor(
      (m) => m.type === "lobby" && (m as Lobby).lobby.seats.length === 3,
    )) as Lobby;
    expect(lobby.lobby.seats).toHaveLength(3);
    host.ws.close();
  }, 30000);
});
