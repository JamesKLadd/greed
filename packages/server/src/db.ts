/**
 * Postgres access for accounts. A single pooled connection (Neon serverless
 * Postgres in production) shared by the auth/accounts logic. Everything here is a
 * no-op when DATABASE_URL is unset, so the server still runs for guest online
 * play without a database configured.
 */

import pg from "pg";
import type { QueryResult, QueryResultRow } from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;

/** True when a database is configured (accounts features are available). */
export function accountsEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function makePool(): pg.Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  // Neon (and most managed Postgres) require TLS. We don't ship a CA bundle, so
  // accept the provider's certificate without local verification.
  const ssl = /sslmode=require|neon\.tech|render\.com|amazonaws\.com/.test(connectionString)
    ? { rejectUnauthorized: false }
    : undefined;
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
  // Leaderboard reads are "top N for a day", so order within the day.
  await query(
    `CREATE INDEX IF NOT EXISTS daily_runs_day_score_idx ON daily_runs (day, score DESC);`,
  );
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

  // The tiebreak shootout: an extra turn played only when a run ties another
  // player's score. Added as columns rather than a table because it belongs to
  // exactly one run and is read on every leaderboard query.
  await query(
    `ALTER TABLE daily_runs ADD COLUMN IF NOT EXISTS tiebreak integer NOT NULL DEFAULT 0;`,
  );
  await query(`ALTER TABLE daily_runs ADD COLUMN IF NOT EXISTS tiebreak_moves text;`);
  // Ranking is (score, then tiebreak), so the index has to agree with the sort.
  await query(
    `CREATE INDEX IF NOT EXISTS daily_runs_day_rank_idx
       ON daily_runs (day, score DESC, tiebreak DESC);`,
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
}
