/**
 * Authoritative Greed server. The server owns every room's GameState and is the
 * only place actions are validated and applied (`@greed/core`), so clients can't
 * cheat. It also drives pacing — bot turns and the inter-turn advance run on
 * server timers so all clients see the same tempo. Because Greed has no hidden
 * information, the full GameState is broadcast to everyone.
 */

import {
  applyAction,
  determineOrder,
  getLegalActions,
  isWinner,
  makeSeed,
  teamSeatingOrder,
  GOAL_DEFAULT,
} from "@greed/core";
import type { GameAction } from "@greed/core";
import { decide } from "@greed/bots";
import { decode, encode, isEmoteId } from "@greed/protocol";
import type { ClientMessage, ServerMessage } from "@greed/protocol";
import { verifySession } from "./auth.js";
import { markOffline, markOnline } from "./presence.js";
import { requireFriend } from "./social.js";
import { recordMatch } from "./leaderboards.js";
import { accountsEnabled } from "./db.js";
import { randomUUID } from "node:crypto";
import type { WebSocket, WebSocketServer } from "ws";
import {
  canStart,
  clearTimers,
  lobbyView,
  makeBotSeat,
  makeHumanSeat,
  RoomStore,
  rebalanceTeams,
  startGame,
  teamsAvailable,
  teamsBalanced,
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
  /**
   * How often every socket is pinged to prove it is still there. 0 disables it.
   *
   * This is not a nicety. A socket that dies without closing cleanly — a phone
   * that sleeps, a laptop lid, wifi that drops mid-turn — leaves the server
   * believing that player is present and waiting on them, which stalls the
   * whole table until the operating system eventually gives up on the TCP
   * connection, minutes later. A ping that goes unanswered for two rounds is
   * how that gets noticed in seconds instead. It doubles as the keep-alive that
   * stops an idle proxy closing a connection that is perfectly healthy.
   */
  heartbeatMs: number;
}

/** Minimum gap between one seat's emotes. */
const EMOTE_COOLDOWN_MS = 1500;

/** How long a challenge (and the empty room held for it) stays open. */
const CHALLENGE_TTL_MS = 120_000;

/** Minimum gap between one player's challenges, so an invite can't be spammed. */
const CHALLENGE_COOLDOWN_MS = 5000;

/**
 * How long a game in progress is held open after the last human drops.
 *
 * A room used to be destroyed the moment nobody was connected to it, which made
 * a dropped connection unrecoverable by definition: the player's client would
 * come back a fraction of a second later to be told the session had expired,
 * because the table it was asking for no longer existed. Wifi drops for a few
 * seconds; a phone locks; a laptop lid closes. The game waits.
 */
const EMPTY_ROOM_TTL_MS = 60_000;

/** A pending friend challenge: a private room held open for two players. */
interface Challenge {
  id: string;
  code: string;
  fromUserId: string;
  fromName: string;
  toUserId: string;
  timer: NodeJS.Timeout;
}

/** A notification-only socket: a signed-in player with no seat. */
interface Notifier {
  userId: string;
  username: string;
  lastChallengeAt?: number;
}

const DEFAULT_OPTIONS: GreedServerOptions = {
  // An unhurried hold, matching the offline game. A bust especially needs a beat
  // to land; being swept straight into the next turn reads as the game skipping
  // past what just happened. Clients enforce this as a MINIMUM on their side too
  // (see the display queue in useOnlineGame), so a slow link can't cut it short.
  interTurnMs: 2100,
  // Long enough that a bot's run of rolls reads as a turn being played out
  // rather than dice flickering past.
  botThinkMs: 1300,
  disconnectAutoplayMs: 1200,
  rollOffMs: 4200,
  turnIdleMs: 10000,
  maxMissedTurns: 3,
  heartbeatMs: 20000,
};

export class GreedServer {
  private store = new RoomStore();
  private conns = new Map<WebSocket, { room: Room; seat: Seat }>();
  /** Spectator sockets → the room they're watching (they hold no seat). */
  private spectators = new Map<WebSocket, Room>();
  /** Notification sockets → the signed-in player behind them (no seat, no room). */
  private notifiers = new Map<WebSocket, Notifier>();
  /** Reverse index of the above: a player may have several tabs open. */
  private byUser = new Map<string, Set<WebSocket>>();
  /** Open challenges, keyed by id. */
  private challenges = new Map<string, Challenge>();
  private readonly cfg: GreedServerOptions;
  /** Sockets that have answered the most recent heartbeat. */
  private alive = new WeakSet<WebSocket>();
  private heartbeat: NodeJS.Timeout | null = null;

