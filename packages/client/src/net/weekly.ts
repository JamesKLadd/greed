/**
 * Weekly challenge API. Scores come back from the server, which derives them by
 * replaying the submitted moves — the client never reports a score, and never
 * sees a seed.
 */

import { cleanBetaIdentity, type BetaIdentity } from "@greed/protocol";
import type { AttemptPeriod, RunMove, RunResult, GameState } from "@greed/core";
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
  /** Equipped Locker portrait, when supplied by the account/server. */
  visualBeta?: BetaIdentity;
  score: number;
  turns: number;
  bestTurn: number;
  busts: number;
  /** Of those busts, the ones thrown on a full cup of five. */
  superBusts: number;
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
  /** Equipped Locker portrait, when supplied by the account/server. */
  visualBeta?: BetaIdentity;
  score: number;
}

export interface WeeklyStatus {
  week: string;
  best: RunResult | null;
  /** Every attempt this player has finished this week, best and beaten alike. */
  attempts: number;
  /** Attempts the ration grants, or null where a week is unlimited. */
  attemptLimit: number | null;
  /** What that limit is counted per. Null exactly when `attemptLimit` is. */
  attemptPeriod: AttemptPeriod | null;
  /**
   * Spent against the ration in force — today's count where it is daily, the
   * week's where it is weekly. The same as `attempts` under a weekly ration and
   * emphatically not under a daily one, which is why it is sent rather than
   * worked out here: only the server knows what day it is in the challenge zone.
   */
  attemptsUsed: number;
  streak: number;
  leaderboard: WeeklyEntry[];
  /** Null/absent on servers predating friends standings. */
  friendsLeaderboard?: WeeklyEntry[] | null;
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
    // The run summary itself now carries a field the old server never sent.
    best: raw.best ? { ...raw.best, superBusts: raw.best.superBusts ?? 0 } : null,
    attempts: raw.attempts ?? 0,
    // A server that has never heard of the cap is a server that is not
    // enforcing one, so the honest reading of a missing limit is "unlimited".
    // Guessing 50 here would have this screen refuse attempts the server
    // would have dealt, for the few minutes a release takes to land.
    attemptLimit: raw.attemptLimit ?? null,
    // A server sending a limit but no period is one from before the ration
    // became daily, and such a server is enforcing it by the week — so that is
    // not a guess, it is what the missing field means.
    attemptPeriod: raw.attemptPeriod ?? (raw.attemptLimit == null ? null : "week"),
    // And under a weekly ration the week's total IS the figure the cap counts,
    // so the same reasoning gives the right fallback here.
    attemptsUsed: raw.attemptsUsed ?? raw.attempts ?? 0,
    streak: raw.streak ?? 0,
    wins: raw.wins ?? 0,
    friendsLeaderboard:
      raw.friendsLeaderboard?.map((e) => ({
        ...e,
        avatar: e.avatar ?? "",
        visualBeta: cleanBetaIdentity(e.visualBeta),
        superBusts: e.superBusts ?? 0,
        hotDice: e.hotDice ?? 0,
        wins: e.wins ?? 0,
        attempts: e.attempts ?? 0,
      })) ?? null,
    players: raw.players ?? 0,
    champion: raw.champion
      ? { ...raw.champion, visualBeta: cleanBetaIdentity(raw.champion.visualBeta) }
      : null,
    champions: (raw.champions ?? []).map((c) => ({
      ...c,
      visualBeta: cleanBetaIdentity(c.visualBeta),
    })),
    leaderboard: (raw.leaderboard ?? []).map((e) => ({
      ...e,
      avatar: e.avatar ?? "",
      visualBeta: cleanBetaIdentity(e.visualBeta),
      superBusts: e.superBusts ?? 0,
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
export function playWeeklyMove(move: RunMove): Promise<WeeklyRunView> {
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
