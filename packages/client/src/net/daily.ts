/** Daily challenge API. Scores come back from the server, which derives them by
 *  replaying the submitted moves — the client never reports a score. */

import type { DailyMove, DailyResult, GameState } from "@greed/core";
import { api } from "./auth.js";

/**
 * A daily run as the server hands it over. The seed never crosses this line:
 * the client is given the position it has reached, not the means to compute
 * the next one, which is what stops a run being replayed against dice the
 * player has already seen.
 */
export interface DailyRunView {
  state: GameState;
  turns: number;
  totalTurns: number;
  complete: boolean;
}

export interface DailyEntry {
  username: string;
  /** Their equipped avatar id ("" to derive one from the name). */
  avatar: string;
  score: number;
  turns: number;
  bestTurn: number;
  busts: number;
  hotDice: number;
  /** Daily challenges this player has won outright. */
  wins: number;
  rank: number;
  you?: boolean;
  /** The reigning champion — whoever took the last day that finished. */
  crown?: true;
}

/** Who took a day, once that day was over. */
export interface DailyChampion {
  /** YYYY-MM-DD. A date, not an instant: an ISO timestamp would land on the
   *  wrong day west of UTC. */
  day: string;
  username: string;
  avatar: string;
  score: number;
}

export interface DailyStatus {
  day: string;
  run: DailyResult | null;
  streak: number;
  leaderboard: DailyEntry[];
  yourRank: number | null;
  players: number;
  /**
   * True once a top-ten finish on a CLOSED day is on the record. The server
   * decides this: where you stand on today's board is not the same claim.
   */
  eliteEarned: boolean;
  /** Daily challenges the viewer has won outright. */
  wins: number;
  /** Whoever took the most recent day that has finished. Closed days only, so
   *  this arrives before the viewer's own run as well as after. */
  champion: DailyChampion | null;
  champions: DailyChampion[];
}

/**
 * Fill in anything an OLDER SERVER doesn't send.
 *
 * Both halves auto-deploy on a push, but they do not land together: Vercel is
 * quick and the server's free-tier build plus boot is not, so for a few minutes
 * after every push a new screen is talking to the old API. Without this, `status.champions.length` on a
 * response that predates champions is a TypeError, and the daily screen is a
 * blank page rather than a screen missing one panel. The types say these fields
 * are always there because from here on they will be; this is what makes that
 * true on the way in.
 */
function fill(raw: DailyStatus): DailyStatus {
  return {
    ...raw,
    wins: raw.wins ?? 0,
    champion: raw.champion ?? null,
    champions: raw.champions ?? [],
    leaderboard: (raw.leaderboard ?? []).map((e) => ({
      ...e,
      avatar: e.avatar ?? "",
      hotDice: e.hotDice ?? 0,
      wins: e.wins ?? 0,
    })),
  };
}

export async function fetchDaily(): Promise<DailyStatus> {
  return fill(await api<DailyStatus>("/api/daily", { auth: true }));
}

/** Claim today's run and get the opening position. Idempotent: starting twice
 *  returns the run already in progress. */
export function startDaily(): Promise<DailyRunView> {
  return api<DailyRunView>("/api/daily/start", { method: "POST", body: {}, auth: true });
}

/**
 * Play one move. The server appends it, replays, and returns the new position —
 * the position alone, even for the move that ends the run.
 *
 * It used to answer a finished run with the refreshed board attached, and this
 * screen dropped it and re-read the board anyway (`onFinished`). What that
 * bundle really did was make the last reply of a run the slow one, which on the
 * final turn told the player they had busted before the dice had finished
 * moving.
 */
export function playDailyMove(move: DailyMove): Promise<DailyRunView> {
  return api("/api/daily/move", { method: "POST", body: { move }, auth: true });
}

/** The run left in progress, if any — for picking up where you left off. */
export function resumeDaily(): Promise<{ run: DailyRunView | null }> {
  return api("/api/daily/resume", { auth: true });
}
