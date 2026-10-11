/**
 * Postgres access for accounts. A single pooled connection (Neon serverless
 * Postgres in production) shared by the auth/accounts logic. Everything here is a
 * no-op when DATABASE_URL is unset, so the server still runs for guest online
 * play without a database configured.
 */

import pg from "pg";
import type { QueryResult, QueryResultRow } from "pg";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  BEST_TOTAL_CEILING,
  DAILY_ZONE,
  scoreDailyRun,
  scoreWeeklyRun,
  weekKey,
} from "@greed/core";
import { refreshCareerChallengeWins, seedChallengeWinsLedger } from "./leaderboards.js";
import type { RunMove } from "@greed/core";
import { preserveDailyCompletions } from "./daily-streaks.js";
import { preserveWeeklyChampions, WEEKLY_HISTORY_WEEKS } from "./weekly-history.js";
import { preserveChallengeScores } from "./challenge-scores.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;
const transactionClient = new AsyncLocalStorage<pg.PoolClient>();

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
  return (transactionClient.getStore() ?? getPool()).query<T>(text, params);
}

/**
 * Keep a challenge's read/replay/write sequence indivisible, even across server
 * processes. Lock the account rather than an open-run row: a first start has no
 * row to lock yet, and weekly settlement removes it. All nested query calls use
 * the same connection so counting an attempt, recording it and freeing its slot
 * either commit together or leave the previous position intact for a retry.
 */
export async function withChallengeTransaction<T>(
  userId: string,
  work: () => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  let discard = false;
  try {
    await client.query("BEGIN");
    // A separate namespace keeps challenge locks apart from unrelated locks.
    // Hash collisions only make two accounts wait; they never weaken the lock.
    await client.query("SELECT pg_advisory_xact_lock(1735549285, hashtext($1))", [userId]);
    const result = await transactionClient.run(client, work);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // A lost connection must not hide the original failure or return an
      // unusable connection to the pool.
      discard = true;
    }
    throw error;
  } finally {
    client.release(discard || undefined);
  }
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

/**
 * Run a one-off data repair, once and only once.
 *
 * Everything else in `migrate()` is idempotent by construction — CREATE TABLE
 * IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, a backfill guarded by a NULL — and
 * so it can run on every boot forever. A repair that CORRECTS data is not like
 * that. It is right at the moment it is written and wrong later — a repair that
 * seeds or lowers a figure that is otherwise only ever added to would, run a
 * second time, count something twice or destroy honest standings. So the
 * repairs that have run are written down, and never run again.
 *
 * A repair may return `false` to say it found nothing to act on yet — a named
 * account that does not exist, say. It is then NOT written down, and is tried
 * again on the next boot rather than being quietly used up.
 */
async function applyOnce(id: string, repair: () => Promise<void | boolean>): Promise<void> {
  const { rows } = await query(`SELECT 1 FROM schema_fixes WHERE id = $1`, [id]);
  if (rows.length > 0) return;
  if ((await repair()) === false) return;
  await query(`INSERT INTO schema_fixes (id) VALUES ($1) ON CONFLICT DO NOTHING`, [id]);
}

