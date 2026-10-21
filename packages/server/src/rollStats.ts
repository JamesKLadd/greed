/**
 * Roll statistics: every throw a signed-in player makes, kept for
 * ROLL_DATA_DAYS, and what it should have done by the exact odds.
 *
 * One row per finished game or challenge run per player (`roll_games`). The
 * row carries the game's throws in compact form — so a spreadsheet export can
 * list every one — and a tally of them, so a summary is one SUM over the rows
 * rather than a replay of every throw ever made.
 *
 * Where the throws come from decides how far they are trusted:
 *
 *   daily, weekly — the server replays the run it scored, so they are exact.
 *   online        — the server threw the dice itself.
 *   local         — a solo game played on the player's own device, uploaded
 *                   when it finishes. Nobody can verify those dice, and nothing
 *                   ranks on them; they are bounded (cleanRollGame) and kept
 *                   in their own mode so they never mix with the others.
 *
 * Each row has a natural key — which run, which room, which upload — so a
 * retried write, a backfill re-run or a repeated upload lands once.
 */

import { createHash } from "node:crypto";
import {
  ROLL_DATA_DAYS,
  TALLY_MAX_KEYS,
  TALLY_SUM_KEYS,
  ThrowCollector,
  cleanRollGame,
  decodeThrows,
  emptyTally,
  encodeThrows,
  gamesCsv,
  isStatsMode,
  rollGameFromState,
  tallyGame,
  throwsCsv,
  type LabelledGame,
  type RollGame,
  type RollTally,
  type StatsMode,
} from "@greed/bots";
import { RUN_PLAYER_ID, runPosition, type RunMove } from "@greed/core";
import { query } from "./db.js";
import { AccountError } from "./accounts.js";

/** Which games a view covers: one mode, or local and online together. */
export type StatsView = StatsMode | "games";

export function isStatsView(value: unknown): value is StatsView {
  return value === "games" || isStatsMode(value);
}

function modesOf(view: StatsView): StatsMode[] {
  return view === "games" ? ["local", "online"] : [view];
}

const KEEP = `${ROLL_DATA_DAYS} days`;

