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
  chiSquareFair,
  cleanFaces,
  cleanRollGame,
  decisionsCsv,
  decodeDecisions,
  decodeThrows,
  encodeDecisions,
  emptyTally,
  encodeThrows,
  gamesCsv,
  isStatsMode,
  rollGameFromState,
  tableFaces,
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

/** The windows a view can be narrowed to, in days. */
export const STATS_WINDOWS = [7, 30, ROLL_DATA_DAYS] as const;

export function statsWindow(raw: unknown): number {
  const days = Number(raw);
  return STATS_WINDOWS.some((d) => d === days) ? days : ROLL_DATA_DAYS;
}

const interval = (days: number) => `${days} days`;

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
  // Added with decision tracking. Every row before it was a finished game — only
  // finished games were recorded — so the default is the truth for them, and
  // their tallies are given the count the scores are now averaged over.
  await query(
    `ALTER TABLE roll_games ADD COLUMN IF NOT EXISTS finished boolean NOT NULL DEFAULT true;`,
  );
  await query(
    `ALTER TABLE roll_games ADD COLUMN IF NOT EXISTS decisions text NOT NULL DEFAULT '[]';`,
  );
  await query(
    `UPDATE roll_games SET tally = tally || '{"finished": 1}'::jsonb
      WHERE finished AND NOT tally ? 'finished'`,
  );
  // The fairness audit: every die thrown in a game, by ANYONE — bots included —
  // one row per game rather than per player, so a table of four is counted
  // once. Nobody's choices are in it, which is what makes it a test of the dice.
  await query(`
    CREATE TABLE IF NOT EXISTS dice_audit (
      key       text PRIMARY KEY,
      mode      text NOT NULL,
      played_at timestamptz NOT NULL,
      f1 integer NOT NULL, f2 integer NOT NULL, f3 integer NOT NULL,
      f4 integer NOT NULL, f5 integer NOT NULL, f6 integer NOT NULL
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS dice_audit_mode_idx ON dice_audit (mode, played_at);`);
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
        banked_points, lost_points, best_turn, tally, throws, finished, decisions)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
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
      game.finished,
      encodeDecisions(game.decisions),
    ],
  );
}

