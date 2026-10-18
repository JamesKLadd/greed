/** The actual online lobby scheduler must use the same positional policy as local bots. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyAction, createGame, diceRemaining, type GameState } from "@greed/core";
import { decode, encode, type ClientMessage, type ServerMessage } from "@greed/protocol";
import type { AddressInfo } from "node:net";
import { WebSocket, WebSocketServer } from "ws";
import { clearTimers, type Room, type RoomStore } from "./rooms.js";
import { GreedServer } from "./server.js";

type GameMessage = Extract<ServerMessage, { type: "game" }>;
type Welcome = Extract<ServerMessage, { type: "welcome" }>;

interface Client {
  ws: WebSocket;
  clear(): void;
  send(message: ClientMessage): void;
  waitFor(predicate: (message: ServerMessage) => boolean): Promise<ServerMessage>;
}

async function connect(url: string): Promise<Client> {
  const ws = new WebSocket(url);
  const messages: ServerMessage[] = [];
  const waiters = new Set<{
    predicate: (message: ServerMessage) => boolean;
    resolve(message: ServerMessage): void;
  }>();
  ws.on("message", (data) => {
    const message = decode<ServerMessage>(data.toString());
    messages.push(message);
    for (const waiter of waiters) {
      if (waiter.predicate(message)) {
        waiters.delete(waiter);
        waiter.resolve(message);
      }
    }
  });
  await new Promise<void>((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  return {
    ws,
    clear: () => {
      messages.length = 0;
    },
    send: (message) => ws.send(encode(message)),
    waitFor: (predicate) => {
      const buffered = messages.find(predicate);
      if (buffered) return Promise.resolve(buffered);
      return new Promise<ServerMessage>((resolve, reject) => {
        const timer = setTimeout(() => {
          waiters.delete(waiter);
          reject(new Error("Timed out waiting for online bot action"));
        }, 4000);
        const waiter = {
          predicate,
          resolve(message: ServerMessage) {
            clearTimeout(timer);
            resolve(message);
          },
        };
        waiters.add(waiter);
      });
    },
  };
}

/** A genuine scoring throw, with 200 bankable and two dice left to roll. */
function smallTurn(room: Room, activeId: string, trailing: boolean): GameState {
  const players = room.game!.players;
  const active = players.findIndex((player) => player.id === activeId);
  const rival = 1 - active;
  for (let seed = 1; seed < 5000; seed++) {
    const game = applyAction(createGame(players, { goal: 3000, seed, order: [active, rival] }), {
      type: "ROLL",
    });
    if (game.turn.turnScore !== 200 || game.turn.outcome || diceRemaining(game.turn) !== 2)
      continue;
    game.players[active].total = trailing ? 0 : 2400;
    game.players[rival].total = trailing ? 2800 : 400;
    return game;
  }
  throw new Error("No 200-point scoring throw found");
}

describe("online bots use the score position", () => {
  let wss: WebSocketServer;
  let server: GreedServer;
  let url: string;
  // Only the test fixture accesses the store. Lobby commands and the resulting
  // moves still travel over real sockets through the production scheduler.
  const internals = () =>
    server as unknown as {
      store: RoomStore;
      scheduleFollowups(room: Room): void;
    };

  beforeEach(async () => {
    wss = new WebSocketServer({ port: 0 });
    server = new GreedServer(wss, {
      rollOffMs: 10,
      botThinkMs: 30,
      disconnectAutoplayMs: 30,
      interTurnMs: 200,
      heartbeatMs: 0,
    });
    await new Promise<void>((resolve) => wss.once("listening", resolve));
    url = `ws://127.0.0.1:${(wss.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    for (const room of internals().store.all()) {
      clearTimers(room);
      if (room.emptyTimer) clearTimeout(room.emptyTimer);
    }
    server.stop();
    for (const ws of wss.clients) ws.terminate();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    // Closing a socket can create an autoplay/empty-room timer; remove those too.
    for (const room of internals().store.all()) {
      clearTimers(room);
      if (room.emptyTimer) clearTimeout(room.emptyTimer);
    }
  });

  async function cautiousLobby() {
    const host = await connect(url);
    host.send({ type: "create-room", name: "Host", goal: 3000 });
    const welcome = (await host.waitFor((message) => message.type === "welcome")) as Welcome;
    host.send({ type: "add-bot", personality: "cautious" });
    await host.waitFor((message) => message.type === "lobby" && message.lobby.seats.length === 2);
    host.send({ type: "start-game" });
    await host.waitFor((message) => message.type === "game");
    const room = internals().store.get(welcome.code)!;
    clearTimers(room);
    const bot = room.seats.find((seat) => seat.isBot)!;
    expect(bot.personality).toBe("cautious");
    expect(room.game!.players.find((player) => player.id === bot.id)?.botPersonality).toBe(
      "cautious",
    );
    return { host, room, bot };
  }

  it("makes a cautious lobby bot continue a 200-point turn when far behind", async () => {
    const { host, room, bot } = await cautiousLobby();
    room.game = smallTurn(room, bot.id, true);
    host.clear();
    internals().scheduleFollowups(room);
    const message = (await host.waitFor((message) => message.type === "game")) as GameMessage;
    expect(message.state.turn.rollCount).toBe(2);
    expect(message.state.players.find((player) => player.id === bot.id)?.total).toBe(0);
    expect(
      message.state.log.some((event) => event.type === "bank" && event.playerId === bot.id),
    ).toBe(false);
    expect(message.state.rng).toBe(0);
    expect(message.state.config.seed).not.toBe(room.game!.config.seed);
  });

  it("still lets a cautious lobby bot protect the same turn when leading", async () => {
    const { host, room, bot } = await cautiousLobby();
    room.game = smallTurn(room, bot.id, false);
    host.clear();
    internals().scheduleFollowups(room);
    const message = (await host.waitFor((message) => message.type === "game")) as GameMessage;
    expect(message.state.turn.outcome).toBe("banked");
    expect(message.state.turn.rollCount).toBe(1);
    expect(message.state.players.find((player) => player.id === bot.id)?.total).toBe(2600);
  });

  it("applies the same catch-up policy when a human disconnects mid-turn", async () => {
    const host = await connect(url);
    const peer = await connect(url);
    host.send({ type: "create-room", name: "Host", goal: 3000 });
    const welcome = (await host.waitFor((message) => message.type === "welcome")) as Welcome;
    peer.send({ type: "join-room", name: "Away", code: welcome.code });
    const joined = (await peer.waitFor((message) => message.type === "welcome")) as Welcome;
    peer.send({ type: "set-ready", ready: true });
    await host.waitFor((message) => message.type === "lobby" && message.lobby.canStart);
    host.send({ type: "start-game" });
    await host.waitFor((message) => message.type === "game");
    const room = internals().store.get(welcome.code)!;
    clearTimers(room);
    room.game = smallTurn(room, joined.youId, true);
    host.clear();
    peer.ws.close();
    const message = (await host.waitFor(
      (message) => message.type === "game" && message.state.turn.rollCount === 2,
    )) as GameMessage;
    expect(message.state.players.find((player) => player.id === joined.youId)?.total).toBe(0);
    expect(message.presence.find((seat) => seat.id === joined.youId)?.connected).toBe(false);
    expect(message.state.rng).toBe(0);
  });
});
