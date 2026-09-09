/**
 * What one connection may do to the room store.
 *
 * These exist because a socket could once make unlimited rooms and none of them
 * were ever freed: every door but `spectate` let a socket that was already in a
 * room walk through it again, which overwrote its entry in `conns` and left the
 * old room holding a seat that pointed at a live socket. It looked occupied
 * forever. One connection, twenty-five messages, twenty-four permanent rooms.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocketServer } from "ws";
import WebSocket from "ws";
import type { AddressInfo } from "node:net";
import { encode, decode, type ClientMessage, type ServerMessage } from "@greed/protocol";

vi.mock("./db.js", () => ({ accountsEnabled: () => false, query: async () => ({ rows: [] }) }));

const { GreedServer } = await import("./server.js");

const settle = (ms = 250) => new Promise((r) => setTimeout(r, ms));

describe("one connection, one table", () => {
  let wss: WebSocketServer;
  let server: InstanceType<typeof GreedServer>;
  let url: string;

  beforeEach(async () => {
    wss = new WebSocketServer({ port: 0 });
    server = new GreedServer(wss, { heartbeatMs: 0 });
    await new Promise<void>((r) => wss.once("listening", () => r()));
    url = `ws://localhost:${(wss.address() as AddressInfo).port}`;
  });
  afterEach(() => {
    server.stop();
    wss.close();
  });

  /** Rooms the store is currently holding. */
  const rooms = (): number =>
    (server as unknown as { store: { all(): unknown[] } }).store.all().length;

  async function connect(): Promise<{
    send: (m: ClientMessage) => void;
    msgs: ServerMessage[];
    close: () => void;
  }> {
    const ws = new WebSocket(url);
    const msgs: ServerMessage[] = [];
    ws.on("message", (d) => msgs.push(decode<ServerMessage>(d.toString())));
    await new Promise<void>((r) => ws.once("open", () => r()));
    return { send: (m) => ws.send(encode(m)), msgs, close: () => ws.close() };
  }

  it("makes one room however many times it asks", async () => {
    const c = await connect();
    for (let i = 0; i < 25; i++) c.send({ type: "create-room", name: `spam${i}`, isPublic: false });
    await settle();

    const welcomes = c.msgs.filter((m) => m.type === "welcome");
    expect(welcomes).toHaveLength(1);
    expect(rooms()).toBe(1);

    // And that one goes when the socket does.
    c.close();
    await settle(400);
    expect(rooms()).toBe(0);
  });

  it("refuses a second room while the first is still open", async () => {
    const c = await connect();
    c.send({ type: "create-room", name: "Host", isPublic: false });
    await settle();
    c.msgs.length = 0;
    c.send({ type: "create-room", name: "Host", isPublic: false });
    await settle();
    const err = c.msgs.find((m) => m.type === "error");
    expect(err && "message" in err ? err.message : "").toMatch(/already at a table/i);
    c.close();
  });

  it("holds a socket to one room across the other doors too", async () => {
    const c = await connect();
    c.send({ type: "create-room", name: "Host", isPublic: false });
    await settle();
    const before = rooms();
    // Every one of these used to strand the room the socket was already in.
    c.send({ type: "quick-match", name: "Host" });
    c.send({ type: "join-room", code: "ZZZZ", name: "Host" });
    c.send({ type: "reconnect", token: "not-a-real-token" });
    await settle();
    expect(rooms()).toBe(before);
    c.close();
    await settle(400);
    expect(rooms()).toBe(0);
  });

  it("cuts off a socket that keeps guessing room codes", async () => {
    const c = await connect();
    for (let i = 0; i < 25; i++) c.send({ type: "join-room", code: "AAAA", name: "Guesser" });
    await settle(500);
    // It is hung up on rather than left to walk the code space.
    expect(c.msgs.filter((m) => m.type === "error").length).toBeLessThanOrEqual(21);
  });
});
