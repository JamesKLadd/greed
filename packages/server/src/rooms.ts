/**
 * In-memory room + seat model for the online server. A room lives in the lobby
 * phase (players gather, add bots, ready up) and then in-game (an authoritative
 * @greed/core GameState the server owns). Seats persist through disconnects so a
 * player can reconnect with their token.
 */

import { createGame, makeSeed, cleanPlayerName, GOAL_DEFAULT, TEAM_TABLE_SIZES } from "@greed/core";
import type { BotPersonality, GameState, PlayerConfig } from "@greed/core";
import type { LobbySeat, LobbyView } from "@greed/protocol";
import { randomBytes, randomUUID } from "node:crypto";
import type { WebSocket } from "ws";

export interface Seat {
  id: string;
  name: string;
  isBot: boolean;
  /** Bots all play at one standard level; the personality is what differs. */
  personality?: BotPersonality;
  ready: boolean;
  isHost: boolean;
  /** Account id when this player is signed in, else undefined (guest). */
  userId?: string;
  /** Equipped dice-skin id (cosmetic), broadcast so all clients render it. */
  dice: string;
  /** Equipped avatar id, or "" to let clients derive one from the name. */
  avatar: string;
  /** Turns this player let time out this game (kicked once it hits the cap). */
  missedTurns: number;
  /** When this seat last sent an emote, for the anti-spam cooldown. */
  lastEmoteAt?: number;
  /** Reconnection token (humans only). */
  token: string;
  /** Side (0 or 1). Always set so toggling team mode off and on keeps pairings. */
  team: number;
  /** Live socket, or null when a bot or a disconnected human. */
  ws: WebSocket | null;
}

export interface Room {
  code: string;
  isPublic: boolean;
  goal: number;
  seats: Seat[];
  phase: "lobby" | "in-game";
  game: GameState | null;
  /** Pending scheduled follow-ups (bot moves / inter-turn advances). */
  timers: Set<NodeJS.Timeout>;
  /**
   * Set while a game in progress is being held open for a player who dropped —
   * see the grace period in server.ts. Null whenever anyone is connected.
   */
  emptyTimer: NodeJS.Timeout | null;
  /**
   * When the current seat's grace period to START their turn runs out, or null
   * when no clock is running. Only ever set for a connected human who hasn't
   * rolled yet — that is the only thing the server actually puts a limit on.
   */
  turnDeadline: number | null;
  /** Read-only watchers: sockets that receive broadcasts but hold no seat. */
  spectators: Set<WebSocket>;
  /** Two sides sharing a score (only legal at 4 or 6 seats). */
  teams: boolean;
  /**
   * Whether seats are put on the clock to start their turn.
   *
   * On by default, because a table of strangers cannot afford one person
   * wandering off. A host who knows everyone can turn it off — see
   * `scheduleFollowups`, which simply doesn't arm the clock then. It has never
   * governed anything but the FIRST roll; once a player is rolling, the
   * roll-or-bank decision is untimed either way.
   */
  turnTimer: boolean;
  /** Seat ids that have voted to run the last game back, in place. */
  rematchVotes: Set<string>;
}

const MAX_SEATS = 8;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusable chars

export class RoomStore {
  private rooms = new Map<string, Room>();

  private newCode(): string {
    let code = "";
    do {
      code = Array.from(
        { length: 4 },
        () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
      ).join("");
    } while (this.rooms.has(code));
    return code;
  }

  create(isPublic: boolean, goal: number): Room {
    const room: Room = {
      code: this.newCode(),
      isPublic,
      goal: goal || GOAL_DEFAULT,
      seats: [],
      phase: "lobby",
      game: null,
      timers: new Set(),
      emptyTimer: null,
      turnDeadline: null,
      spectators: new Set(),
      teams: false,
      turnTimer: true,
      rematchVotes: new Set(),
    };
    this.rooms.set(room.code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  delete(room: Room): void {
    clearTimers(room);
    if (room.emptyTimer) clearTimeout(room.emptyTimer);
    room.emptyTimer = null;
    this.rooms.delete(room.code);
  }

  /** A public room still in the lobby with a free seat, for quick match. */
  findOpenPublic(): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.isPublic && room.phase === "lobby" && room.seats.length < MAX_SEATS) {
        return room;
      }
    }
    return undefined;
  }

  /** Locate a seat (and its room) by reconnection token. */
  findByToken(token: string): { room: Room; seat: Seat } | undefined {
    for (const room of this.rooms.values()) {
      const seat = room.seats.find((s) => s.token === token);
      if (seat) return { room, seat };
    }
    return undefined;
  }

  all(): Room[] {
    return [...this.rooms.values()];
  }
}

