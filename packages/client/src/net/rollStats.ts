/**
 * Roll statistics API: summaries of a player's own throws (or, for the game's
 * owner, everyone's), CSV exports of them, and the upload a finished solo game
 * makes.
 */

import { emptyTally, type RollGame, type RollTally, type TallyKey } from "@greed/bots";
import { API_BASE, ApiError, api, getToken } from "./auth.js";

/** Which games a view covers: one mode, or local and online together. */
export type StatsView = "games" | "local" | "online" | "daily" | "weekly";
export type StatsScope = "me" | "all";

export interface RollSummary {
  view: StatsView;
  days: number;
  tally: RollTally;
  playerCount: number;
  series: { at: string; score: number; games: number }[];
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
  if (err instanceof ApiError && (err.status === 404 || err.status === 503)) {
    throw new StatsUnavailable();
  }
  throw err;
}

/** Normalise once, here, so the screen can trust every field it reads. */
function fill(raw: Partial<RollSummary> | null, view: StatsView): RollSummary {
  const tally = emptyTally();
  const src = (raw?.tally ?? {}) as Partial<Record<TallyKey, unknown>>;
  for (const k of Object.keys(tally) as TallyKey[]) tally[k] = Number(src[k]) || 0;
  return {
    view,
    days: Number(raw?.days) || 100,
    tally,
    playerCount: Number(raw?.playerCount) || 0,
    series: Array.isArray(raw?.series)
      ? raw.series
          .filter((p) => p && typeof p.at === "string" && Number.isFinite(Number(p.score)))
          .map((p) => ({ at: p.at, score: Number(p.score), games: Number(p.games) || 1 }))
      : [],
  };
}

export async function fetchRollSummary(scope: StatsScope, view: StatsView): Promise<RollSummary> {
  try {
    const raw = await api<Partial<RollSummary>>(`/api/stats/${scope}?view=${view}`, {
      auth: true,
    });
    return fill(raw, view);
  } catch (err) {
    return unavailable(err);
  }
}

/** A CSV export, as text, for the browser to save. */
export async function fetchRollCsv(
  scope: StatsScope,
  view: StatsView,
  kind: "games" | "throws",
): Promise<string> {
  let res: Response;
  try {
    const token = getToken();
    res = await fetch(`${API_BASE}/api/stats/${scope}/export?view=${view}&kind=${kind}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
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
export async function uploadLocalGame(id: string, game: RollGame): Promise<void> {
  await api(`/api/stats/local`, { body: { id, game }, auth: true });
}