export async function migrateRollStats(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS roll_games (
      key           text PRIMARY KEY,
      user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mode          text NOT NULL,
      played_at     timestamptz NOT NULL,
      score         integer NOT NULL,
      won           boolean,
      goal          integer,
      players       integer,
      turns         integer NOT NULL,
      banks         integer NOT NULL,
      busts         integer NOT NULL,
      banked_points integer NOT NULL,
      lost_points   integer NOT NULL,
      best_turn     integer NOT NULL,
      tally         jsonb NOT NULL,
      throws        text NOT NULL
    );
  `);
  await query(
    `CREATE INDEX IF NOT EXISTS roll_games_user_idx ON roll_games (user_id, mode, played_at);`,
  );
  await query(`CREATE INDEX IF NOT EXISTS roll_games_mode_idx ON roll_games (mode, played_at);`);
  // Who may read everyone's numbers combined. Accounts, not names: see
  // snapshotStatsAdmins.
  await query(`
    CREATE TABLE IF NOT EXISTS stats_admins (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE
    );
  `);
}

/**
 * Grant the all-players view to the two accounts named for it, as they exist
 * at the moment this first runs — by account id, never by name.
 *
 * Checking the NAME on every request would hand the view to whoever registered
 * a matching name if either account were ever deleted. Taking the accounts as
 * they are now means a later sign-up called "Jimmy" is just a player.
 * Run once (applyOnce), and deliberately not retried: an account that did not
 * exist then is not one the owner vouched for.
 */
export async function snapshotStatsAdmins(names: readonly string[]): Promise<void> {
  await query(
    `INSERT INTO stats_admins (user_id)
     SELECT id FROM users WHERE lower(username) = ANY($1::text[])
     ON CONFLICT DO NOTHING`,
    [names.map((n) => n.toLowerCase())],
  );
  const { rows } = await query<{ username: string }>(
    `SELECT u.username FROM stats_admins a JOIN users u ON u.id = a.user_id ORDER BY 1`,
  );
  const who = rows.map((r) => r.username).join(", ");
  console.log(`Roll statistics: all-players view open to ${who || "nobody (no such accounts)"}.`);
}

export async function isStatsAdmin(userId: string): Promise<boolean> {
  const { rows } = await query(`SELECT 1 FROM stats_admins WHERE user_id = $1`, [userId]);
  return rows.length > 0;
}

/** File one finished game. A second write under the same key is ignored. */
export async function recordRollGame(userId: string, key: string, game: RollGame): Promise<void> {
  await query(
    `INSERT INTO roll_games
       (key, user_id, mode, played_at, score, won, goal, players, turns, banks, busts,
        banked_points, lost_points, best_turn, tally, throws)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     ON CONFLICT (key) DO NOTHING`,
    [
      key,
      userId,
      game.mode,
      game.playedAt,
      game.score,
      game.won,
      game.goal,
      game.players,
      game.turns,
      game.banks,
      game.busts,
      game.bankedPoints,
      game.lostPoints,
      game.bestTurn,
      JSON.stringify(tallyGame(game)),
      encodeThrows(game.throws),
    ],
  );
}

/**
 * File a finished challenge run by replaying it — the same replay that scored
 * it, watched throw by throw. A run that does not reach its turn limit is not
 * finished and is not filed.
 */
export async function recordRollRun(
  userId: string,
  mode: "daily" | "weekly",
  key: string,
  seed: number,
  moves: RunMove[],
  turnLimit: number,
  playedAt: Date = new Date(),
): Promise<void> {
  const collector = new ThrowCollector([RUN_PLAYER_ID]);
  const position = runPosition(seed, moves, turnLimit, (before, after) =>
    collector.observe(before, after),
  );
  if (!position.result.complete) return;
  const game = rollGameFromState(
    mode,
    position.state,
    RUN_PLAYER_ID,
    collector.throwsFor(RUN_PLAYER_ID),
    playedAt,
  );
  await recordRollGame(userId, key, game);
}

/** Fire-and-forget wrapper: statistics must never fail the thing being measured. */
export function fileQuietly(what: string, work: () => Promise<void>): void {
  void work().catch((err) =>
    console.error(`[roll stats] could not record ${what}:`, (err as Error).message),
  );
}

/**
 * Bring in the daily runs already on record, so the view does not open empty.
 *
 * Daily only. The weekly keeps just each player's BEST attempt of a week, and
 * the best attempts are the lucky ones: filing them alone would tell every
 * player their dice had been kinder than they were. Weekly data starts from
 * the attempts played after this ships, every one of them.
 */
export async function backfillDailyRolls(turnLimit: number): Promise<number> {
  const { rows } = await query<{
    user_id: string;
    day: string;
    seed: string;
    moves: string;
    created_at: Date;
  }>(
    // Seed 0 marks a run from before seeds were stored; its moves cannot be
    // replayed against the dice they were played on (see daily.ts).
    `SELECT user_id, day::text AS day, seed, moves, created_at
       FROM daily_runs
      WHERE complete AND seed <> 0 AND created_at >= now() - $1::interval`,
    [KEEP],
  );
  for (const r of rows) {
    const moves = r.moves ? (r.moves.split(",") as RunMove[]) : [];
    await recordRollRun(
      r.user_id,
      "daily",
      dailyRollKey(r.user_id, r.day),
      Number(r.seed),
      moves,
      turnLimit,
      r.created_at,
    );
  }
  return rows.length;
}

export const dailyRollKey = (userId: string, day: string) => `daily:${userId}:${day}`;
export const weeklyRollKey = (userId: string, week: string, seed: number) =>
  `weekly:${userId}:${week}:${seed}`;
export const onlineRollKey = (room: string, seed: number, userId: string) =>
  `online:${room}:${seed}:${userId}`;

/** A solo game uploaded by the device it was played on. */
export async function recordLocalGame(userId: string, raw: unknown): Promise<void> {
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const id = typeof body.id === "string" && /^[A-Za-z0-9-]{8,64}$/.test(body.id) ? body.id : null;
  if (!id) throw new AccountError(400, "That game can't be recorded.", "stats.invalid");
  const game = cleanRollGame(body.game, "local");
  if (!game) throw new AccountError(400, "That game can't be recorded.", "stats.invalid");
  await recordRollGame(userId, `local:${userId}:${id}`, game);
}

export const pruneRollGamesSql = `DELETE FROM roll_games WHERE played_at < now() - '${KEEP}'::interval`;

// ------------------------------------------------------------------- reading

export interface RollSummary {
  view: StatsView;
  days: number;
  tally: RollTally;
  /** Distinct players in the data (the all-players view). */
  playerCount: number;
  /**
   * Scores over time. One point per game for a single player; one per day,
   * averaged, for everyone combined — a chart of every game anyone played
   * would be a smear.
   */
  series: { at: string; score: number; games: number }[];
}

const sumCols = TALLY_SUM_KEYS.map(
  (k) => `COALESCE(SUM((tally ->> '${k}')::float8), 0) AS "${k}"`,
).join(", ");
const maxCols = TALLY_MAX_KEYS.map(
  (k) => `COALESCE(MAX((tally ->> '${k}')::float8), 0) AS "${k}"`,
).join(", ");

export async function rollSummary(view: StatsView, userId: string | null): Promise<RollSummary> {
  const modes = modesOf(view);
  const who = userId ? "AND user_id = $3" : "";
  const params: unknown[] = [modes, KEEP, ...(userId ? [userId] : [])];
  const { rows } = await query<Record<string, number | string>>(
    `SELECT ${sumCols}, ${maxCols}, COUNT(DISTINCT user_id)::int AS player_count
       FROM roll_games
      WHERE mode = ANY($1::text[]) AND played_at >= now() - $2::interval ${who}`,
    params,
  );
  const tally = emptyTally();
  for (const k of [...TALLY_SUM_KEYS, ...TALLY_MAX_KEYS]) tally[k] = Number(rows[0]?.[k]) || 0;

  const series = userId
    ? (
        await query<{ played_at: Date; score: number }>(
          `SELECT played_at, score FROM roll_games
            WHERE mode = ANY($1::text[]) AND played_at >= now() - $2::interval ${who}
            ORDER BY played_at`,
          params,
        )
      ).rows.map((r) => ({ at: r.played_at.toISOString(), score: r.score, games: 1 }))
    : (
        await query<{ day: string; score: number; games: number }>(
          `SELECT (played_at AT TIME ZONE 'America/Chicago')::date::text AS day,
                  AVG(score)::float8 AS score, COUNT(*)::int AS games
             FROM roll_games
            WHERE mode = ANY($1::text[]) AND played_at >= now() - $2::interval
            GROUP BY 1 ORDER BY 1`,
          params,
        )
      ).rows.map((r) => ({ at: r.day, score: Math.round(r.score), games: r.games }));

  return {
    view,
    days: ROLL_DATA_DAYS,
    tally,
    playerCount: Number(rows[0]?.player_count) || 0,
    series,
  };
}

/** A pseudonym for the all-players export: stable per player, says nothing about them. */
function pseudonym(userId: string): string {
  return `P-${createHash("sha256").update(`roll-stats:${userId}`).digest("hex").slice(0, 8)}`;
}

/** The most rows one export reads, as a ceiling on a single request's work. */
const EXPORT_LIMIT = 20_000;

export async function rollExport(
  view: StatsView,
  kind: "games" | "throws",
  userId: string | null,
): Promise<string> {
  const modes = modesOf(view);
  const who = userId ? "AND user_id = $3" : "";
  const { rows } = await query<{
    user_id: string;
    mode: string;
    played_at: Date;
    score: number;
    won: boolean | null;
    goal: number | null;
    players: number | null;
    turns: number;
    banks: number;
    busts: number;
    banked_points: number;
    lost_points: number;
    best_turn: number;
    throws: string;
  }>(
    `SELECT user_id, mode, played_at, score, won, goal, players, turns, banks, busts,
            banked_points, lost_points, best_turn, throws
       FROM roll_games
      WHERE mode = ANY($1::text[]) AND played_at >= now() - $2::interval ${who}
      ORDER BY played_at
      LIMIT ${EXPORT_LIMIT}`,
    [modes, KEEP, ...(userId ? [userId] : [])],
  );
  const games: LabelledGame[] = rows.map((r) => ({
    player: userId ? undefined : pseudonym(r.user_id),
    game: {
      mode: isStatsMode(r.mode) ? r.mode : "local",
      playedAt: r.played_at.toISOString(),
      score: r.score,
      won: r.won,
      goal: r.goal,
      players: r.players,
      turns: r.turns,
      banks: r.banks,
      busts: r.busts,
      bankedPoints: r.banked_points,
      lostPoints: r.lost_points,
      bestTurn: r.best_turn,
      throws: decodeThrows(r.throws),
    },
  }));
  return kind === "games" ? gamesCsv(games) : throwsCsv(games);
}
