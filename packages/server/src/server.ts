/**
 * Authoritative Greed server. The server owns every room's GameState and is the
 * only place actions are validated and applied (`@greed/core`), so clients can't
 * cheat. It also drives pacing — bot turns and the inter-turn advance run on
 * server timers so all clients see the same tempo. Because Greed has no hidden
 * information, the full GameState is broadcast to everyone.
 */

import { applyAction, determineOrder, getLegalActions, makeSeed, GOAL_DEFAULT } from "@greed/core";
import type { GameAction } from "@greed/core";
import { decide } from "@greed/bots";
import { decode, encode, isEmoteId } from "@greed/protocol";
import type { ClientMessage, ServerMessage } from "@greed/protocol";
import { verifySession } from "./auth.js";
import { markOffline, markOnline } from "./presence.js";
import type { WebSocket, WebSocketServer } from "ws";
import {
  canStart,
  clearTimers,
  lobbyView,
  makeBotSeat,
  makeHumanSeat,
  RoomStore,
  startGame,
  MAX_SEATS,
  type Room,
  type Seat,
} from "./rooms.js";

/** Tunable server timings. Defaults are used in production; tests override them. */
export interface GreedServerOptions {
  /** Hold between a finished turn and starting the next (so results are visible). */
  interTurnMs: number;
  /** A bot's "thinking" delay before it acts. */
  botThinkMs: number;
  /** Delay before autoplaying a disconnected player's turn. */
  disconnectAutoplayMs: number;
  /** Hold showing the opening roll-off before play begins. */
  rollOffMs: number;
  /** How long a connected player has to start their turn before it's forfeited. */
  turnIdleMs: number;
  /** Forfeit this many turns in one game and the player is kicked. */
  maxMissedTurns: number;
}

/** Minimum gap between one seat's emotes. */
const EMOTE_COOLDOWN_MS = 1500;

const DEFAULT_OPTIONS: GreedServerOptions = {
  interTurnMs: 1500,
  botThinkMs: 800,
  disconnectAutoplayMs: 1200,
  rollOffMs: 4200,
  turnIdleMs: 10000,
  maxMissedTurns: 3,
};

export class GreedServer {
  private store = new RoomStore();
  private conns = new Map<WebSocket, { room: Room; seat: Seat }>();
  /** Spectator sockets → the room they're watching (they hold no seat). */
  private spectators = new Map<WebSocket, Room>();
  private readonly cfg: GreedServerOptions;

  constructor(wss: WebSocketServer, options: Partial<GreedServerOptions> = {}) {
    this.cfg = { ...DEFAULT_OPTIONS, ...options };
    wss.on("connection", (ws) => this.onConnection(ws));
  }

  private onConnection(ws: WebSocket): void {
    ws.on("message", (data) => {
      let msg: ClientMessage;
      try {
        msg = decode<ClientMessage>(data.toString());
      } catch {
        return this.send(ws, { type: "error", message: "Malformed message." });
      }
      try {
        this.handle(ws, msg);
      } catch (err) {
        this.send(ws, { type: "error", message: (err as Error).message });
      }
    });
    ws.on("close", () => this.onClose(ws));
  }

