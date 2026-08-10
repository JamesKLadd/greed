/**
 * Integration tests for friend challenges over real WebSockets: the
 * notification connection, presence bookkeeping, and the invite round trip.
 *
 * `social.js` is mocked so these run without a database — the friendship lookup
 * is the only part of the flow that needs one, and it is exercised by its own
 * query. Everything here is server routing, which is what tends to break.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import type { AddressInfo } from "node:net";
import { encode, decode, type ClientMessage, type ServerMessage } from "@greed/protocol";

/** alice and bob are friends; carol is a stranger. */
vi.mock("./social.js", () => ({
  requireFriend: async (_userId: string, username: unknown) => {
    const found = { alice: "u_alice", bob: "u_bob" }[String(username)];
    if (!found) throw new Error("You can only challenge friends.");
    return { id: found, username: String(username) };
  },
}));

const { GreedServer } = await import("./server.js");
const { signSession } = await import("./auth.js");
const { isOnline, resetPresence } = await import("./presence.js");

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

describe("friend challenges", () => {
  let wss: WebSocketServer;
  let url: string;
  let aliceToken: string;
  let bobToken: string;

  beforeEach(async () => {
    resetPresence();
    wss = new WebSocketServer({ port: 0 });
    new GreedServer(wss);
    await new Promise<void>((r) => wss.once("listening", () => r()));
    url = `ws://localhost:${(wss.address() as AddressInfo).port}`;
    aliceToken = await signSession({ sub: "u_alice", username: "alice" });
    bobToken = await signSession({ sub: "u_bob", username: "bob" });
  });

  afterEach(async () => {
    for (const client of wss.clients) client.terminate();
    await new Promise<void>((r) => wss.close(() => r()));
  });

  it("a notification socket signs in and shows the player as online", async () => {
    const alice = await connect(url);
    alice.send({ type: "hello", auth: aliceToken });
    const ok = await alice.waitFor((m) => m.type === "hello-ok");
    expect(ok).toMatchObject({ type: "hello-ok", username: "alice" });
    expect(isOnline("u_alice")).toBe(true);

    // Closing it releases the presence count — the leak that would otherwise
    // leave someone showing as available to play forever.
    alice.ws.close();
    await vi.waitFor(() => expect(isOnline("u_alice")).toBe(false));
  });

  it("rejects a bad session token", async () => {
    const client = await connect(url);
    client.send({ type: "hello", auth: "not-a-jwt" });
    const err = await client.waitFor((m) => m.type === "error");
    expect(err).toMatchObject({ type: "error" });
    expect(isOnline("u_alice")).toBe(false);
  });

  it("delivers an invite to the friend and a room code to the challenger", async () => {
    const alice = await connect(url);
    const bob = await connect(url);
    alice.send({ type: "hello", auth: aliceToken });
    bob.send({ type: "hello", auth: bobToken });
    await alice.waitFor((m) => m.type === "hello-ok");
    await bob.waitFor((m) => m.type === "hello-ok");

    alice.send({ type: "challenge", username: "bob" });
    const sent = await alice.waitFor((m) => m.type === "challenge-sent");
    const invite = await bob.waitFor((m) => m.type === "challenge-invite");
    expect(sent).toMatchObject({ type: "challenge-sent", to: "bob" });
    // Both sides are pointed at the same private room.
    expect((invite as { code: string }).code).toBe((sent as { code: string }).code);
    expect((invite as { from: string }).from).toBe("alice");
  });

  it("seats both players in the invited room, challenger hosting", async () => {
    const alice = await connect(url);
    const bob = await connect(url);
    alice.send({ type: "hello", auth: aliceToken });
    bob.send({ type: "hello", auth: bobToken });
    await alice.waitFor((m) => m.type === "hello-ok");
    await bob.waitFor((m) => m.type === "hello-ok");
    alice.send({ type: "challenge", username: "bob" });
    const sent = (await alice.waitFor((m) => m.type === "challenge-sent")) as { code: string };

    // Accepting is just joining by code — no separate handshake.
    const aliceGame = await connect(url);
    aliceGame.send({ type: "join-room", code: sent.code, name: "alice", auth: aliceToken });
    await aliceGame.waitFor((m) => m.type === "welcome");
    const bobGame = await connect(url);
    bobGame.send({ type: "join-room", code: sent.code, name: "bob", auth: bobToken });
    await bobGame.waitFor((m) => m.type === "welcome");

    const lobby = (await aliceGame.waitFor(
      (m) => m.type === "lobby" && m.lobby.seats.length === 2,
    )) as Extract<ServerMessage, { type: "lobby" }>;
    expect(lobby.lobby.seats.map((s) => s.name)).toEqual(["alice", "bob"]);
    // The room was made empty, so whoever arrived first hosts it.
    expect(lobby.lobby.seats[0].isHost).toBe(true);
    expect(lobby.lobby.seats[1].isHost).toBe(false);
  });

  it("gives one account a single seat however many times it joins", async () => {
    const alice = await connect(url);
    const bob = await connect(url);
    alice.send({ type: "hello", auth: aliceToken });
    bob.send({ type: "hello", auth: bobToken });
    await alice.waitFor((m) => m.type === "hello-ok");
    await bob.waitFor((m) => m.type === "hello-ok");
    alice.send({ type: "challenge", username: "bob" });
    const sent = (await alice.waitFor((m) => m.type === "challenge-sent")) as { code: string };

    // Two joins from the same account (a double-tap, or a re-opened tab).
    const first = await connect(url);
    first.send({ type: "join-room", code: sent.code, name: "alice", auth: aliceToken });
    await first.waitFor((m) => m.type === "welcome");
    const second = await connect(url);
    second.send({ type: "join-room", code: sent.code, name: "alice", auth: aliceToken });
    await second.waitFor((m) => m.type === "welcome");

    // The newest connection takes the seat over — and inherits hosting it.
    const lobby = (await second.waitFor((m) => m.type === "lobby")) as Extract<
      ServerMessage,
      { type: "lobby" }
    >;
    expect(lobby.lobby.seats).toHaveLength(1);
    expect(lobby.lobby.seats[0].isHost).toBe(true);
    // ...and the displaced connection is told it is out of the room.
    await first.waitFor((m) => m.type === "left");
  });

  it("tells the challenger when the invite is declined", async () => {
    const alice = await connect(url);
    const bob = await connect(url);
    alice.send({ type: "hello", auth: aliceToken });
    bob.send({ type: "hello", auth: bobToken });
    await alice.waitFor((m) => m.type === "hello-ok");
    await bob.waitFor((m) => m.type === "hello-ok");
    alice.send({ type: "challenge", username: "bob" });
    const invite = (await bob.waitFor((m) => m.type === "challenge-invite")) as { id: string };

    bob.send({ type: "challenge-decline", id: invite.id });
    const declined = await alice.waitFor((m) => m.type === "challenge-declined");
    expect(declined).toMatchObject({ type: "challenge-declined", from: "bob" });
  });

  it("refuses to challenge someone who isn't online", async () => {
    const alice = await connect(url);
    alice.send({ type: "hello", auth: aliceToken });
    await alice.waitFor((m) => m.type === "hello-ok");
    alice.send({ type: "challenge", username: "bob" }); // bob has no socket open
    const err = (await alice.waitFor((m) => m.type === "error")) as { message: string };
    expect(err.message).toContain("bob");
  });

  it("refuses to challenge a stranger", async () => {
    const alice = await connect(url);
    alice.send({ type: "hello", auth: aliceToken });
    await alice.waitFor((m) => m.type === "hello-ok");
    alice.send({ type: "challenge", username: "carol" });
    const err = (await alice.waitFor((m) => m.type === "error")) as { message: string };
    expect(err.message).toContain("friends");
  });

  it("ignores a challenge from a socket that never said hello", async () => {
    const stranger = await connect(url);
    stranger.send({ type: "challenge", username: "bob" });
    const err = await stranger.waitFor((m) => m.type === "error");
    expect(err).toMatchObject({ type: "error" });
  });
});
