/**
 * Postgres access for accounts. A single pooled connection (Neon serverless
 * Postgres in production) shared by the auth/accounts logic. Everything here is a
 * no-op when DATABASE_URL is unset, so the server still runs for guest online
 * play without a database configured.
 */

import pg from "pg";
import type { QueryResult, QueryResultRow } from "pg";
import { BEST_TOTAL_CEILING, scoreDailyRun, scoreWeeklyRun } from "@greed/core";
import type { RunMove } from "@greed/core";

const { Pool } = pg;

let pool: pg.Pool | null = null;

/**
 * Set when the database is configured but unusable, so the server stops
 * claiming to have accounts it cannot serve. See the boot sequence in index.ts.
 */
let accountsBroken = false;

/** Give up on accounts for this process; online play carries on as guests. */
export function disableAccounts(): void {
  accountsBroken = true;
}

/** True when a database is configured AND usable (accounts are available). */
export function accountsEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL) && !accountsBroken;
}

function makePool(): pg.Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  // Managed Postgres requires TLS. Verify the certificate against Node's own
  // root store — Neon, Render and RDS all present publicly-signed certificates,
  // so nothing needs shipping. This used to pass `rejectUnauthorized: false`,
  // which encrypted the connection without authenticating the other end of it.
  //
  // DATABASE_SSL_INSECURE exists for a host that genuinely presents a private
  // certificate; it is the old behaviour, and it says what it is.
  const wantsTls = /sslmode=require|neon\.tech|render\.com|amazonaws\.com/.test(connectionString);
  const insecure = process.env.DATABASE_SSL_INSECURE === "true";
  const ssl = wantsTls ? { rejectUnauthorized: !insecure } : undefined;
  return new Pool({ connectionString, ssl, max: 5, idleTimeoutMillis: 30_000 });
}

export function getPool(): pg.Pool {
  if (!pool) pool = makePool();
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params);
}

/** Create the accounts schema if it doesn't exist. Safe to run on every boot. */
/**
 * Work out `super_busts` for runs that were played before the column existed.
 *
 * Left NULL by the ALTER above rather than defaulted to 0, because NULL is the
 * thing that makes this a one-shot: a row is filled once and never looked at
 * again. Defaulting to zero would have been a lie with no way to tell it from
 * an honest zero, and it would have been on display for a while — the weekly
 * shows the best attempt of the CURRENT week, so a run played on Monday is
 * still the one on screen on Sunday.
 *
 * Exact rather than estimated: every row keeps the seed and the moves for
 * precisely this reason, so replaying them through the same engine that scored
 * them originally gives the real figure.
 *
 * The one thing that cannot be recovered is a daily row from before the seed
 * became a stored secret — `seed = 0` there is a placeholder, not a seed, and
 * replaying against it meets dice the player never saw. Those rows settle at 0,
 * which is the same answer as leaving them out and simpler to read back.
 */
async function backfillSuperBusts(): Promise<void> {
  const runs: { table: string; score: (seed: number, moves: RunMove[]) => number }[] = [
    { table: "daily_runs", score: (seed, moves) => scoreDailyRun(seed, moves).superBusts },
    { table: "weekly_runs", score: (seed, moves) => scoreWeeklyRun(seed, moves).superBusts },
  ];
  for (const { table, score } of runs) {
    const { rows } = await query<{ user_id: string; key: string; seed: string; moves: string }>(
      `SELECT user_id, ${table === "daily_runs" ? "day" : "week"}::text AS key, seed, moves
         FROM ${table} WHERE super_busts IS NULL`,
    );
    for (const row of rows) {
      const seed = Number(row.seed); // bigint arrives as a string
      const moves = row.moves ? (row.moves.split(",") as RunMove[]) : [];
      const n = seed && moves.length ? score(seed, moves) : 0;
      await query(
        `UPDATE ${table} SET super_busts = $3
          WHERE user_id = $1 AND ${table === "daily_runs" ? "day" : "week"} = $2`,
        [row.user_id, row.key, n],
      );
    }
  }
}

