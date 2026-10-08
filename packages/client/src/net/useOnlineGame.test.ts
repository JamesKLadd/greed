import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyAction, canToggleLock, createGame, type GameState } from "@greed/core";
import { encode, type ClientMessage, type ServerMessage } from "@greed/protocol";
import { useOnlineGame } from "./useOnlineGame.js";

// Run the real controller with hook storage and WebSocket replies. The project
// uses node Vitest, so no DOM renderer or live networking is required here.
const hooks = vi.hoisted(() => ({
  cursor: 0,
  slots: [] as unknown[],
  cleanup: [] as (() => void)[],
}));
vi.mock("react", () => ({
  useState(initial: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.slots))
      hooks.slots[index] = typeof initial === "function" ? initial() : initial;
    return [
      hooks.slots[index],
      (next: unknown) => {
        hooks.slots[index] = typeof next === "function" ? next(hooks.slots[index]) : next;
      },
    ];
  },
  useRef(initial: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
    return hooks.slots[index];
  },
  useCallback: (fn: unknown) => fn,
  useEffect(effect: () => void | (() => void), dependencies?: unknown[]) {
    const index = hooks.cursor++;
    if (!dependencies || !(index in hooks.slots)) {
      hooks.slots[index] = true;
      const cleanup = effect();
      if (cleanup) hooks.cleanup.push(cleanup);
    }
  },
}));
vi.mock("../beta/BetaContext.js", () => ({ useBeta: () => ({ enabled: false }) }));
vi.mock("../beta/AppearanceContext.js", () => ({ useAppearance: () => ({ appearance: {} }) }));

class Socket {
  static readonly OPEN = 1;
  static readonly CONNECTING = 0;
  static instances: Socket[] = [];
  readyState = Socket.CONNECTING;
  sent: ClientMessage[] = [];
  onmessage?: (event: { data: string }) => void;
  onopen?: () => void;
  onclose?: () => void;
  onerror?: () => void;

  constructor() {
    Socket.instances.push(this);
  }
  send(raw: string) {
    this.sent.push(JSON.parse(raw) as ClientMessage);
  }
  open() {
    this.readyState = Socket.OPEN;
    this.onopen?.();
  }
  receive(message: ServerMessage) {
    this.onmessage?.({ data: encode(message) });
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
}

function game(seed = 1): GameState {
  return createGame(
    [
      { id: "you", name: "You", isBot: false },
      { id: "other", name: "Other", isBot: false },
    ],
    { goal: 3000, seed, startIndex: 0 },
  );
}
const scoringSeed = Array.from({ length: 100 }, (_, i) => i + 1).find(
  (seed) => !applyAction(game(seed), { type: "ROLL" }).turn.outcome,
)!;

function render() {
  hooks.cursor = 0;
  // This node-only harness supplies React's hook storage instead of a renderer.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useOnlineGame();
}
function snapshot(socket: Socket, state: GameState) {
  socket.receive({ type: "game", code: "ROOM", state, presence: [], skins: [] });
}
function connect(state = game(scoringSeed)) {
  const net = render();
  net.createRoom("You");
  const socket = Socket.instances.at(-1)!;
  socket.open();
  socket.receive({ type: "welcome", code: "ROOM", youId: "you", token: "saved-session" });
  snapshot(socket, state);
  return { net: render(), socket, state };
}
function actions(socket: Socket) {
  return socket.sent.filter((message) => message.type === "game-action");
}

beforeEach(() => {
  hooks.cursor = 0;
  hooks.slots = [];
  hooks.cleanup = [];
  Socket.instances = [];
  const saved = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
    removeItem: (key: string) => saved.delete(key),
  });
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("window", globalThis);
  vi.useFakeTimers();
});
afterEach(() => {
  for (const cleanup of hooks.cleanup.splice(0)) cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("online action synchronization", () => {
  it("sends one throw for a double tap and keeps input locked until its dice land", () => {
    const { net, socket, state } = connect();
    net.roll();
    net.roll();
    net.bank();
    expect(actions(socket)).toHaveLength(1);
    expect(render().isPendingAction).toBe(true);

    // Presence and clock messages repeating the old board do not accept a move.
    snapshot(socket, state);
    render().roll();
    expect(actions(socket)).toHaveLength(1);
    expect(render().isPendingAction).toBe(true);

    const rolled = applyAction(state, { type: "ROLL" });
    snapshot(socket, rolled);
    expect(render().isRolling).toBe(true);
    expect(render().isPendingAction).toBe(true);
    render().roll();
    vi.advanceTimersByTime(599);
    expect(actions(socket)).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(render().game).toEqual(rolled);
    expect(render().isPendingAction).toBe(false);
    render().bank();
    expect(actions(socket)).toHaveLength(2);
  });

  it("does not let a roll or another tap overtake a hold acknowledgment", () => {
    const state = applyAction(game(scoringSeed), { type: "ROLL" });
    const { socket, net } = connect(state);
    const index = state.turn.dice.findIndex((_, i) => canToggleLock(state.turn, i));
    net.toggleDie(index);
    net.roll();
    net.toggleDie(index);
    expect(actions(socket)).toEqual([
      { type: "game-action", action: { type: "TOGGLE_LOCK", index } },
    ]);
    const held = applyAction(state, { type: "TOGGLE_LOCK", index });
    snapshot(socket, held);
    expect(render().game?.turn.locked).toEqual(held.turn.locked);
    expect(render().isPendingAction).toBe(false);
    render().roll();
    expect(actions(socket)).toHaveLength(2);
  });

  it("allows retry after a rejected action and discards pending input when reconnecting", () => {
    const { net, socket, state } = connect();
    net.roll();
    socket.receive({ type: "error", message: "Rejected move" });
    expect(render().isPendingAction).toBe(false);
    render().roll();
    expect(actions(socket)).toHaveLength(2);
    socket.close();
    render().bank();
    render().roll();
    expect(actions(socket)).toHaveLength(2);
    vi.advanceTimersByTime(400);
    const reconnected = Socket.instances.at(-1)!;
    reconnected.open();
    reconnected.receive({ type: "welcome", code: "ROOM", youId: "you", token: "next-session" });
    snapshot(reconnected, state);
    expect(render().isPendingAction).toBe(false);
    render().roll();
    expect(actions(reconnected)).toHaveLength(1);
  });

  it("cancels a previous game's pending animation when a rematch starts", () => {
    const { net, socket, state } = connect();
    const oldEpoch = net.presentationEpoch;
    net.roll();
    snapshot(socket, applyAction(state, { type: "ROLL" }));
    expect(render().isRolling).toBe(true);
    const rematch = game(scoringSeed + 1);
    snapshot(socket, rematch);
    expect(render().game).toEqual(rematch);
    expect(render().presentationEpoch).toBeGreaterThan(oldEpoch);
    expect(render().isPendingAction).toBe(false);
    vi.advanceTimersByTime(600);
    expect(render().game).toEqual(rematch);
  });

  it("never sends gameplay while spectating or while another seat owns the turn", () => {
    const other = game(scoringSeed);
    other.turn.playerIndex = 1;
    const { net, socket } = connect(other);
    net.roll();
    net.bank();
    net.toggleDie(0);
    expect(actions(socket)).toHaveLength(0);
    socket.receive({ type: "spectating", code: "ROOM" });
    snapshot(socket, game(scoringSeed));
    render().roll();
    expect(actions(socket)).toHaveLength(0);
  });
});
