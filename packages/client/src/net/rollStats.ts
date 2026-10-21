/**
 * Roll statistics API: summaries of a player's own throws (or, for the game's
 * owner, everyone's), CSV exports of them, and the upload a finished solo game
 * makes.
 */

import {
  STATS_MODES,
  emptyTally,
  type RollGame,
  type RollTally,
  type StatsMode,
  type TallyKey,
} from "@greed/bots";
import { API_BASE, ApiError, api, getToken } from "./auth.js";

/** Which games a view covers: one mode, or local and online together. */
export type StatsView = "games" | "local" | "online" | "daily" | "weekly";
/** "user" is one named account, for the game owner (see fetchRollSummary's `account`). */
export type StatsScope = "me" | "all" | "user";
export type ExportKind = "games" | "throws" | "decisions";

/** The windows a summary can cover, in days back from now. */
export const STATS_WINDOWS = [7, 30, 100] as const;
export type StatsWindow = (typeof STATS_WINDOWS)[number];

export interface SeriesPoint {
  at: string;
  /** Final score; null for a game left unfinished, which has none. */
  score: number | null;
  /** Points the throws scored over their average worth; null from an older server. */
  luck: number | null;
  games: number;
}

export interface RollSummary {
  view: StatsView;
  /** The account's name as stored, for a "user" summary. */
  username?: string;
  days: number;
  tally: RollTally;
  playerCount: number;
  series: SeriesPoint[];
  /** Everyone's tally for the same view and window (a player's own view). */
  everyone?: RollTally;
  /** Share of other players whose dice were less kind (a player's own view). */
  luckRank?: { below: number; others: number };
  /** Every die thrown at every table, bots' included (the all-players view). */
  audit?: { counts: number[]; chi2: number; p: number };
}

export interface RollActivity {
  days: number;
  daily: {
    day: string;
    players: number;
    games: number;
    byMode: Partial<Record<StatsMode, { players: number; games: number }>>;
  }[];
  weekly: { week: string; players: number; returning: number }[];
}

/**
 * The running server has never heard of these endpoints — the few minutes after
 * a release when the new client is up and the server is still building. Said
 * plainly, rather than as an error.
 */
export class StatsUnavailable extends Error {
  constructor() {
    super("Statistics are not available on this server yet.");
    this.name = "StatsUnavailable";
  }
}

function unavailable(err: unknown): never {
  // "No account by that name" is a real answer, not a missing endpoint.
  if (err instanceof ApiError && err.code === "stats.noUser") throw err;
  if (err instanceof ApiError && (err.status === 404 || err.status === 503)) {
    throw new StatsUnavailable();
  }
  throw err;
}

function fillTally(raw: unknown): RollTally {
  const tally = emptyTally();
  const src = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<TallyKey, unknown>>;
  for (const k of Object.keys(tally) as TallyKey[]) tally[k] = Number(src[k]) || 0;
  // A server from before unfinished games were kept counted only finished ones.
  if (!("finished" in src)) tally.finished = tally.games;
  return tally;
}

const num = (v: unknown): number | null =>
  v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v);

/** Normalise once, here, so the screen can trust every field it reads. */
function fill(raw: Partial<RollSummary> | null, view: StatsView): RollSummary {
  const summary: RollSummary = {
    view,
    days: Number(raw?.days) || 100,
    tally: fillTally(raw?.tally),
    playerCount: Number(raw?.playerCount) || 0,
    series: Array.isArray(raw?.series)
      ? raw.series
          .filter((p) => p && typeof p.at === "string")
          .map((p) => ({
            at: p.at,
            score: num(p.score),
            luck: num(p.luck),
            games: Number(p.games) || 1,
          }))
      : [],
  };
  if (raw?.everyone) summary.everyone = fillTally(raw.everyone);
  const rank = raw?.luckRank;
  if (rank && Number(rank.others) > 0) {
    summary.luckRank = { below: Number(rank.below) || 0, others: Number(rank.others) };
  }
  const audit = raw?.audit;
  if (audit && Array.isArray(audit.counts) && audit.counts.length === 6) {
    const p = num(audit.p);
    if (p !== null) {
      summary.audit = {
        counts: audit.counts.map((c) => Number(c) || 0),
        chi2: Number(audit.chi2) || 0,
        p,
      };
    }
  }
  return summary;
}