export async function migrate(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email          text NOT NULL,
      username       text NOT NULL,
      password_hash  text NOT NULL,
      email_verified boolean NOT NULL DEFAULT false,
      profile        jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at     timestamptz NOT NULL DEFAULT now(),
      updated_at     timestamptz NOT NULL DEFAULT now()
    );
  `);
  // Sessions are stateless JWTs, so this is what makes a password reset or an
  // account deletion actually END the sessions that were already out there:
  // anything issued before this moment is refused. See auth.ts.
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS sessions_valid_from timestamptz;`);
  // Case-insensitive uniqueness for both email and username.
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));`);
  await query(
    `CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (lower(username));`,
  );
  await query(`
    CREATE TABLE IF NOT EXISTS auth_tokens (
      token_hash text PRIMARY KEY,
      user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind       text NOT NULL,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS auth_tokens_user_idx ON auth_tokens (user_id, kind);`);
  await query(`
    CREATE TABLE IF NOT EXISTS daily_runs (
      user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day        date NOT NULL,
      score      integer NOT NULL,
      turns      integer NOT NULL,
      banks      integer NOT NULL,
      busts      integer NOT NULL,
      hot_dice   integer NOT NULL,
      best_turn  integer NOT NULL,
      /** The submitted moves, kept so a score can always be re-verified. */
      moves      text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, day)
    );
  `);
  // Each run's dice come from a randomly generated seed the server keeps to
  // itself. A seed derived from (day, player) — which is what this used to do —
  // is reproducible by anyone who can work out the inputs, and a player who can
  // reproduce their seed can read the whole day off before playing it.
  await query(`ALTER TABLE daily_runs ADD COLUMN IF NOT EXISTS seed bigint NOT NULL DEFAULT 0;`);
  // A run is claimed the moment it starts, so rows exist before they are
  // finished. Defaulting to true keeps every run that predates this column —
  // all of which were only ever written on completion — counted as complete.
  await query(
    `ALTER TABLE daily_runs ADD COLUMN IF NOT EXISTS complete boolean NOT NULL DEFAULT true;`,
  );
  await query(`ALTER TABLE daily_runs ADD COLUMN IF NOT EXISTS super_busts integer;`);
  // Leaderboard reads are "top N for a day", so order within the day.
  await query(
    `CREATE INDEX IF NOT EXISTS daily_runs_day_score_idx ON daily_runs (day, score DESC);`,
  );
  // ---- The weekly challenge -------------------------------------------------
  // One row per player per week, holding their BEST attempt: its seed and moves
  // (so it can always be re-verified, like a daily run), the stats of that run,
  // and how many attempts they have finished this week. A row exists only once
  // a player has COMPLETED an attempt, which is what makes "complete" a column
  // the daily needs and this one doesn't.
  await query(`
    CREATE TABLE IF NOT EXISTS weekly_runs (
      user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      /** The Monday the challenge week starts on. */
      week       date NOT NULL,
      score      integer NOT NULL,
      turns      integer NOT NULL,
      banks      integer NOT NULL,
      busts      integer NOT NULL,
      hot_dice   integer NOT NULL,
      best_turn  integer NOT NULL,
      seed       bigint  NOT NULL,
      moves      text    NOT NULL,
      /** Attempts finished this week, best and beaten alike. */
      attempts   integer NOT NULL DEFAULT 0,
      /**
       * When the standing best score was FIRST reached. The board's tiebreak,
       * so matching a score never displaces the player who got there first —
       * and beating your own best does not cost you the ground it won.
       */
      best_at    timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, week)
    );
  `);
  await query(`ALTER TABLE weekly_runs ADD COLUMN IF NOT EXISTS super_busts integer;`);
  // Attempts spent per CALENDAR DAY, once the weekly's ration became a daily
  // one. The count on weekly_runs stays what it always was — every attempt a
  // player has made this week, which is what "best of N attempts" means on the
  // board — and this answers the different question the cap now asks: how many
  // have they made TODAY. Neither can be derived from the other, so both are
  // kept rather than one being computed from the other and getting it wrong.
  //
  // Days are the challenge zone's days, the same ones the daily challenge is
  // keyed by, so "a new day" means the same thing in both modes.
  await query(`
    CREATE TABLE IF NOT EXISTS weekly_attempts (
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day     date NOT NULL,
      n       integer NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, day)
    );
  `);
  await query(
    `CREATE INDEX IF NOT EXISTS weekly_runs_week_score_idx ON weekly_runs (week, score DESC);`,
  );
  await backfillSuperBusts();
  // The one attempt a player has open, if any. Its own table rather than a flag
  // on the row above, because an attempt in progress has no score yet and must
  // never be visible to the board — and because the PRIMARY KEY on user_id is
  // what enforces the rule that you finish a run before you start another.
  await query(`
    CREATE TABLE IF NOT EXISTS weekly_open (
      user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      week       date NOT NULL,
      seed       bigint NOT NULL,
      moves      text NOT NULL,
      started_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  // One row per friendship, owned by whoever asked. A friendship is mutual only
  // once accepted, so nobody can add themselves to someone else's list.
  await query(`
    CREATE TABLE IF NOT EXISTS friendships (
      requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      addressee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status       text NOT NULL DEFAULT 'pending',
      created_at   timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (requester_id, addressee_id),
      CHECK (requester_id <> addressee_id)
    );
  `);
  // Both directions are queried ("my friends" spans either column).
  await query(
    `CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON friendships (addressee_id, status);`,
  );

  // One row per finished online game per player: what the match history reads.
  // Denormalised on purpose — a finished game is a fact, and re-deriving the
  // opponents later would mean keeping every room's state forever.
  await query(`
    CREATE TABLE IF NOT EXISTS match_history (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      played_at  timestamptz NOT NULL DEFAULT now(),
      won        boolean NOT NULL,
      score      integer NOT NULL,
      goal       integer NOT NULL,
      players    integer NOT NULL,
      /** Side in a team game, or null in a free-for-all. */
      team       integer,
      /** Display names of everyone else at the table. */
      opponents  text[] NOT NULL DEFAULT '{}'
    );
  `);
  await query(
    `CREATE INDEX IF NOT EXISTS match_history_user_idx
       ON match_history (user_id, played_at DESC);`,
  );

  /**
   * Career figures the SERVER owns.
   *
   * The all-time boards used to rank `users.profile`, which is a snapshot the
   * client uploads — so they ranked whatever a client claimed. One PUT put a
   * brand-new account at the top of three of them with 999,999,999 wins, and
   * because the profile merge only ever takes the maximum, a forged figure
   * could never be walked back.
   *
   * These rows are written only from finished games the server itself ran, and
   * from challenge runs it scored by replaying the moves. The profile sync
   * stays as it was — it is a player's own record of their own play, including
   * offline games nobody else can see — but it no longer decides the boards.
   *
   * Kept apart from match_history because that is a LOG and now expires after
   * thirty days, while a career total is a career total.
   */
  await query(`
    CREATE TABLE IF NOT EXISTS career_stats (
      user_id        uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      online_games   integer NOT NULL DEFAULT 0,
      online_wins    integer NOT NULL DEFAULT 0,
      /** Live run of wins, and the longest one ever held. */
      current_streak integer NOT NULL DEFAULT 0,
      best_streak    integer NOT NULL DEFAULT 0,
      /** Best single turn, from online games AND scored challenge runs. */
      best_turn      integer NOT NULL DEFAULT 0,
      /** Highest finishing total, standard-goal games only. */
      best_total     integer NOT NULL DEFAULT 0,
      updated_at     timestamptz NOT NULL DEFAULT now()
    );
  `);
  for (const [col, dir] of [
    ["online_wins", "DESC"],
    ["best_turn", "DESC"],
    ["best_streak", "DESC"],
    ["best_total", "DESC"],
  ]) {
    await query(
      `CREATE INDEX IF NOT EXISTS career_stats_${col}_idx ON career_stats (${col} ${dir});`,
    );
  }
  // Carry across what players had before the boards moved, clamped to figures a
  // real game could produce. Runs once: after the first pass every account has
  // a row and the WHERE NOT EXISTS matches nothing. Honest players keep their
  // standing; anything absurd arrives capped rather than banked.
  await query(
    `INSERT INTO career_stats (user_id, online_wins, best_turn, best_streak, best_total)
     SELECT id,
            LEAST(GREATEST(COALESCE((profile ->> 'wins')::numeric, 0), 0), 100000)::int,
            LEAST(GREATEST(COALESCE((profile ->> 'bestTurn')::numeric, 0), 0), 20000)::int,
            LEAST(GREATEST(COALESCE((profile ->> 'bestStreak')::numeric, 0), 0), 1000)::int,
            LEAST(GREATEST(COALESCE((profile ->> 'bestTotal')::numeric, 0), 0), $1)::int
       FROM users u
      WHERE NOT EXISTS (SELECT 1 FROM career_stats c WHERE c.user_id = u.id)`,
    [BEST_TOTAL_CEILING],
  );

  // Void Best Totals that no standard game could have produced.
  //
  // Best Total came up from the client as a career best over ANY game, and a
  // game's goal is a setting — so a local game to 50,000 posted a score the
  // board had no way to question. Clients only record it from a game at the
  // standard goal now, and mergeProfile refuses anything over the ceiling on
  // the way in; this clears what was already banked under the old rule.
  //
  // Left in the migration rather than run once by hand: it is idempotent (after
  // the first pass nothing matches), it is the record of what happened to those
  // rows, and it runs on the deploy that introduces the rule instead of needing
  // to be remembered separately.
  const voided = await query(
    `UPDATE users
        SET profile = jsonb_set(profile, '{bestTotal}', '0'::jsonb),
            updated_at = now()
      WHERE (profile ->> 'bestTotal')::numeric > $1`,
    [BEST_TOTAL_CEILING],
  );
  if (voided.rowCount) {
    console.log(
      `Leaderboards: voided ${voided.rowCount} Best Total(s) above ${BEST_TOTAL_CEILING}.`,
    );
  }

  await prune();
}