export function clearTimers(room: Room): void {
  for (const t of room.timers) clearTimeout(t);
  room.timers.clear();
  // The turn clock is one of those timers, so it stops with them. Whoever
  // re-arms it sets this again.
  room.turnDeadline = null;
}

export function makeHumanSeat(
  name: string,
  isHost: boolean,
  dice = "ivory",
  userId?: string,
  avatar = "",
  team = 0,
): Seat {
  return {
    id: `p_${randomUUID().slice(0, 8)}`,
    name: cleanPlayerName(name),
    isBot: false,
    ready: isHost, // host starts ready
    isHost,
    userId,
    dice: dice || "ivory",
    avatar,
    missedTurns: 0,
    token: randomBytes(16).toString("hex"),
    team,
    ws: null,
  };
}

export function makeBotSeat(
  index: number,
  personality: BotPersonality = "balanced",
  team = 0,
): Seat {
  return {
    id: `bot_${randomUUID().slice(0, 8)}`,
    name: `Bot ${index}`,
    isBot: true,
    personality,
    ready: true,
    isHost: false,
    dice: "ivory",
    // Bots never pick: every client derives a machine face from the bot's name.
    avatar: "",
    missedTurns: 0,
    token: "",
    team,
    ws: null,
  };
}

/** Can this table be split into two equal sides at all? */
export function teamsAvailable(room: Room): boolean {
  return (TEAM_TABLE_SIZES as readonly number[]).includes(room.seats.length);
}

/** Are the two sides currently the same size? */
export function teamsBalanced(room: Room): boolean {
  if (!teamsAvailable(room)) return false;
  const a = room.seats.filter((s) => s.team === 0).length;
  return a === room.seats.length - a;
}

/** Alternate the sides down the seat list — the fastest way back to legal. */
export function rebalanceTeams(room: Room): void {
  room.seats.forEach((s, i) => {
    s.team = i % 2;
  });
}

export function canStart(room: Room): boolean {
  if (room.seats.length < 2 || room.seats.length > MAX_SEATS) return false;
  // A team room can't start lopsided — the engine would reject the game anyway,
  // and finding that out at start time would strand everyone in the lobby.
  if (room.teams && !teamsBalanced(room)) return false;
  return room.seats.every((s) => s.isBot || s.ready);
}

export function lobbyView(room: Room): LobbyView {
  const teamed = room.teams && teamsAvailable(room);
  const seats: LobbySeat[] = room.seats.map((s) => ({
    id: s.id,
    name: s.name,
    isBot: s.isBot,
    personality: s.personality,
    ready: s.ready,
    connected: s.isBot || s.ws !== null,
    isHost: s.isHost,
    team: teamed ? s.team : undefined,
  }));
  return {
    code: room.code,
    isPublic: room.isPublic,
    goal: room.goal,
    seats,
    hostId: room.seats.find((s) => s.isHost)?.id ?? "",
    canStart: canStart(room),
    teams: teamed,
    teamsAvailable: teamsAvailable(room),
    turnTimer: room.turnTimer,
  };
}

export function startGame(room: Room, order?: number[]): GameState {
  // Guard the same way the lobby does: a room left in team mode after seats
  // changed must not hand the engine an illegal table.
  const teamed = room.teams && teamsBalanced(room);
  const configs: PlayerConfig[] = room.seats.map((s) => ({
    id: s.id,
    name: s.name,
    isBot: s.isBot,
    botPersonality: s.isBot ? s.personality : undefined,
    team: teamed ? s.team : undefined,
  }));
  const seed = makeSeed(Date.now() ^ Math.floor(Math.random() * 2 ** 31));
  for (const s of room.seats) s.missedTurns = 0; // fresh turn-timeout count per game
  room.rematchVotes.clear();
  room.game = createGame(configs, { goal: room.goal, seed, order });
  room.phase = "in-game";
  return room.game;
}

export { MAX_SEATS };