/** File one game's dice for the fairness audit, once per game. */
export async function recordDiceAudit(
  key: string,
  mode: StatsMode,
  faces: readonly number[],
  playedAt: Date | string = new Date(),
): Promise<void> {
  if (faces.length !== 6 || faces.every((f) => f === 0)) return;
  await query(
    `INSERT INTO dice_audit (key, mode, played_at, f1, f2, f3, f4, f5, f6)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (key) DO NOTHING`,
    [key, mode, playedAt, ...faces],
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
    { decisions: collector.decisionsFor(RUN_PLAYER_ID) },
  );
  await recordRollGame(userId, key, game);
  await recordDiceAudit(key, mode, tableFaces(position.state), playedAt);
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
/** The fairness audit counts a table once, whoever was sitting at it. */
export const onlineAuditKey = (room: string, seed: number) => `online:${room}:${seed}`;

/** A solo game uploaded by the device it was played on. */
export async function recordLocalGame(userId: string, raw: unknown): Promise<void> {
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const id = typeof body.id === "string" && /^[A-Za-z0-9-]{8,64}$/.test(body.id) ? body.id : null;
  if (!id) throw new AccountError(400, "That game can't be recorded.", "stats.invalid");
  const game = cleanRollGame(body.game, "local");
  if (!game) throw new AccountError(400, "That game can't be recorded.", "stats.invalid");
  const key = `local:${userId}:${id}`;
  await recordRollGame(userId, key, game);
  // Every die at the table, the bots' too, for the fairness audit. Optional:
  // an older client sends none, and its game is no less a game.
  const faces = cleanFaces(body.faces);
  if (faces) await recordDiceAudit(key, "local", faces, game.playedAt);
}

export const pruneRollGamesSql = `DELETE FROM roll_games WHERE played_at < now() - '${KEEP}'::interval`;
export const pruneDiceAuditSql = `DELETE FROM dice_audit WHERE played_at < now() - '${KEEP}'::interval`;

// ------------------------------------------------------------------- reading

export interface SeriesPoint {
  at: string;
  /** Final score (finished games only). */
  score: number | null;
  /** Points the throws scored over what they were worth on average. */
  luck: number;
  games: number;
}

export interface RollSummary {
  view: StatsView;
  days: number;
  tally: RollTally;
  /** Distinct players in the data (the all-players view). */
  playerCount: number;
  /**
   * Over time. One point per game for a single player; one per day, averaged,
   * for everyone combined — a chart of every game anyone played would be a
   * smear. Scores are finished games only; luck counts every game.
   */
  series: SeriesPoint[];
  /** Everyone's tally for the same view and window: the "average player". */
  everyone?: RollTally;
  /**
   * Where this player's luck ranks: the share of OTHER players (with enough
   * throws to judge) whose dice were less kind. Absent with fewer than
   * MIN_RANKED of them, where a rank would point at individuals.
   */
  luckRank?: { below: number; others: number };
  /** The fairness audit (all-players view only). */
  audit?: { counts: number[]; chi2: number; p: number };
}

const sumCols = TALLY_SUM_KEYS.map(
  (k) => `COALESCE(SUM((tally ->> '${k}')::float8), 0) AS "${k}"`,
).join(", ");
const maxCols = TALLY_MAX_KEYS.map(
  (k) => `COALESCE(MAX((tally ->> '${k}')::float8), 0) AS "${k}"`,
).join(", ");

/** Throws a player needs in a window before their luck is ranked at all. */
const MIN_RANKED_THROWS = 30;
/** Other ranked players needed before a rank is shown. */
const MIN_RANKED = 5;

async function sumTally(
  modes: StatsMode[],
  days: number,
  userId: string | null,
): Promise<{ tally: RollTally; players: number }> {
  const who = userId ? "AND user_id = $3" : "";
  const { rows } = await query<Record<string, number | string>>(
    `SELECT ${sumCols}, ${maxCols}, COUNT(DISTINCT user_id)::int AS player_count
       FROM roll_games
      WHERE mode = ANY($1::text[]) AND played_at >= now() - $2::interval ${who}`,
    [modes, interval(days), ...(userId ? [userId] : [])],
  );
  const tally = emptyTally();
  for (const k of [...TALLY_SUM_KEYS, ...TALLY_MAX_KEYS]) tally[k] = Number(rows[0]?.[k]) || 0;
  return { tally, players: Number(rows[0]?.player_count) || 0 };
}

const LUCK = `((tally ->> 'gain')::float8 - (tally ->> 'eGain')::float8)`;

export async function rollSummary(
  view: StatsView,
  userId: string | null,
  days: number = ROLL_DATA_DAYS,
): Promise<RollSummary> {
  const modes = modesOf(view);
  const span = interval(days);
  const own = await sumTally(modes, days, userId);

  const series: SeriesPoint[] = userId
    ? (
        await query<{ played_at: Date; score: number; finished: boolean; luck: number }>(
          `SELECT played_at, score, finished, ${LUCK} AS luck FROM roll_games
            WHERE mode = ANY($1::text[]) AND played_at >= now() - $2::interval AND user_id = $3
            ORDER BY played_at`,
          [modes, span, userId],
        )
      ).rows.map((r) => ({
        at: r.played_at.toISOString(),
        score: r.finished ? r.score : null,
        luck: Number(r.luck) || 0,
        games: 1,
      }))
    : (
        await query<{ day: string; score: number | null; luck: number; games: number }>(
          `SELECT (played_at AT TIME ZONE 'America/Chicago')::date::text AS day,
                  AVG(score) FILTER (WHERE finished)::float8 AS score,
                  AVG(${LUCK})::float8 AS luck, COUNT(*)::int AS games
             FROM roll_games
            WHERE mode = ANY($1::text[]) AND played_at >= now() - $2::interval
            GROUP BY 1 ORDER BY 1`,
          [modes, span],
        )
      ).rows.map((r) => ({
        at: r.day,
        score: r.score === null ? null : Math.round(r.score),
        luck: Number(r.luck) || 0,
        games: r.games,
      }));

  const summary: RollSummary = {
    view,
    days,
    tally: own.tally,
    playerCount: own.players,
    series,
  };

  if (userId) {
    summary.everyone = (await sumTally(modes, days, null)).tally;
    const { rows } = await query<{ others: number; below: number; ranked: boolean }>(
      `WITH per AS (
         SELECT user_id, SUM(${LUCK}) / SUM((tally ->> 'throws')::float8) AS luck
           FROM roll_games
          WHERE mode = ANY($1::text[]) AND played_at >= now() - $2::interval
          GROUP BY user_id
         HAVING SUM((tally ->> 'throws')::float8) >= $4
       ), me AS (SELECT luck FROM per WHERE user_id = $3)
       SELECT (SELECT COUNT(*) FROM per WHERE user_id <> $3)::int AS others,
              (SELECT COUNT(*) FROM per, me WHERE per.user_id <> $3 AND per.luck < me.luck)::int
                AS below,
              EXISTS (SELECT 1 FROM me) AS ranked`,
      [modes, span, userId, MIN_RANKED_THROWS],
    );
    const r = rows[0];
    if (r?.ranked && r.others >= MIN_RANKED)
      summary.luckRank = { below: r.below, others: r.others };
  } else {
    const { rows } = await query<Record<string, number>>(
      `SELECT COALESCE(SUM(f1),0)::float8 AS f1, COALESCE(SUM(f2),0)::float8 AS f2,
              COALESCE(SUM(f3),0)::float8 AS f3, COALESCE(SUM(f4),0)::float8 AS f4,
              COALESCE(SUM(f5),0)::float8 AS f5, COALESCE(SUM(f6),0)::float8 AS f6
         FROM dice_audit
        WHERE mode = ANY($1::text[]) AND played_at >= now() - $2::interval`,
      [modes, span],
    );
    const counts = [1, 2, 3, 4, 5, 6].map((f) => Number(rows[0]?.[`f${f}`]) || 0);
    const test = chiSquareFair(counts);
    if (test) summary.audit = { counts, ...test };
  }
  return summary;
}

export interface RollActivity {
  days: number;
  /** Per Chicago day: signed-in players and games, overall and by mode. */
  daily: {
    day: string;
    players: number;
    games: number;
    byMode: Partial<Record<StatsMode, { players: number; games: number }>>;
  }[];
  /** Per challenge week (Monday): players, and how many also played the week before. */
  weekly: { week: string; players: number; returning: number }[];
}

/** Who is playing, and who comes back — for the all-players view. */
export async function rollActivity(days: number = ROLL_DATA_DAYS): Promise<RollActivity> {
  const span = interval(days);
  const day = `(played_at AT TIME ZONE 'America/Chicago')::date`;
  const [overall, byMode, weeks] = await Promise.all([
    query<{ day: string; players: number; games: number }>(
      `SELECT ${day}::text AS day, COUNT(DISTINCT user_id)::int AS players, COUNT(*)::int AS games
         FROM roll_games WHERE played_at >= now() - $1::interval
        GROUP BY 1 ORDER BY 1`,
      [span],
    ),
    query<{ day: string; mode: string; players: number; games: number }>(
      `SELECT ${day}::text AS day, mode, COUNT(DISTINCT user_id)::int AS players,
              COUNT(*)::int AS games
         FROM roll_games WHERE played_at >= now() - $1::interval
        GROUP BY 1, 2`,
      [span],
    ),
    query<{ week: string; players: number; returning: number }>(
      `WITH wk AS (
         SELECT DISTINCT date_trunc('week', played_at AT TIME ZONE 'America/Chicago')::date AS week,
                user_id
           FROM roll_games WHERE played_at >= now() - $1::interval
       )
       SELECT w.week::text AS week, COUNT(*)::int AS players, COUNT(p.user_id)::int AS returning
         FROM wk w LEFT JOIN wk p ON p.user_id = w.user_id AND p.week = w.week - 7
        GROUP BY w.week ORDER BY w.week`,
      [span],
    ),
  ]);
  const daily = overall.rows.map((r) => ({
    day: r.day,
    players: r.players,
    games: r.games,
    byMode: {} as RollActivity["daily"][number]["byMode"],
  }));
  const index = new Map(daily.map((d) => [d.day, d]));
  for (const r of byMode.rows) {
    const d = index.get(r.day);
    if (d && isStatsMode(r.mode)) d.byMode[r.mode] = { players: r.players, games: r.games };
  }
  return { days, daily, weekly: weeks.rows };
}

/** A pseudonym for the all-players export: stable per player, says nothing about them. */
function pseudonym(userId: string): string {
  return `P-${createHash("sha256").update(`roll-stats:${userId}`).digest("hex").slice(0, 8)}`;
}

/** The most rows one export reads, as a ceiling on a single request's work. */
const EXPORT_LIMIT = 20_000;

export type ExportKind = "games" | "throws" | "decisions";

export async function rollExport(
  view: StatsView,
  kind: ExportKind,
  userId: string | null,
  days: number = ROLL_DATA_DAYS,
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
    finished: boolean;
    throws: string;
    decisions: string;
  }>(
    `SELECT user_id, mode, played_at, score, won, goal, players, turns, banks, busts,
            banked_points, lost_points, best_turn, finished, throws, decisions
       FROM roll_games
      WHERE mode = ANY($1::text[]) AND played_at >= now() - $2::interval ${who}
      ORDER BY played_at
      LIMIT ${EXPORT_LIMIT}`,
    [modes, interval(days), ...(userId ? [userId] : [])],
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
      finished: r.finished,
      throws: decodeThrows(r.throws),
      decisions: decodeDecisions(r.decisions),
    },
  }));
  return kind === "games"
    ? gamesCsv(games)
    : kind === "throws"
      ? throwsCsv(games)
      : decisionsCsv(games);
}
