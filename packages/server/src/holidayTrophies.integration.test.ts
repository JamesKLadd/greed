import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getPool, migrate, query } from "./db.js";
import { getAccount, saveProfile } from "./accounts.js";

// Explicit opt-in and a disposable schema: never touch a live application's data.
describe.skipIf(!process.env.CHALLENGE_TEST_DATABASE_URL)("holiday trophies (Postgres)", () => {
  const schema = `holiday_trophies_test_${randomUUID().replaceAll("-", "")}`;
  const winner = randomUUID();
  let admin: pg.Pool;

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: process.env.CHALLENGE_TEST_DATABASE_URL });
    await admin.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(process.env.CHALLENGE_TEST_DATABASE_URL!);
    url.searchParams.set("options", `-c search_path=${schema} -c statement_timeout=5000`);
    vi.stubEnv("DATABASE_URL", url.toString());
    await migrate();
  });

  beforeEach(async () => {
    await query("TRUNCATE users CASCADE");
    await query(
      `INSERT INTO users (id, email, username, password_hash)
       VALUES ($1, 'winner@test.invalid', 'Winner', 'unused')`,
      [winner],
    );
  });

  afterAll(async () => {
    await getPool().end();
    vi.unstubAllEnvs();
    if (admin) {
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    }
  });

  const win = (kind: "daily" | "weekly", period: string) =>
    query(`INSERT INTO challenge_wins (kind, period, user_id) VALUES ($1, $2::date, $3)`, [
      kind,
      period,
      winner,
    ]);

  it("hands out a trophy for a holiday's Daily or the Weekly around it, and nothing else", async () => {
    await win("daily", "2026-10-31"); // Halloween's Daily
    await win("weekly", "2026-12-21"); // the week holding Christmas Day
    await win("daily", "2026-07-04"); // summer plays on the Fourth
    await win("daily", "2026-10-30"); // an ordinary day
    await win("weekly", "2026-10-19"); // an ordinary week
    const account = await getAccount(winner);
    const trophies = account!.profile.achievements.filter((a) => a.endsWith("-champion"));
    expect(trophies.sort()).toEqual([
      "christmas-champion",
      "halloween-champion",
      "summer-champion",
    ]);
  });

  it("keeps a trophy through a sync that does not mention it, and never grants one asked for", async () => {
    await win("daily", "2027-02-14");
    const saved = await saveProfile(winner, { achievements: ["first-win"] });
    expect(saved.achievements).toContain("valentines-champion");
    expect(saved.achievements).toContain("first-win");
    // Stored, too, not only overlaid on the way out.
    const { rows } = await query<{ profile: { achievements: string[] } }>(
      `SELECT profile FROM users WHERE id = $1`,
      [winner],
    );
    expect(rows[0].profile.achievements).toContain("valentines-champion");
  });

  it("merges advent doors by the higher count per year", async () => {
    await saveProfile(winner, { advent: { "2026": 7 } });
    await saveProfile(winner, { advent: { "2026": 3, "2025": 24 } });
    const after = await saveProfile(winner, { advent: { "2026": 9, junk: 4 } as never });
    expect(after.advent).toEqual({ "2026": 9, "2025": 24 });
  });
});
