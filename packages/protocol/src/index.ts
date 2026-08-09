/**
 * Wire protocol shared by the online client and server.
 *
 * Greed has no hidden information (all scores and dice are public), so the server
 * simply broadcasts the whole authoritative GameState to every client. A client
 * knows which seat it controls via `youId` and compares it to the current
 * player's id to decide whether it may act.
 */

import type { BotDifficulty, BotPersonality, GameAction, GameState } from "@greed/core";

export const DEFAULT_SERVER_PORT = 8787;

/**
 * Reactions players can send during an online game.
 *
 * A FIXED set rather than free text, on purpose: it keeps the table sociable
 * without opening a channel that would need moderation — which matters for a
 * game meant to be played with family, including children.
 */
export const EMOTES = ["clap", "wow", "laugh", "think", "unlucky", "nice"] as const;
export type EmoteId = (typeof EMOTES)[number];

export function isEmoteId(value: unknown): value is EmoteId {
  return typeof value === "string" && (EMOTES as readonly string[]).includes(value);
}

/** A seat in the pre-game lobby. */
export interface LobbySeat {
  id: string;
  name: string;
  isBot: boolean;
  difficulty?: BotDifficulty;
  personality?: BotPersonality;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
}

export interface LobbyView {
  code: string;
  isPublic: boolean;
  goal: number;
  seats: LobbySeat[];
  hostId: string;
  /** True when the host is allowed to start (>=2 seats, all humans ready). */
  canStart: boolean;
}

// ---------------------------------------------------------------------------
// Client -> Server
// ---------------------------------------------------------------------------

export type ClientMessage =
  // `auth` is an optional account session JWT. When present and valid, the server
  // uses the account's username (ignoring `name`) and binds the seat to the user.
  | {
      type: "create-room";
      name: string;
      isPublic?: boolean;
      goal?: number;
      dice?: string;
      auth?: string;
    }
  | { type: "join-room"; code: string; name: string; dice?: string; auth?: string }
  | { type: "quick-match"; name: string; dice?: string; auth?: string }
  | { type: "spectate"; code: string }
  | { type: "reconnect"; token: string }
  | { type: "set-ready"; ready: boolean }
  | { type: "set-goal"; goal: number }
  | { type: "add-bot"; difficulty: BotDifficulty; personality?: BotPersonality }
  | { type: "remove-seat"; seatId: string }
  | { type: "start-game" }
  | { type: "game-action"; action: GameAction }
  | { type: "emote"; emote: EmoteId }
  | { type: "rematch" }
  | { type: "leave" }
  | { type: "ping" };

// ---------------------------------------------------------------------------
// Server -> Client
// ---------------------------------------------------------------------------

/** One row of the opening roll-off, already in the resulting turn order. */
export interface RollOffRow {
  name: string;
  dice: number[];
  sum: number;
}

/** Live connection status of a player during a game (bots are always connected). */
export interface PlayerPresence {
  id: string;
  connected: boolean;
}

/** A player's equipped dice-skin id, so every client can render their dice. */
export interface PlayerSkin {
  id: string;
  dice: string;
}

export type ServerMessage =
  | { type: "welcome"; youId: string; token: string; code: string }
  | { type: "spectating"; code: string }
  | { type: "lobby"; lobby: LobbyView }
  | { type: "roll-off"; rows: RollOffRow[] }
  | {
      type: "game";
      code: string;
      state: GameState;
      presence: PlayerPresence[];
      skins: PlayerSkin[];
    }
  | { type: "emote"; playerId: string; emote: EmoteId }
  | { type: "error"; message: string }
  | { type: "left" }
  | { type: "pong" };

export function encode(msg: ClientMessage | ServerMessage): string {
  return JSON.stringify(msg);
}

export function decode<T = ClientMessage | ServerMessage>(raw: string): T {
  return JSON.parse(raw) as T;
}
