import { heldHand, type GameState } from "@greed/core";
import { rollCall } from "../game/rollCall.js";
import { BEAT_GAP_MS, INTER_TURN_MS, TURN_ACTION_MS } from "../game/pacing.js";

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
/**
 * The cues that END a turn. Whatever is on screen when one of these arrives
 * belongs to a moment that has just passed, so it gives way — see the player.
 */
export const TURN_ENDING: readonly CelebrationKind[] = ["bank", "bigBank", "bust", "win"];

/**
 * How long a banner stays up, in terms of the beat it has to fit inside.
 *
 * These were fixed numbers, and they were longer than the game they were
 * describing: a bank held the screen for 3.1s and a bust for 3.5s while the
 * next player's turn started after 2.1s, so a result was still up — over the
 * wrong player — while somebody else was rolling. Written against the pacing
 * the controller actually uses, the relationship is stated rather than
 * rediscovered, and `pacing.test.ts` fails if a future change breaks it.
 *
 * Two budgets. A turn-ending banner has until the next player starts. A
 * mid-turn one has until the next roll of the same turn lands — it may be cut
 * short by the turn ending, which is the point: it is that player's moment, and
 * their moment is over.
 *
 * `win` is the exception and takes as long as it likes: nothing follows it.
 */
const ENDS_TURN = INTER_TURN_MS - BEAT_GAP_MS;
const MID_TURN = TURN_ACTION_MS - BEAT_GAP_MS;
export const CELEBRATION_MS: Record<CelebrationKind, number> = {
  // Routine, and the most frequent thing on screen — the shortest of all.
  score: 1100,
  // A bigger haul lingers a little longer than an ordinary one.
  bank: ENDS_TURN - 300,
  bigBank: ENDS_TURN,
  bust: ENDS_TURN,
  hot: MID_TURN,
  triple: MID_TURN,
  straight: MID_TURN,
  // The rarest hand in the game, given the longer of the two budgets. It still
  // cannot outlive the turn: banking or busting replaces it.
  five: ENDS_TURN,
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
