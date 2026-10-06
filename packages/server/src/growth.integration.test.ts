import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { GrowthEvent } from "@greed/protocol";
import { readGrowthFunnels } from "./growth.js";
import type { query } from "./db.js";

// Explicit test URL only; every query uses a disposable schema, never live tables.
describe.skipIf(!process.env.GROWTH_TEST_DATABASE_URL)("ordered growth paths (Postgres)", () => {
  const schema = `growth_test_${randomUUID().replaceAll("-", "")}`;
  let admin: pg.Pool;
  let pool: pg.Pool;
  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: process.env.GROWTH_TEST_DATABASE_URL });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new pg.Pool({
      connectionString: process.env.GROWTH_TEST_DATABASE_URL,
      options: `-c search_path=${schema}`,
    });
    await pool.query(`CREATE TABLE growth_events (
      id uuid PRIMARY KEY, visitor_id uuid, session_id uuid, event text,
      source text, campaign text, created_at timestamptz
    )`);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE growth_events");
  });
  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    }
  });
  const report = () => readGrowthFunnels(pool.query.bind(pool) as typeof query);
  async function seed(
    events: readonly [GrowthEvent, number][],
    options: {
      visitor?: string;
      session?: string;
      source?: string;
      campaign?: string;
      days?: number;
    } = {},
  ) {
    const visitor = options.visitor ?? randomUUID();
    const session = options.session ?? randomUUID();
    await pool.query(
      `INSERT INTO growth_events
      SELECT id, visitor, session, event, source, campaign,
        now() - interval '1 hour' - $2::int * interval '1 day' + seconds * interval '1 second'
      FROM jsonb_to_recordset($1::jsonb) AS r(
        id uuid, visitor uuid, session uuid, event text, source text, campaign text, seconds int
      )`,
      [
        JSON.stringify(
          events.map(([event, seconds]) => ({
            id: randomUUID(),
            visitor,
            session,
            event,
            seconds,
            source: options.source ?? "landing",
            campaign: options.campaign ?? "daily",
          })),
        ),
        options.days ?? 0,
      ],
    );
    return { visitor, session };
  }
  const counts = (rows: Awaited<ReturnType<typeof report>>, id: string) =>
    rows.find((r) => r.id === id)!.steps.map((s) => s.sessions);

  it("counts a complete path once and attributes it to its first step", async () => {
    const identity = await seed(
      [
        ["landing_viewed", 0],
        ["landing_practice_selected", 1],
        ["practice_started", 2],
        ["practice_completed", 3],
        ["practice_daily_selected", 4],
        ["daily_signin_opened", 5],
        ["daily_signin_completed", 6],
        ["daily_started", 7],
        ["daily_completed", 8],
      ],
      { campaign: "bank_or_roll" },
    );
    await seed(
      [
        ["practice_started", 10],
        ["practice_completed", 11],
        ["daily_started", 12],
        ["daily_completed", 13],
      ],
      { ...identity, campaign: "bust" },
    );
    const rows = await report();
    expect(counts(rows, "welcome")).toEqual([1, 1, 1, 1]);
    expect(counts(rows, "practice_daily")).toEqual([1, 1, 1, 1, 1]);
    expect(counts(rows, "daily_signin")).toEqual([1, 1, 1]);
    expect(rows.find((r) => r.id === "practice_daily")!.channels).toEqual([
      { source: "landing", campaign: "bank_or_roll", sessions: 1, completed: 1 },
    ]);
  });
  it("rejects missing or reversed steps but accepts a later valid repeat", async () => {
    await seed([
      ["practice_completed", -1],
      ["practice_started", 0],
      ["practice_daily_selected", 2],
      ["daily_started", 3],
      ["daily_completed", 4],
    ]);
    await seed([
      ["practice_started", 0],
      ["practice_completed", 1],
      ["daily_started", 2],
      ["practice_daily_selected", 3],
      ["daily_started", 4],
      ["daily_completed", 5],
    ]);
    expect(counts(await report(), "practice_daily")).toEqual([2, 1, 1, 1, 1]);
  });
  it("never stitches visitors or different sessions together", async () => {
    const identity = await seed([
      ["practice_started", 0],
      ["practice_completed", 1],
    ]);
    await seed(
      [
        ["practice_daily_selected", 2],
        ["daily_started", 3],
        ["daily_completed", 4],
      ],
      { visitor: identity.visitor },
    );
    const room = await seed([["room_invite_opened", 0]]);
    await seed(
      [
        ["room_invite_joined", 1],
        ["online_completed", 2],
      ],
      { session: room.session },
    );
    const rows = await report();
    expect(counts(rows, "practice_daily")).toEqual([1, 1, 0, 0, 0]);
    expect(counts(rows, "room_invite")).toEqual([1, 0, 0]);
  });
  it("handles batch timestamps and joins repeated after an earlier unrelated join", async () => {
    await seed([
      ["landing_viewed", 0],
      ["landing_daily_selected", 0],
      ["daily_started", 0],
      ["daily_completed", 0],
    ]);
    await seed([
      ["room_invite_joined", -1],
      ["room_invite_opened", 0],
      ["room_invite_joined", 1],
      ["online_completed", 2],
    ]);
    const rows = await report();
    expect(counts(rows, "welcome_daily")).toEqual([1, 1, 1, 1]);
    expect(counts(rows, "room_invite")).toEqual([1, 1, 1]);
  });
  it("returns zeroes for empty paths and excludes entries older than 30 days", async () => {
    const identity = await seed([["daily_signin_opened", 0]], { days: 31 });
    await seed(
      [
        ["daily_signin_completed", 0],
        ["daily_started", 1],
      ],
      identity,
    );
    for (const row of await report()) {
      expect(row.steps.every((step) => step.sessions === 0)).toBe(true);
      expect(row.channels).toEqual([]);
    }
  });
  it("compares campaign cohorts with their own completion denominators", async () => {
    await seed(
      [
        ["landing_viewed", 0],
        ["landing_daily_selected", 1],
        ["daily_started", 2],
        ["daily_completed", 3],
      ],
      { campaign: "daily" },
    );
    await seed([["landing_viewed", 0]], { campaign: "daily" });
    await seed(
      [
        ["landing_viewed", 0],
        ["landing_daily_selected", 1],
      ],
      { campaign: "friends" },
    );
    const funnel = (await report()).find((r) => r.id === "welcome_daily")!;
    expect(funnel.steps.map((s) => s.sessions)).toEqual([3, 2, 1, 1]);
    expect(funnel.channels).toEqual([
      { source: "landing", campaign: "daily", sessions: 2, completed: 1 },
      { source: "landing", campaign: "friends", sessions: 1, completed: 0 },
    ]);
  });
});