  /**
   * Forget a socket's seat binding. Every path that drops a connection must go
   * through here: doing conns.delete() directly leaks the presence count, and a
   * player who was kicked would show as online to their friends forever.
   */
  private detach(ws: WebSocket, seat: Seat): void {
    this.conns.delete(ws);
    if (seat.userId) markOffline(seat.userId);
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === ws.OPEN) ws.send(encode(msg));
  }

  private broadcastLobby(room: Room): void {
    const msg: ServerMessage = { type: "lobby", lobby: lobbyView(room) };
    for (const seat of room.seats) if (seat.ws) this.send(seat.ws, msg);
    for (const ws of room.spectators) this.send(ws, msg);
  }

  /** Build the authoritative game snapshot (with presence) for a room, or null. */
  private gameMessage(room: Room): ServerMessage | null {
    if (!room.game) return null;
    // A human is "connected" when their socket is live; bots always count as present.
    const presence = room.game.players.map((p) => {
      const seat = room.seats.find((s) => s.id === p.id);
      return { id: p.id, connected: seat ? seat.isBot || seat.ws != null : false };
    });
    // Equipped dice skins, so every client can render the current player's dice.
    const skins = room.game.players.map((p) => {
      const seat = room.seats.find((s) => s.id === p.id);
      return { id: p.id, dice: seat?.dice ?? "ivory" };
    });
    return { type: "game", code: room.code, state: room.game, presence, skins };
  }

  private broadcastGame(room: Room): void {
    const msg = this.gameMessage(room);
    if (!msg) return;
    for (const seat of room.seats) if (seat.ws) this.send(seat.ws, msg);
    for (const ws of room.spectators) this.send(ws, msg);
  }

  private welcome(ws: WebSocket, room: Room, seat: Seat): void {
    this.conns.set(ws, { room, seat });
    seat.ws = ws;
    // Signed-in players show as online to their friends while connected.
    if (seat.userId) markOnline(seat.userId);
    this.send(ws, { type: "welcome", youId: seat.id, token: seat.token, code: room.code });
    if (room.phase === "in-game") this.broadcastGame(room);
    else this.broadcastLobby(room);
  }

  // -------------------------------------------------------------------------
  // Message dispatch
  // -------------------------------------------------------------------------

  private handle(ws: WebSocket, msg: ClientMessage): void {
    switch (msg.type) {
      case "ping":
        return this.send(ws, { type: "pong" });
      case "create-room": {
        const m = msg;
        this.withIdentity(ws, m.auth, (id) =>
          this.onCreate(
            ws,
            id.name ?? m.name,
            m.isPublic ?? false,
            m.goal ?? GOAL_DEFAULT,
            m.dice,
            id.userId,
          ),
        );
        return;
      }
      case "join-room": {
        const m = msg;
        this.withIdentity(ws, m.auth, (id) =>
          this.onJoin(ws, m.code, id.name ?? m.name, m.dice, id.userId),
        );
        return;
      }
      case "quick-match": {
        const m = msg;
        this.withIdentity(ws, m.auth, (id) =>
          this.onQuickMatch(ws, id.name ?? m.name, m.dice, id.userId),
        );
        return;
      }
      case "spectate":
        return this.onSpectate(ws, msg.code);
      case "reconnect":
        return this.onReconnect(ws, msg.token);
      default:
        return this.handleInRoom(ws, msg);
    }
  }

  /**
   * Resolve a client's identity from an optional account session token, then run
   * the given action. A valid token yields the account username (authoritative)
   * and user id; anything else falls back to the guest name the client sent.
   */
  private withIdentity(
    ws: WebSocket,
    auth: string | undefined,
    run: (id: { name?: string; userId?: string }) => void,
  ): void {
    const resolve = auth
      ? verifySession(auth).then((claims) =>
          claims ? { name: claims.username, userId: claims.sub } : {},
        )
      : Promise.resolve({});
    resolve
      .then(run)
      .catch((err) => this.send(ws, { type: "error", message: (err as Error).message }));
  }

  private onCreate(
    ws: WebSocket,
    name: string,
    isPublic: boolean,
    goal: number,
    dice?: string,
    userId?: string,
  ): void {
    const room = this.store.create(isPublic, goal);
    const seat = makeHumanSeat(name, true, dice, userId);
    room.seats.push(seat);
    this.welcome(ws, room, seat);
  }

  private onJoin(ws: WebSocket, code: string, name: string, dice?: string, userId?: string): void {
    const room = this.store.get(code);
    if (!room) return this.send(ws, { type: "error", message: "No room with that code." });
    if (room.phase !== "lobby")
      return this.send(ws, { type: "error", message: "That game has already started." });
    if (room.seats.length >= MAX_SEATS)
      return this.send(ws, { type: "error", message: "That room is full." });
    const seat = makeHumanSeat(name, false, dice, userId);
    room.seats.push(seat);
    this.welcome(ws, room, seat);
    this.broadcastLobby(room);
  }

  private onQuickMatch(ws: WebSocket, name: string, dice?: string, userId?: string): void {
    const room = this.store.findOpenPublic() ?? this.store.create(true, GOAL_DEFAULT);
    const isHost = room.seats.length === 0;
    const seat = makeHumanSeat(name, isHost, dice, userId);
    room.seats.push(seat);
    this.welcome(ws, room, seat);
    this.broadcastLobby(room);
  }

  /** Attach a read-only watcher to a room and send it the current snapshot. */
  private onSpectate(ws: WebSocket, code: string): void {
    if (this.conns.has(ws) || this.spectators.has(ws)) return; // already in a room
    const room = this.store.get(code);
    if (!room) return this.send(ws, { type: "error", message: "No room with that code." });
    room.spectators.add(ws);
    this.spectators.set(ws, room);
    this.send(ws, { type: "spectating", code: room.code });
    // Bring the watcher up to speed: the live game if one is running, else the lobby.
    const snapshot = this.gameMessage(room);
    this.send(ws, snapshot ?? { type: "lobby", lobby: lobbyView(room) });
  }

  private onReconnect(ws: WebSocket, token: string): void {
    const found = this.store.findByToken(token);
    if (!found) return this.send(ws, { type: "error", message: "Session expired." });
    found.seat.ws = ws;
    this.welcome(ws, found.room, found.seat);
    // Let the rest of the table see them come back online.
    if (found.room.phase === "in-game") this.broadcastGame(found.room);
  }

  /** Messages that require the sender to already be seated in a room. */
  private handleInRoom(ws: WebSocket, msg: ClientMessage): void {
    const conn = this.conns.get(ws);
    if (!conn) {
      // A spectator holds no seat; the only thing it may do is stop watching.
      if (this.spectators.has(ws)) {
        if (msg.type === "leave") {
          this.send(ws, { type: "left" });
          this.dropSpectator(ws);
        }
        return;
      }
      return this.send(ws, { type: "error", message: "You are not in a room." });
    }
    const { room, seat } = conn;
    const isHost = seat.isHost;

    switch (msg.type) {
      case "set-ready":
        seat.ready = msg.ready;
        return this.broadcastLobby(room);

      case "set-goal":
        if (!isHost || room.phase !== "lobby") return;
        room.goal = msg.goal;
        return this.broadcastLobby(room);

      case "add-bot": {
        if (!isHost || room.phase !== "lobby") return;
        if (room.seats.length >= MAX_SEATS) return;
        const botCount = room.seats.filter((s) => s.isBot).length + 1;
        room.seats.push(makeBotSeat(msg.difficulty, botCount, msg.personality));
        return this.broadcastLobby(room);
      }

      case "remove-seat": {
        if (!isHost || room.phase !== "lobby") return;
        const target = room.seats.find((s) => s.id === msg.seatId);
        if (!target || target.isHost) return;
        room.seats = room.seats.filter((s) => s.id !== target.id);
        if (target.ws) {
          this.send(target.ws, { type: "left" });
          this.detach(target.ws, target);
        }
        return this.broadcastLobby(room);
      }

      case "start-game": {
        if (!isHost || room.phase !== "lobby" || !canStart(room)) return;
        return this.beginRollOff(room);
      }

      case "game-action":
        return this.onGameAction(room, seat, msg.action);

      case "emote": {
        // Spectators watch silently, and the id is validated so the fixed set
        // stays fixed even if a client sends something else.
        if (!isEmoteId(msg.emote)) return;
        // A reaction should feel like a nudge, not a firehose: one per cooldown.
        const now = Date.now();
        if (seat.lastEmoteAt && now - seat.lastEmoteAt < EMOTE_COOLDOWN_MS) return;
        seat.lastEmoteAt = now;
        const out: ServerMessage = { type: "emote", playerId: seat.id, emote: msg.emote };
        for (const s of room.seats) if (s.ws) this.send(s.ws, out);
        for (const w of room.spectators) this.send(w, out);
        return;
      }

      case "rematch": {
        if (!isHost || room.phase !== "in-game") return;
        clearTimers(room);
        room.phase = "lobby";
        room.game = null;
        for (const s of room.seats) if (!s.isBot) s.ready = s.isHost;
        return this.broadcastLobby(room);
      }

      case "leave":
        return this.leaveRoom(ws);

      default:
        return;
    }
  }

  private onGameAction(room: Room, seat: Seat, action: GameAction): void {
    const g = room.game;
    if (!g || room.phase !== "in-game" || g.phase === "game-over") return;
    // The server owns ADVANCE (inter-turn timing); clients only ROLL or BANK.
    if (action.type !== "ROLL" && action.type !== "BANK") return;
    const current = g.players[g.turn.playerIndex];
    if (current.id !== seat.id) return; // not your turn
    const legal = getLegalActions(g);
    if (action.type === "ROLL" && !legal.canRoll) return;
    if (action.type === "BANK" && !legal.canBank) return;
    this.applyAndBroadcast(room, action);
  }

  // -------------------------------------------------------------------------
  // Authoritative loop
  // -------------------------------------------------------------------------

  /** Run the opening roll-off, broadcast it, then start the game after a beat. */
  private beginRollOff(room: Room): void {
    const seed = makeSeed(Date.now() ^ Math.floor(Math.random() * 2 ** 31));
    const { order, entries } = determineOrder(room.seats.length, seed);
    const rows = order.map((pi) => ({
      name: room.seats[pi].name,
      dice: entries[pi].dice,
      sum: entries[pi].sum,
    }));
    room.phase = "in-game"; // protect seats from lobby-removal during the roll-off
    const msg: ServerMessage = { type: "roll-off", rows };
    for (const seat of room.seats) if (seat.ws) this.send(seat.ws, msg);
    for (const ws of room.spectators) this.send(ws, msg);

    this.schedule(room, this.cfg.rollOffMs, () => {
      startGame(room, order);
      this.broadcastGame(room);
      this.scheduleFollowups(room);
    });
  }

  private applyAndBroadcast(room: Room, action: Parameters<typeof applyAction>[1]): void {
    if (!room.game) return;
    room.game = applyAction(room.game, action);
    this.broadcastGame(room);
    this.scheduleFollowups(room);
  }

  private schedule(room: Room, ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      room.timers.delete(t);
      try {
        fn();
      } catch {
        /* room may have been torn down */
      }
    }, ms);
    room.timers.add(t);
  }

  /** Decide what happens next: advance a finished turn, or play a bot / stalled seat. */
  private scheduleFollowups(room: Room): void {
    clearTimers(room);
    const g = room.game;
    if (!g || g.phase === "game-over") return;

    if (g.turn.outcome) {
      this.schedule(room, this.cfg.interTurnMs, () =>
        this.applyAndBroadcast(room, { type: "ADVANCE" }),
      );
      return;
    }

    const seat = room.seats.find((s) => s.id === g.players[g.turn.playerIndex].id);
    const isBot = seat?.isBot ?? true;
    const disconnected = !isBot && seat?.ws == null;

    if (isBot || disconnected) {
      const difficulty = seat?.difficulty ?? "medium";
      const delay = disconnected ? this.cfg.disconnectAutoplayMs : this.cfg.botThinkMs;
      this.schedule(room, delay, () => {
        if (!room.game) return;
        this.applyAndBroadcast(room, decide(room.game, difficulty));
      });
      return;
    }

    // A connected human. If they haven't STARTED their turn (no roll yet), give
    // them a grace period; a time-out forfeits the turn and counts against them.
    if (seat && g.turn.rollCount === 0) {
      this.schedule(room, this.cfg.turnIdleMs, () => this.onTurnTimeout(room, seat));
    }
    // Otherwise (they've already rolled) wait for their ROLL/BANK.
  }

  /**
   * A connected human let their turn's grace period lapse without starting it.
   * Forfeit the turn, count the miss, and kick the player once they hit the cap.
   */
  private onTurnTimeout(room: Room, seat: Seat): void {
    const g = room.game;
    if (!g || g.phase === "game-over") return;
    // Still their turn, still not started, still connected? (Guards stale timers.)
    if (g.players[g.turn.playerIndex].id !== seat.id) return;
    if (g.turn.rollCount !== 0 || seat.ws == null) return;

    seat.missedTurns += 1;
    room.game = applyAction(g, { type: "SKIP" });

    if (seat.missedTurns >= this.cfg.maxMissedTurns) {
      this.kickSeat(room, seat);
      // Everyone gone? kickSeat tore the room down; nothing more to do.
      if (!this.store.get(room.code)) return;
    }

    this.broadcastGame(room);
    this.scheduleFollowups(room);
  }

  /**
   * Remove a seat from a running game (a kick). The player is dropped from the
   * room and told to leave; their game slot stays in the state and auto-plays
   * like a disconnected player, so turn order and indices are preserved.
   */
  private kickSeat(room: Room, seat: Seat): void {
    const ws = seat.ws;
    seat.ws = null;
    room.seats = room.seats.filter((s) => s.id !== seat.id);
    if (seat.isHost) this.reassignHost(room);
    if (ws) {
      this.detach(ws, seat);
      this.send(ws, { type: "left" });
    }
    // If no connected humans remain, tear the room (and its watchers) down.
    if (!room.seats.some((s) => !s.isBot && s.ws)) {
      for (const spectatorWs of room.spectators) this.send(spectatorWs, { type: "left" });
      room.spectators.clear();
      this.store.delete(room);
    }
  }

  // -------------------------------------------------------------------------
  // Disconnect / leave
  // -------------------------------------------------------------------------

  /** Detach a spectator socket from whatever room it was watching. */
  private dropSpectator(ws: WebSocket): void {
    const room = this.spectators.get(ws);
    if (!room) return;
    this.spectators.delete(ws);
    room.spectators.delete(ws);
  }

  private onClose(ws: WebSocket): void {
    if (this.spectators.has(ws)) return this.dropSpectator(ws);
    const conn = this.conns.get(ws);
    if (!conn) return;
    const { room, seat } = conn;
    this.detach(ws, seat);
    seat.ws = null;

    if (room.phase === "lobby") {
      // Remove the empty seat outright in the lobby.
      room.seats = room.seats.filter((s) => s.id !== seat.id);
      if (seat.isHost) this.reassignHost(room);
    } else {
      // In-game: keep the seat for reconnection, but keep play moving and tell
      // the others this player dropped (presence dot + toast).
      this.scheduleFollowups(room);
      if (room.game) this.broadcastGame(room);
    }

    if (!room.seats.some((s) => !s.isBot && s.ws)) {
      // Nobody human left connected — tear the room down and release its watchers.
      for (const spectatorWs of room.spectators) {
        this.send(spectatorWs, { type: "left" });
        this.spectators.delete(spectatorWs);
      }
      room.spectators.clear();
      this.store.delete(room);
      return;
    }
    if (room.phase === "lobby") this.broadcastLobby(room);
  }

  private leaveRoom(ws: WebSocket): void {
    const conn = this.conns.get(ws);
    if (!conn) return;
    this.send(ws, { type: "left" });
    this.onClose(ws);
  }

  private reassignHost(room: Room): void {
    if (room.seats.some((s) => s.isHost)) return;
    const next = room.seats.find((s) => !s.isBot);
    if (next) {
      next.isHost = true;
      next.ready = true;
    }
  }
}
