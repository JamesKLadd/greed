/**
 * In-memory room + seat model for the online server. A room lives in the lobby
 * phase (players gather, add bots, ready up) and then in-game (an authoritative
 * @greed/core GameState the server owns). Seats persist through disconnects so a
 * player can reconnect with their token.
 */

import { createGame, makeSeed, GOAL_DEFAULT } from "@greed/core";
import type { BotDifficulty, BotPersonality, GameState, PlayerConfig } from "@greed/core";
import type { LobbySeat, LobbyView } from "@greed/protocol";
import { randomBytes, randomUUID } from "node:crypto";
import type { WebSocket } from "ws";

export interface Seat {
  id: string;
  name: string;
  isBot: boolean;
  difficulty?: BotDifficulty;
  personality?: BotPersonality;
  ready: boolean;
  isHost: boolean;
  /** Reconnection token (humans only). */
  token: string;
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
    };
    this.rooms.set(room.code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  delete(room: Room): void {
    clearTimers(room);
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
}

export function makeHumanSeat(name: string, isHost: boolean): Seat {
  return {
    id: `p_${randomUUID().slice(0, 8)}`,
    name: name.trim() || "Player",
    isBot: false,
    ready: isHost, // host starts ready
    isHost,
    token: randomBytes(16).toString("hex"),
    ws: null,
  };
}

export function makeBotSeat(
  difficulty: BotDifficulty,
  index: number,
  personality: BotPersonality = "balanced",
): Seat {
  return {
    id: `bot_${randomUUID().slice(0, 8)}`,
    name: `Bot ${index}`,
    isBot: true,
    difficulty,
    personality,
    ready: true,
    isHost: false,
    token: "",
    ws: null,
  };
}

export function canStart(room: Room): boolean {
  if (room.seats.length < 2 || room.seats.length > MAX_SEATS) return false;
  return room.seats.every((s) => s.isBot || s.ready);
}

export function lobbyView(room: Room): LobbyView {
  const seats: LobbySeat[] = room.seats.map((s) => ({
    id: s.id,
    name: s.name,
    isBot: s.isBot,
    difficulty: s.difficulty,
    personality: s.personality,
    ready: s.ready,
    connected: s.isBot || s.ws !== null,
    isHost: s.isHost,
  }));
  return {
    code: room.code,
    isPublic: room.isPublic,
    goal: room.goal,
    seats,
    hostId: room.seats.find((s) => s.isHost)?.id ?? "",
    canStart: canStart(room),
  };
}

export function startGame(room: Room, order?: number[]): GameState {
  const configs: PlayerConfig[] = room.seats.map((s) => ({
    id: s.id,
    name: s.name,
    isBot: s.isBot,
    botDifficulty: s.isBot ? s.difficulty : undefined,
    botPersonality: s.isBot ? s.personality : undefined,
  }));
  const seed = makeSeed(Date.now() ^ Math.floor(Math.random() * 2 ** 31));
  room.game = createGame(configs, { goal: room.goal, seed, order });
  room.phase = "in-game";
  return room.game;
}

export { MAX_SEATS };
