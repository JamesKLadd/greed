import { heldHand, type GameState } from "@greed/core";
import { rollCall } from "../game/rollCall.js";

export type CelebrationKind =
  "score" | "bank" | "bigBank" | "hot" | "triple" | "straight" | "five" | "bust" | "win";
export interface Celebration {
  kind: CelebrationKind;
  points?: number;
  player?: string;
}
export interface CelebrationCursor {
  length: number;
  tail: string;
  fiveRoll: number;
  game: string;
}
export const CELEBRATION_MS: Record<CelebrationKind, number> = {
  score: 1500,
  bank: 3100,
  bigBank: 3500,
  hot: 3500,
  triple: 3500,
  straight: 3500,
  five: 3900,
  bust: 3500,
  win: 4300,
};

/** Snapshot-only arrivals (mount, reset, reconnect bursts) must not replay applause. */
export function readCelebration(
  state: GameState,
  previous?: CelebrationCursor,
): { cursor: CelebrationCursor; cue: Celebration | null } {
  const log = state.log;
  const tail = JSON.stringify(log.at(-1));
  let lastRoll = -1;
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i].type === "roll") {
      lastRoll = i;
      break;
    }
  }
  // Five of a kind specifically: heldHand also answers for a straight, which
  // has its own cue by way of rollCall below.
  const five = heldHand(state.turn)?.kind === "five-of-a-kind" && state.turn.lastRoll !== null;
  const game = JSON.stringify([state.config.seed, state.players.map((p) => p.id), state.order]);
  const contiguous =
    previous &&
    previous.game === game &&
    log.length >= previous.length &&
    JSON.stringify(log[previous.length - 1]) === previous.tail &&
    log.length - previous.length <= 4;
  const cursor = {
    game,
    length: log.length,
    tail,
    fiveRoll: contiguous ? previous.fiveRoll : five ? lastRoll : -1,
  };
  if (!contiguous) return { cursor, cue: null };
  const events = log.slice(previous.length);
  const playerName = (id: string) => state.players.find((p) => p.id === id)?.name;
  let cue: Celebration | null = null;
  for (const e of events) {
    if (e.type === "roll" && e.result.points > 0)
      cue = { kind: "score", points: e.result.points, player: playerName(e.playerId) };
    if (e.type === "hot-dice") cue = { kind: "hot", player: playerName(e.playerId) };
    if (e.type === "bank")
      cue = {
        kind: e.gained >= 1000 ? "bigBank" : "bank",
        points: e.gained,
        player: playerName(e.playerId),
      };
    if (e.type === "bust")
      cue = { kind: "bust", points: e.lostPoints, player: playerName(e.playerId) };
    if (e.type === "game-over" || e.type === "auto-win")
      cue = { kind: "win", player: playerName(e.type === "game-over" ? e.winnerId : e.playerId) };
  }
  // A call describes this throw only. Held dice from an earlier throw must not
  // manufacture another triple; the shared rollCall understands that distinction.
  const rolled = events.some((e) => e.type === "roll");
  const pattern = rolled ? rollCall(state.turn) : null;
  if (state.turn.outcome === null && (cue?.kind === "score" || cue?.kind === "hot")) {
    if (pattern === "straight" || (pattern === "triple" && cue.kind !== "hot"))
      cue = { ...cue, kind: pattern };
  }
  // The core understands a hand built across throws. Lock toggles may revisit
  // that same hand; celebrate at most once per completed roll, never per render.
  if (
    rolled &&
    five &&
    cursor.fiveRoll !== lastRoll &&
    state.turn.outcome === null &&
    cue?.kind !== "win"
  ) {
    cursor.fiveRoll = lastRoll;
    cue = { kind: "five", player: state.players[state.turn.playerIndex]?.name };
  }
  return { cursor, cue };
}