/** How long finished records are kept before they are cleared out. */
export const RETENTION_DAYS = 30;

/**
 * Clear out what is no longer read.
 *
 * Three tables only ever grew: every finished online game, every daily run and
 * every weekly attempt, kept forever for boards that never look further back
 * than the current period. Thirty days is well past anything the game asks for
 * and leaves a month of history on a player's profile.
 *
 * Expired verification and reset tokens go too. Those were already refused once
 * `expires_at` passed — a link nobody ever clicked simply stayed in the table.
 *
 * Runs on boot, and again daily for a server that stays up (see `startPruning`).
 * Everything here is a plain DELETE by date, so running it twice does nothing
 * the first pass didn't.
 */
export async function prune(): Promise<void> {
  const cutoff = `${RETENTION_DAYS} days`;
  const jobs: [string, string, unknown[]][] = [
    ["expired sign-in tokens", `DELETE FROM auth_tokens WHERE expires_at < now()`, []],
    ["old matches", `DELETE FROM match_history WHERE played_at < now() - $1::interval`, [cutoff]],
    ["old daily runs", `DELETE FROM daily_runs WHERE day < (now() - $1::interval)::date`, [cutoff]],
    [
      "old weekly runs",
      `DELETE FROM weekly_runs WHERE week < (now() - $1::interval)::date`,
      [cutoff],
    ],
    [
      "old weekly attempt counts",
      `DELETE FROM weekly_attempts WHERE day < (now() - $1::interval)::date`,
      [cutoff],
    ],
    // An attempt left open for a month belongs to a week that closed long ago
    // and can never be scored; it only holds its player's one open slot.
    [
      "abandoned weekly attempts",
      `DELETE FROM weekly_open WHERE started_at < now() - $1::interval`,
      [cutoff],
    ],
  ];
  for (const [what, sql, params] of jobs) {
    try {
      const { rowCount } = await query(sql, params);
      if (rowCount) console.log(`Retention: cleared ${rowCount} ${what}.`);
    } catch (err) {
      // One table missing or busy must not stop the others, and must never stop
      // the server: this is housekeeping, not a boot requirement.
      console.error(`Retention: could not clear ${what} —`, (err as Error).message);
    }
  }
}

/** Re-run the retention sweep once a day for a server that stays up. */
export function startPruning(): NodeJS.Timeout {
  const timer = setInterval(
    () => {
      void prune();
    },
    24 * 60 * 60 * 1000,
  );
  timer.unref?.();
  return timer;
}
