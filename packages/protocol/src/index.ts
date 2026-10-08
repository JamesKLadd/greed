/**
 * Wire protocol shared by the online client and server.
 *
 * All current scores and dice are public. The server broadcasts the position
 * with inert PRNG state and an opaque game identity in place of its seed. A client
 * knows which seat it controls via `youId` and compares it to the current
 * player's id to decide whether it may act.
 */

import type { BotPersonality, GameAction, GameState } from "@greed/core";
import type { BetaLook } from "./visual.js";
export * from "./visual.js";
export * from "./growth.js";

export const DEFAULT_SERVER_PORT = 8787;

/**
 * Reactions players can send during an online game.
 *
 * A FIXED set rather than free text, on purpose: it keeps the table sociable
 * without opening a channel that would need moderation — which matters for a
 * game meant to be played with family, including children.
 */
export const EMOTES = ["clap", "wow", "laugh", "think", "unlucky", "nice", "aww"] as const;
export type EmoteId = (typeof EMOTES)[number];

export function isEmoteId(value: unknown): value is EmoteId {
  return typeof value === "string" && (EMOTES as readonly string[]).includes(value);
}

/** A seat in the pre-game lobby. */
export interface LobbySeat {
  id: string;
  name: string;
  isBot: boolean;
  /** Bots have one standard skill level; the personality is what varies. */
  personality?: BotPersonality;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
  /** Side (0 or 1) this seat plays for when the room is in team mode. */
  team?: number;
}

export interface LobbyView {
  code: string;
  isPublic: boolean;
  goal: number;
  seats: LobbySeat[];
  hostId: string;
  /** True when the host is allowed to start (>=2 seats, all humans ready). */
  canStart: boolean;
  /** Two sides sharing a score. Only legal at a table of 4 or 6. */
  teams: boolean;
  /** Whether this table size can be split into two equal sides at all. */
  teamsAvailable: boolean;
  /**
   * Whether a seat is put on the clock to START its turn. Off means the table
   * waits indefinitely for the first roll — which is what a family playing in
   * one room usually wants, and a stranger lobby usually does not.
   */
  turnTimer: boolean;
}

/** Where a rematch vote has got to, shown on the game-over screen. */
export interface RematchState {
  /** Seat ids that have voted to run it back. */
  votes: string[];
  /** How many votes are needed — every connected human at the table. */
  needed: number;
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
      avatar?: string;
      beta?: BetaLook;
      auth?: string;
    }
  | {
      type: "join-room";
      code: string;
      name: string;
      dice?: string;
      avatar?: string;
      beta?: BetaLook;
      auth?: string;
    }
  | {
      type: "quick-match";
      name: string;
      dice?: string;
      avatar?: string;
      beta?: BetaLook;
      auth?: string;
    }
  | { type: "spectate"; code: string }
  | { type: "reconnect"; token: string }
  // A notification-only connection: no seat, no room. It exists so a signed-in
  // player shows as online to their friends and can be reached by a challenge
  // wherever they are in the app.
  | { type: "hello"; auth: string }
  /** Invite a friend (by username) to a private room. */
  | { type: "challenge"; username: string }
  | { type: "challenge-decline"; id: string }
  | { type: "set-ready"; ready: boolean }
  | { type: "set-goal"; goal: number }
  | { type: "add-bot"; personality?: BotPersonality }
  | { type: "remove-seat"; seatId: string }
  /** Host: switch the room between free-for-all and two sides. */
  | { type: "set-teams"; teams: boolean }
  /** Host: move one seat to a side. */
  | { type: "set-seat-team"; seatId: string; team: number }
  /** Host: put seats on the clock to start their turn, or don't. */
  | { type: "set-turn-timer"; enabled: boolean }
  | { type: "start-game" }
  | { type: "game-action"; action: GameAction }
  | { type: "emote"; emote: EmoteId }
  /**
   * Toggle your vote to run it back with the same table. Once every connected
   * human has voted the server deals a new game in place — no trip through the
   * lobby, which is what made a rematch feel like starting over.
   */
  | { type: "rematch" }
  /** Host: take the table back to the lobby to change the goal, seats or sides. */
  | { type: "to-lobby" }
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
  /** Side, in a team game — the play order alternates sides, so it shows here. */
  team?: number;
}

/** Live connection status of a player during a game (bots are always connected). */
export interface PlayerPresence {
  id: string;
  connected: boolean;
}

/** A player's equipped cosmetics, so every client renders them the same way. */
export interface PlayerSkin {
  beta?: BetaLook;
  id: string;
  dice: string;
  /** Equipped avatar id, or "" — an empty pick means "derive one from the name",
   *  which every client does identically. Optional on the wire so a client can
   *  talk to a server that predates avatars without crashing. */
  avatar?: string;
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
      /**
       * Milliseconds left for the current seat to START their turn, or absent
       * when no clock is running (a bot's turn, or the seat has already rolled
       * — the server only ever limits starting, never the roll-or-bank
       * decision).
       *
       * Deliberately a REMAINING DURATION rather than an absolute deadline: an
       * epoch timestamp would need the client's wall clock to agree with the
       * server's, and a phone with a wrong clock would show a countdown that is
       * permanently full or permanently expired.
       */
      turnTimerMs?: number;
      /** Rematch tally, sent once the game is over. Absent while playing. */
      rematch?: RematchState;
    }
  | { type: "emote"; playerId: string; emote: EmoteId }
  /** The notification connection is up; `username` is who the server thinks you are. */
  | { type: "hello-ok"; username: string }
  /** A friend wants to play: join `code` to accept. */
  | { type: "challenge-invite"; id: string; from: string; code: string }
  /** Your challenge was delivered; the room is waiting for you at `code`. */
  | { type: "challenge-sent"; id: string; to: string; code: string }
  | { type: "challenge-declined"; id: string; from: string }
  | { type: "error"; message: string }
  | { type: "left" }
  | { type: "pong" };

export function encode(msg: ClientMessage | ServerMessage): string {
  return JSON.stringify(msg);
}

export function decode<T = ClientMessage | ServerMessage>(raw: string): T {
  return JSON.parse(raw) as T;
}
