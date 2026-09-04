/**
 * Weekly challenge API. Scores come back from the server, which derives them by
 * replaying the submitted moves — the client never reports a score, and never
 * sees a seed.
 */

import type { RunMove, RunResult, GameState } from "@greed/core";
import { api, ApiError } from "./auth.js";

/**
 * An attempt as the server hands it over. The seed never crosses this line: the
 * client is given the position it has reached, not the means to compute the
 * next one.
 */
export interface WeeklyRunView {
  state: GameState;
  turns: number;
  totalTurns: number;
  complete: boolean;
}

export interface WeeklyEntry {
  username: string;
  /** Their equipped avatar id ("" to derive one from the name). */
  avatar: string;
  score: number;
  turns: number;
  bestTurn: number;
  busts: number;
  hotDice: number;
  /** Attempts this player finished this week — what the score cost them. */
  attempts: number;
  /** Weekly challenges this player has won outright. */
  wins: number;
  rank: number;
  you?: boolean;
  /** The reigning champion — whoever took the last week that finished. */
  crown?: true;
}

/** Who took a week, once that week was over. */
export interface WeeklyChampion {
  /** The week's Monday, as YYYY-MM-DD. A date, not an instant: an ISO timestamp
   *  would land on the wrong day west of UTC. */
  week: string;
  username: string;
  avatar: string;
  score: number;
}

export interface WeeklyStatus {
  week: string;
  best: RunResult | null;
  attempts: number;
  streak: number;
  leaderboard: WeeklyEntry[];
  yourRank: number | null;
  players: number;
  eliteEarned: boolean;
  wins: number;
  champion: WeeklyChampion | null;
  champions: WeeklyChampion[];
}

/**
 * Fill in anything an OLDER SERVER doesn't send.
 *
 * Both halves auto-deploy on a push, but they do not land together: Vercel is
 * quick and the server's free-tier build plus boot is not, so for a few minutes
 * after every push a new screen is talking to the old API. The types say these fields are always there
 * because from here on they will be; this is what makes that true on the way in.
 *
 * The weekly's own first release is the extreme case of this: the deployed
 * server has none of these endpoints at all, which is what `WeeklyUnavailable`
 * below is for.
 */
function fill(raw: WeeklyStatus): WeeklyStatus {
  return {
    ...raw,
    attempts: raw.attempts ?? 0,
    streak: raw.streak ?? 0,
    wins: raw.wins ?? 0,
    players: raw.players ?? 0,
    champion: raw.champion ?? null,
    champions: raw.champions ?? [],
    leaderboard: (raw.leaderboard ?? []).map((e) => ({
      ...e,
      avatar: e.avatar ?? "",
      hotDice: e.hotDice ?? 0,
      attempts: e.attempts ?? 0,
      wins: e.wins ?? 0,
    })),
  };
}

/**
 * The server this client is talking to has no weekly challenge.
 *
 * Distinguished from any other failure because it is not one: the client ships
 * ahead of the server every release, so between the two deploys every player
 * will hit this. A screen that says "check back shortly" is the correct answer
 * then; "something went wrong" is not.
 */
export class WeeklyUnavailable extends Error {
  constructor() {
    super("The weekly challenge is not available on this server yet.");
    this.name = "WeeklyUnavailable";
  }
}

/** Recognise the shapes an API that doesn't know this route can come back as. */
function rethrow(err: unknown): never {
  if (err instanceof ApiError && (err.status === 404 || err.status === 503)) {
    throw new WeeklyUnavailable();
  }
  throw err;
}

export async function fetchWeekly(): Promise<WeeklyStatus> {
  try {
    return fill(await api<WeeklyStatus>("/api/weekly", { auth: true }));
  } catch (err) {
    rethrow(err);
  }
}

/** Open an attempt and get its first position. Idempotent: with one already
 *  open it returns that one, which is what makes you finish it first. */
export async function startWeekly(): Promise<WeeklyRunView> {
  try {
    return await api<WeeklyRunView>("/api/weekly/start", {
      method: "POST",
      body: {},
      auth: true,
    });
  } catch (err) {
    rethrow(err);
  }
}

/** Play one move. The server appends it, replays, and returns the new position. */
export function playWeeklyMove(move: RunMove): Promise<WeeklyRunView & { status?: WeeklyStatus }> {
  return api("/api/weekly/move", { method: "POST", body: { move }, auth: true });
}

/** The attempt left in progress, if any — for picking up where you left off. */
export async function resumeWeekly(): Promise<{ run: WeeklyRunView | null }> {
  try {
    return await api("/api/weekly/resume", { auth: true });
  } catch (err) {
    rethrow(err);
  }
}