  constructor(wss: WebSocketServer, options: Partial<GreedServerOptions> = {}) {
    this.cfg = { ...DEFAULT_OPTIONS, ...options };
    wss.on("connection", (ws) => this.onConnection(ws));
    if (this.cfg.heartbeatMs > 0) this.startHeartbeat(wss);
    wss.on("close", () => this.stop());
  }

  /**
   * Ping every socket on an interval and hang up on any that missed the last
   * one. Terminating fires the usual close handling, so a player whose
   * connection died silently is treated exactly like one who left: their seat
   * is held for a reconnect, and play carries on without them.
   */
  private startHeartbeat(wss: WebSocketServer): void {
    this.heartbeat = setInterval(() => {
      for (const ws of wss.clients) {
        if (!this.alive.has(ws)) {
          ws.terminate();
          continue;
        }
        this.alive.delete(ws);
        try {
          ws.ping();
        } catch {
          /* a socket closing under us is not an error */
        }
      }
    }, this.cfg.heartbeatMs);
    // Never let the heartbeat be the reason the process stays up.
    this.heartbeat.unref?.();
  }

  /** Stop the heartbeat (the server is shutting down). */
  stop(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  private onConnection(ws: WebSocket): void {
    this.alive.add(ws);
    ws.on("pong", () => this.alive.add(ws));
    ws.on("message", (data) => {
      // Any traffic at all proves the socket is live; a client that is chatting
      // must never be hung up on for missing a ping it never saw.
      this.alive.add(ws);
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
      return { id: p.id, dice: seat?.dice ?? "ivory", avatar: seat?.avatar ?? "" };
    });
    // Recomputed at send time, so the incidental re-broadcasts (a reconnect, a
    // disconnect) carry a correctly SHORTENED remainder rather than restarting
    // the countdown on everyone's screen.
    const left = room.turnDeadline ? room.turnDeadline - Date.now() : 0;
    // The rematch tally only means anything once the game is over, and sending
    // it while playing would put a changing field in every mid-game snapshot.
    const over = room.game.phase === "game-over";
    return {
      type: "game",
      code: room.code,
      state: room.game,
      presence,
      skins,
      turnTimerMs: left > 0 ? left : undefined,
      rematch: over
        ? {
            votes: [...room.rematchVotes],
            needed: room.seats.filter((s) => !s.isBot && s.ws !== null).length,
          }
        : undefined,
    };
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
            m.avatar,
          ),
        );
        return;
      }
      case "join-room": {
        const m = msg;
        this.withIdentity(ws, m.auth, (id) =>
          this.onJoin(ws, m.code, id.name ?? m.name, m.dice, id.userId, m.avatar),
        );
        return;
      }
      case "quick-match": {
        const m = msg;
        this.withIdentity(ws, m.auth, (id) =>
          this.onQuickMatch(ws, id.name ?? m.name, m.dice, id.userId, m.avatar),
        );
        return;
      }
      case "spectate":
        return this.onSpectate(ws, msg.code);
      case "reconnect":
        return this.onReconnect(ws, msg.token);
      case "hello":
        return this.onHello(ws, msg.auth);
      case "challenge":
        return this.onChallenge(ws, msg.username);
      case "challenge-decline":
        return this.onChallengeDecline(ws, msg.id);
      default:
        return this.handleInRoom(ws, msg);
    }
  }

  // -------------------------------------------------------------------------
  // Notifications: presence and friend challenges
  // -------------------------------------------------------------------------

  /**
   * Register a notification-only socket. This is what makes "online" in the
   * friends list mean "has the game open" rather than "is sitting in a room",
   * and it is the channel a challenge arrives on.
   */
  private onHello(ws: WebSocket, auth: string): void {
    if (this.notifiers.has(ws)) return;
    verifySession(auth)
      .then((claims) => {
        if (!claims) return this.send(ws, { type: "error", message: "Please log in again." });
        // The socket may have closed while the token was being verified.
        if (ws.readyState !== ws.OPEN) return;
        this.notifiers.set(ws, { userId: claims.sub, username: claims.username });
        let set = this.byUser.get(claims.sub);
        if (!set) this.byUser.set(claims.sub, (set = new Set()));
        set.add(ws);
        markOnline(claims.sub);
        this.send(ws, { type: "hello-ok", username: claims.username });
      })
      .catch((err) => this.send(ws, { type: "error", message: (err as Error).message }));
  }

  /** Send a message to every socket a player currently has open. */
  private sendToUser(userId: string, msg: ServerMessage): number {
    const set = this.byUser.get(userId);
    if (!set || set.size === 0) return 0;
    for (const ws of set) this.send(ws, msg);
    return set.size;
  }

  /**
   * Invite a friend to a private room. The room is created up front and both
   * players simply join it by code, so accepting is nothing more than a join —
   * no separate handshake to get out of step with.
   */
  private onChallenge(ws: WebSocket, username: string): void {
    const me = this.notifiers.get(ws);
    if (!me) return this.send(ws, { type: "error", message: "Please log in again." });

    const now = Date.now();
    if (me.lastChallengeAt && now - me.lastChallengeAt < CHALLENGE_COOLDOWN_MS) {
      return this.send(ws, { type: "error", message: "Give them a moment to answer." });
    }

    requireFriend(me.userId, username)
      .then((friend) => {
        if (!this.byUser.get(friend.id)?.size) {
          return this.send(ws, {
            type: "error",
            message: `${friend.username} isn't online right now.`,
          });
        }
        me.lastChallengeAt = Date.now();

        const room = this.store.create(false, GOAL_DEFAULT);
        const id = `c_${randomUUID().slice(0, 8)}`;
        // Nobody may ever join, so the room can't be left to leak: drop both it
        // and the invite once the offer goes stale. Unref'd so a pending invite
        // never holds the process open.
        const timer = setTimeout(() => this.expireChallenge(id), CHALLENGE_TTL_MS);
        timer.unref?.();
        const challenge: Challenge = {
          id,
          code: room.code,
          fromUserId: me.userId,
          fromName: me.username,
          toUserId: friend.id,
          timer,
        };
        this.challenges.set(id, challenge);

        this.sendToUser(friend.id, {
          type: "challenge-invite",
          id,
          from: me.username,
          code: room.code,
        });
        this.send(ws, { type: "challenge-sent", id, to: friend.username, code: room.code });
      })
      .catch((err) => this.send(ws, { type: "error", message: (err as Error).message }));
  }

  private onChallengeDecline(ws: WebSocket, id: string): void {
    const me = this.notifiers.get(ws);
    const challenge = this.challenges.get(id);
    if (!me || !challenge || challenge.toUserId !== me.userId) return;
    this.sendToUser(challenge.fromUserId, {
      type: "challenge-declined",
      id,
      from: me.username,
    });
    this.expireChallenge(id);
  }

  /** Drop an invite, and the room held for it if nobody ever sat down. */
  private expireChallenge(id: string): void {
    const challenge = this.challenges.get(id);
    if (!challenge) return;
    clearTimeout(challenge.timer);
    this.challenges.delete(id);
    const room = this.store.get(challenge.code);
    if (room && room.seats.length === 0) this.store.delete(room);
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
    avatar?: string,
  ): void {
    const room = this.store.create(isPublic, goal);
    const seat = makeHumanSeat(name, true, dice, userId, avatar);
    room.seats.push(seat);
    this.welcome(ws, room, seat);
  }

  private onJoin(
    ws: WebSocket,
    code: string,
    name: string,
    dice?: string,
    userId?: string,
    avatar?: string,
  ): void {
    const room = this.store.get(code);
    if (!room) return this.send(ws, { type: "error", message: "No room with that code." });
    if (room.phase !== "lobby")
      return this.send(ws, { type: "error", message: "That game has already started." });

    // A room held open for a challenge has no seats yet: whoever arrives first
    // (normally the challenger) hosts it.
    let isHost = room.seats.length === 0;

    // One account, one seat. A second join from the same player — a double-tap,
    // a re-opened tab — takes their seat over instead of sitting them at the
    // table twice.
    if (userId) {
      const twin = room.seats.find((s) => s.userId === userId);
      if (twin) {
        isHost = isHost || twin.isHost;
        room.seats = room.seats.filter((s) => s.id !== twin.id);
        if (twin.ws && twin.ws !== ws) {
          this.send(twin.ws, { type: "left" });
          this.detach(twin.ws, twin);
        }
      }
    }

    if (room.seats.length >= MAX_SEATS)
      return this.send(ws, { type: "error", message: "That room is full." });
    const seat = makeHumanSeat(name, isHost, dice, userId, avatar);
    room.seats.push(seat);
    this.welcome(ws, room, seat);
    this.broadcastLobby(room);
  }

  private onQuickMatch(
    ws: WebSocket,
    name: string,
    dice?: string,
    userId?: string,
    avatar?: string,
  ): void {
    const room = this.store.findOpenPublic() ?? this.store.create(true, GOAL_DEFAULT);
    const isHost = room.seats.length === 0;
    const seat = makeHumanSeat(name, isHost, dice, userId, avatar);
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
    // If the table was being held empty, this is the player it was held for.
    this.resumeRoom(found.room);
    this.welcome(ws, found.room, found.seat);
    // Let the rest of the table see them come back online.
    if (found.room.phase === "in-game") this.broadcastGame(found.room);
  }

  /**
   * The last human left a game in progress. Stop the clock and hold the table.
   *
   * Nothing may happen while nobody is watching — bots would play the game out
   * to an empty room, and whoever comes back would arrive at a result rather
   * than at their turn. So the follow-up timers are cleared and the room simply
   * waits, until either someone reconnects or the grace period runs out.
   */
  private holdRoom(room: Room): void {
    if (room.emptyTimer) return;
    clearTimers(room);
    room.emptyTimer = setTimeout(() => {
      room.emptyTimer = null;
      for (const ws of room.spectators) this.send(ws, { type: "left" });
      room.spectators.clear();
      this.store.delete(room);
    }, EMPTY_ROOM_TTL_MS);
    room.emptyTimer.unref?.();
  }

  /** Somebody came back to a held table: cancel the teardown and restart play. */
  private resumeRoom(room: Room): void {
    if (!room.emptyTimer) return;
    clearTimeout(room.emptyTimer);
    room.emptyTimer = null;
    this.scheduleFollowups(room);
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
        room.seats.push(makeBotSeat(botCount, msg.personality));
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

      case "set-teams": {
        if (!isHost || room.phase !== "lobby") return;
        if (msg.teams && !teamsAvailable(room)) return;
        room.teams = msg.teams;
        // Snap to alternating sides on the way in, so the common case needs no
        // further fiddling and the room is immediately startable.
        if (msg.teams && !teamsBalanced(room)) rebalanceTeams(room);
        return this.broadcastLobby(room);
      }

      case "set-turn-timer": {
        if (!isHost || room.phase !== "lobby") return;
        room.turnTimer = msg.enabled;
        return this.broadcastLobby(room);
      }

      case "set-seat-team": {
        if (!isHost || room.phase !== "lobby" || !room.teams) return;
        if (msg.team !== 0 && msg.team !== 1) return;
        const target = room.seats.find((s) => s.id === msg.seatId);
        if (!target) return;
        target.team = msg.team;
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
        // A vote, open to everyone still at the table — not a host command.
        // Running it back is the common case after a game, and making everyone
        // wait on one person (who may have closed the tab) is what sent tables
        // back to the lobby instead.
        if (room.phase !== "in-game" || room.game?.phase !== "game-over") return;
        if (room.rematchVotes.has(seat.id)) room.rematchVotes.delete(seat.id);
        else room.rematchVotes.add(seat.id);

        const waitingOn = room.seats.filter((s) => !s.isBot && s.ws !== null);
        const allIn = waitingOn.length > 0 && waitingOn.every((s) => room.rematchVotes.has(s.id));
        if (!allIn) return this.broadcastGame(room);

        // Deal a fresh game with the same table — new roll-off, same seats.
        clearTimers(room);
        room.rematchVotes.clear();
        room.game = null;
        return this.beginRollOff(room);
      }

      case "to-lobby": {
        if (!isHost || room.phase !== "in-game") return;
        clearTimers(room);
        room.phase = "lobby";
        room.game = null;
        room.rematchVotes.clear();
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
    // The server owns ADVANCE (inter-turn timing) and SKIP (time-outs); a client
    // may throw, bank, or change which dice it is holding.
    if (action.type !== "ROLL" && action.type !== "BANK" && action.type !== "TOGGLE_LOCK") return;
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
    // A team table is re-seated so the sides alternate, so the reveal has to
    // show that order, not the raw ranking. The game itself is still built
    // after the reveal — the room must not be actionable while it plays.
    const teamed = room.teams && teamsBalanced(room);
    const seating = teamed
      ? teamSeatingOrder(
          order,
          room.seats.map((s) => s.team),
        )
      : order;
    const rows = seating.map((pi) => ({
      name: room.seats[pi].name,
      dice: entries[pi].dice,
      sum: entries[pi].sum,
      team: teamed ? room.seats[pi].team : undefined,
    }));
    room.phase = "in-game"; // protect seats from lobby-removal during the roll-off
    const msg: ServerMessage = { type: "roll-off", rows };
    for (const seat of room.seats) if (seat.ws) this.send(seat.ws, msg);
    for (const ws of room.spectators) this.send(ws, msg);

    this.schedule(room, this.cfg.rollOffMs, () => {
      startGame(room, order);
      this.scheduleFollowups(room);
      this.broadcastGame(room);
    });
  }

  // Follow-ups are scheduled BEFORE the broadcast, not after: arming the turn
  // clock is what sets room.turnDeadline, and the broadcast is what carries it
  // to the clients. The other way round, every snapshot would describe the
  // previous turn's clock.
  private applyAndBroadcast(room: Room, action: Parameters<typeof applyAction>[1]): void {
    if (!room.game) return;
    const wasOver = room.game.phase === "game-over";
    room.game = applyAction(room.game, action);
    this.scheduleFollowups(room);
    this.broadcastGame(room);
    // Record the result exactly once, on the transition into game-over.
    if (!wasOver && room.game.phase === "game-over") this.recordResults(room);
  }

  /**
   * File a finished game into each signed-in player's match history.
   *
   * Fire-and-forget: a database that is down or absent must not disturb a
   * finished game, and there is nothing useful to tell the players about it —
   * so failures are swallowed rather than surfaced. Guests are skipped, since
   * a history needs an account to belong to.
   */
  private recordResults(room: Room): void {
    const g = room.game;
    if (!g || !accountsEnabled()) return;
    for (const seat of room.seats) {
      if (!seat.userId) continue;
      const me = g.players.find((p) => p.id === seat.id);
      if (!me) continue;
      void recordMatch({
        userId: seat.userId,
        won: isWinner(g, seat.id),
        score: me.total,
        goal: g.config.goal,
        players: g.players.length,
        team: typeof me.team === "number" ? me.team : null,
        opponents: g.players.filter((p) => p.id !== seat.id).map((p) => p.name),
      }).catch(() => {
        /* history is a nicety; never let it break a finished game */
      });
    }
  }

  private schedule(room: Room, ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      room.timers.delete(t);
      try {
        fn();
      } catch (err) {
        // The room may simply have been torn down under the timer, which is
        // normal. Anything else leaves a table with no pending follow-up — a
        // game that never moves again — so it is logged rather than swallowed:
        // a stalled room is otherwise invisible from the outside.
        if (this.store.get(room.code)) {
          console.error(`[room ${room.code}] scheduled step failed:`, err);
        }
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
      // A dropped human is played by a standard, level-headed bot.
      const personality = seat?.isBot ? seat.personality : "balanced";
      const delay = disconnected ? this.cfg.disconnectAutoplayMs : this.cfg.botThinkMs;
      this.schedule(room, delay, () => {
        if (!room.game) return;
        this.applyAndBroadcast(room, decide(room.game, { personality }));
      });
      return;
    }

    // A connected human. If they haven't STARTED their turn (no roll yet), give
    // them a grace period; a time-out forfeits the turn and counts against them.
    // Unless the host turned the clock off, in which case the table simply
    // waits — the seat is still played for them if they actually drop.
    if (seat && room.turnTimer && g.turn.rollCount === 0) {
      // The only clock the server actually keeps. Recorded on the room so the
      // next broadcast can tell clients how long is left, which is what the
      // countdown ring on the active seat draws.
      room.turnDeadline = Date.now() + this.cfg.turnIdleMs;
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

    this.scheduleFollowups(room);
    this.broadcastGame(room);
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

  /** Forget a notification socket and release its share of the presence count. */
  private dropNotifier(ws: WebSocket): void {
    const me = this.notifiers.get(ws);
    if (!me) return;
    this.notifiers.delete(ws);
    const set = this.byUser.get(me.userId);
    if (set) {
      set.delete(ws);
      if (set.size === 0) this.byUser.delete(me.userId);
    }
    markOffline(me.userId);
  }

  private onClose(ws: WebSocket): void {
    if (this.notifiers.has(ws)) return this.dropNotifier(ws);
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
      // Nobody human left connected. A game in progress is worth holding on to
      // — the player is probably three seconds from being back — but an empty
      // lobby is not, and its seats are gone already.
      if (room.phase === "in-game" && room.game) {
        this.holdRoom(room);
        return;
      }
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
    const { room } = conn;
    this.send(ws, { type: "left" });
    this.onClose(ws);
    // Walking away is not the same as dropping out: nobody is coming back for a
    // table the last player deliberately left, so it isn't held for them.
    if (room.emptyTimer) {
      clearTimeout(room.emptyTimer);
      room.emptyTimer = null;
      for (const w of room.spectators) this.send(w, { type: "left" });
      room.spectators.clear();
      this.store.delete(room);
    }
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