export async function migrate(): Promise<void> {
  await query(`CREATE TABLE IF NOT EXISTS growth_events (
    id uuid PRIMARY KEY, visitor_id uuid NOT NULL, session_id uuid NOT NULL,
    event text NOT NULL, source text NOT NULL, campaign text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS growth_events_created_idx ON growth_events (created_at)`);
  await query(
    `CREATE INDEX IF NOT EXISTS growth_events_visitor_idx ON growth_events (visitor_id, created_at)`,
  );
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
  // Streaks outlive the 30-day run log. Dates alone are enough to prove a
  // consecutive run; do not keep secret seeds or move histories indefinitely.
  await query(`
    CREATE TABLE IF NOT EXISTS daily_completions (
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day     date NOT NULL,
      PRIMARY KEY (user_id, day)
    );
  `);
  await preserveDailyCompletions();
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
       * When the standing best score was FIRST reached. The board's LAST
       * tiebreak — score, then the run's best turn, then this — so matching a
       * score never displaces the player who got there first, and beating your
       * own best does not cost you the ground it won. See ranking.ts.
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
  // Days and weeks taken outright. Added after the table, so existing rows get
  // them at zero and fill in from the server's own count the next time any
  // challenge board is read — see refreshCareerChallengeWins.
  //
  // Deliberately NOT seeded from `profile` the way the four columns above were.
  // That seed existed to preserve standings already on display when the boards
  // moved off the client-synced profile; these two boards have never existed,
  // so there is nothing to preserve, and starting them from a figure a client
  // can inflate would import the exact problem the move was made to escape.
  await query(
    `ALTER TABLE career_stats ADD COLUMN IF NOT EXISTS daily_wins integer NOT NULL DEFAULT 0;`,
  );
  await query(
    `ALTER TABLE career_stats ADD COLUMN IF NOT EXISTS weekly_wins integer NOT NULL DEFAULT 0;`,
  );
  await query(`
    CREATE TABLE IF NOT EXISTS schema_fixes (
      id         text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  // Explicitly requested account grant. Preserve every other profile field and
  // badge, and never add a duplicate if a challenge has already awarded it.
  await applyOnce("tidal-wave-james-2026-10-08", async () => {
    const { rowCount } = await query(
      `UPDATE users
          SET profile = jsonb_set(profile, '{achievements}',
                CASE
                  WHEN jsonb_typeof(profile -> 'achievements') = 'array'
                    THEN CASE
                      WHEN (profile -> 'achievements') @> '["tidal-wave"]'::jsonb
                        THEN profile -> 'achievements'
                      ELSE (profile -> 'achievements') || '["tidal-wave"]'::jsonb
                    END
                  ELSE '["tidal-wave"]'::jsonb
                END),
              updated_at = now()
        WHERE lower(username) = 'james'`,
    );
    // A development database may not have this account. Do not consume the
    // repair until its intended profile exists.
    if (!rowCount) return false;
    console.log("Repair: granted Tidal Wave to James.");
  });
  // Who won each closed day and week, written once and never pruned. The career
  // columns above are counted from this — see refreshCareerChallengeWins for
  // why a count taken from the run tables could not be. One row per period, so
  // it grows by about a row a day.
  await query(`
    CREATE TABLE IF NOT EXISTS challenge_wins (
      kind    text NOT NULL CHECK (kind IN ('daily', 'weekly')),
      period  date NOT NULL,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (kind, period, user_id)
    );
  `);
  await query(
    `CREATE INDEX IF NOT EXISTS challenge_wins_user_idx ON challenge_wins (user_id, kind);`,
  );
  // Keep a year of winner summaries after the scored replay logs expire.
  // The permanent challenge_wins ledger remains the authority on who won.
  await query(`
    CREATE TABLE IF NOT EXISTS weekly_champions (
      week    date PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      score   integer
    );
  `);
  // All-time boards need scores and their tiebreaks forever, but not replay
  // seeds or moves. One compact result per player's day / best week suffices.
  await query(`
    CREATE TABLE IF NOT EXISTS daily_scores (
      user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day       date NOT NULL,
      score     integer NOT NULL,
      best_turn integer NOT NULL,
      PRIMARY KEY (user_id, day)
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS weekly_scores (
      user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      week      date NOT NULL,
      score     integer NOT NULL,
      best_turn integer,
      PRIMARY KEY (user_id, week)
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS daily_scores_rank_idx
    ON daily_scores (score DESC, best_turn DESC, day ASC);`);
  await query(`CREATE INDEX IF NOT EXISTS weekly_scores_rank_idx
    ON weekly_scores (score DESC, best_turn DESC NULLS LAST, week ASC);`);
  // Two earlier repairs, "weekly-wins-open-week-2026-09" and
  // "challenge-wins-tiebreak-2026-09", recounted these columns from the run
  // tables and SET them to the answer. Both rested on a premise that was false
  // when they ran: that nothing had yet been pruned. Runs had been pruned daily
  // since 2026-09-09, so a recount was a count of the last thirty days, and it
  // lowered players who had real wins older than that. The function is gone —
  // a count from the runs is never the career figure — and the repairs are not
  // re-run on a fresh database, where there is nothing to repair.
  //
  // This starts the ledger from whatever runs remain, keeping any stored figure
  // that is higher. It MUST precede the first refresh, which assumes every
  // period already in the ledger has been counted into the columns.
  await applyOnce("challenge-wins-ledger-2026-09", async () => {
    await seedChallengeWinsLedger("daily");
    await seedChallengeWinsLedger("weekly");
  });
  // Daily wins lost before the ledger existed, restored by hand. Nothing on
  // record can say which days they were — the runs are deleted — so this is
  // the player's own account of it: four wins on 2026-09-20, then the next two
  // days won, for six by the time the ledger was seeded.
  //
  // Six PLUS whatever the ledger has banked for them since it started, not a
  // flat six: a day won after the seed has already been added to the column,
  // and a floor of six would swallow it. The seed covered every day before the
  // one it ran on, so "since" is the date of its boot, in the challenge's zone.
  // A floor, never a decrease, so it cannot take away anything counted since.
  await applyOnce("daily-wins-restore-james-2026-09", async () => {
    const { rowCount } = await query(
      `UPDATE career_stats c
          SET daily_wins = GREATEST(c.daily_wins, 6 + (
                SELECT count(*)::int FROM challenge_wins w
                 WHERE w.kind = 'daily' AND w.user_id = c.user_id
                   AND w.period >= (
                     SELECT (applied_at AT TIME ZONE $1)::date
                       FROM schema_fixes WHERE id = 'challenge-wins-ledger-2026-09'))),
              updated_at = now()
        FROM users u
       WHERE u.id = c.user_id AND lower(u.username) = 'james'`,
      [DAILY_ZONE],
    );
    if (!rowCount) {
      console.warn("Repair: no career record for James yet; will try again next boot.");
      return false;
    }
    console.log("Repair: restored James's daily wins.");
  });
  for (const [col, dir] of [
    ["online_wins", "DESC"],
    ["daily_wins", "DESC"],
    ["weekly_wins", "DESC"],
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

/** How long replay logs are kept; compact challenge results never expire. */
export const RETENTION_DAYS = 30;

/**
 * Clear out what is no longer read.
 *
 * Match history and challenge replay logs expire after a month. Challenge
 * scores, streak completion dates and wins are preserved separately forever;
 * weekly winner summaries retain their 52-week window.
 *
 * Expired verification and reset tokens go too. Those were already refused once
 * `expires_at` passed — a link nobody ever clicked simply stayed in the table.
 *
 * Runs on boot, and again daily for a server that stays up (see `startPruning`).
 * Summaries are copied before their replay logs can go. Repeating the sweep
 * cannot duplicate results or lower previously archived best scores.
 */
export async function prune(): Promise<void> {
  // If archiving fails, keep daily runs for a later retry instead of deleting
  // the only remaining evidence of a player's streak.
  let dailyCompletionsSaved = false;
  try {
    await preserveDailyCompletions();
    dailyCompletionsSaved = true;
  } catch (err) {
    console.error("[prune] could not preserve daily completions:", err);
  }
  // Bank what the runs about to be deleted were worth, BEFORE deleting them.
  // A day taken outright is a career figure; the run proving it is a log entry
  // with a month to live, so the win is copied into challenge_wins — which this
  // sweep never touches — before the run can go.
  let weeklyChampionsSaved = false;
  const scoresSaved = { daily: false, weekly: false };
  for (const kind of ["daily", "weekly"] as const) {
    try {
      await preserveChallengeScores(kind);
      scoresSaved[kind] = true;
    } catch (err) {
      console.error(`[prune] could not preserve ${kind} scores:`, err);
    }
    try {
      await refreshCareerChallengeWins(kind);
      if (kind === "weekly") {
        await preserveWeeklyChampions();
        weeklyChampionsSaved = true;
      }
    } catch (err) {
      console.error(`[prune] could not preserve ${kind} results:`, err);
    }
  }
  const cutoff = `${RETENTION_DAYS} days`;
  const jobs: [string, string, unknown[]][] = [
    ["expired sign-in tokens", `DELETE FROM auth_tokens WHERE expires_at < now()`, []],
    [
      "old usage measurements",
      `DELETE FROM growth_events WHERE created_at < now() - $1::interval`,
      [cutoff],
    ],
    ["old matches", `DELETE FROM match_history WHERE played_at < now() - $1::interval`, [cutoff]],
    ["old daily runs", `DELETE FROM daily_runs WHERE day < (now() - $1::interval)::date`, [cutoff]],
    [
      "old weekly runs",
      `DELETE FROM weekly_runs WHERE week < (now() - $1::interval)::date`,
      [cutoff],
    ],
    [
      "old weekly winner summaries",
      `DELETE FROM weekly_champions WHERE week < $1::date - ($2::int * 7)`,
      [weekKey(), WEEKLY_HISTORY_WEEKS],
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
    if (what === "old daily runs" && (!dailyCompletionsSaved || !scoresSaved.daily)) continue;
    if (what === "old weekly runs" && (!weeklyChampionsSaved || !scoresSaved.weekly)) continue;
    if (what === "old weekly winner summaries" && !scoresSaved.weekly) continue;
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