/** The query string for one account, when the scope is "user". */
const accountParam = (scope: StatsScope, account?: string) =>
  scope === "user" && account ? `&username=${encodeURIComponent(account)}` : "";

/** True when the server said there is no account by the name asked for. */
export function isNoSuchAccount(err: unknown): boolean {
  return err instanceof ApiError && err.code === "stats.noUser";
}

export async function fetchRollSummary(
  scope: StatsScope,
  view: StatsView,
  days: number,
  account?: string,
): Promise<RollSummary> {
  try {
    const raw = await api<Partial<RollSummary>>(
      `/api/stats/${scope}?view=${view}&days=${days}${accountParam(scope, account)}`,
      { auth: true },
    );
    const summary = fill(raw, view);
    if (typeof raw?.username === "string") summary.username = raw.username;
    return summary;
  } catch (err) {
    return unavailable(err);
  }
}

/** Who plays, by day and by week (the game owner only). */
export async function fetchRollActivity(days: number): Promise<RollActivity> {
  let raw: Partial<RollActivity> | null;
  try {
    raw = await api<Partial<RollActivity>>(`/api/stats/activity?days=${days}`, { auth: true });
  } catch (err) {
    return unavailable(err);
  }
  const count = (v: unknown) => Number(v) || 0;
  return {
    days: Number(raw?.days) || days,
    daily: (Array.isArray(raw?.daily) ? raw.daily : [])
      .filter((d) => d && typeof d.day === "string")
      .map((d) => {
        const byMode: RollActivity["daily"][number]["byMode"] = {};
        for (const mode of STATS_MODES) {
          const m = d.byMode?.[mode];
          if (m) byMode[mode] = { players: count(m.players), games: count(m.games) };
        }
        return { day: d.day, players: count(d.players), games: count(d.games), byMode };
      }),
    weekly: (Array.isArray(raw?.weekly) ? raw.weekly : [])
      .filter((w) => w && typeof w.week === "string")
      .map((w) => ({ week: w.week, players: count(w.players), returning: count(w.returning) })),
  };
}

/** A CSV export, as text, for the browser to save. */
export async function fetchRollCsv(
  scope: StatsScope,
  view: StatsView,
  kind: ExportKind,
  days: number,
  account?: string,
): Promise<string> {
  let res: Response;
  try {
    const token = getToken();
    res = await fetch(
      `${API_BASE}/api/stats/${scope}/export?view=${view}&kind=${kind}&days=${days}${accountParam(scope, account)}`,
      {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      },
    );
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }
  if (!res.ok) {
    let body: { error?: string; code?: string } | null = null;
    try {
      body = (await res.json()) as { error?: string; code?: string };
    } catch {
      /* not JSON */
    }
    unavailable(new ApiError(res.status, body?.error ?? "Something went wrong.", body?.code));
  }
  return res.text();
}

/** Send a finished solo game to the account. `id` makes a retry harmless. */
export async function uploadLocalGame(id: string, game: RollGame, faces?: number[]): Promise<void> {
  await api(`/api/stats/local`, { body: { id, game, faces }, auth: true });
}

/**
 * Accounts whose names start with what has been typed (any case), for the
 * owner's account picker. Empty on any failure — including an older server
 * with no such endpoint — so the box still works as a plain text field.
 */
export async function fetchAccountSuggestions(typed: string): Promise<string[]> {
  const q = typed.trim();
  if (!q) return [];
  try {
    const raw = await api<{ accounts?: unknown }>(
      `/api/stats/accounts?q=${encodeURIComponent(q)}`,
      { auth: true },
    );
    return Array.isArray(raw?.accounts)
      ? raw.accounts.filter((a): a is string => typeof a === "string")
      : [];
  } catch {
    return [];
  }
}
