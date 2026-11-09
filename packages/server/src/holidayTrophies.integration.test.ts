import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getPool, migrate, query } from "./db.js";
import { getAccount, saveProfile } from "./accounts.js";
import { refreshCareerChallengeWins } from "./leaderboards.js";

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

  it("hands out Halloween's trophy for the extra week after Halloween 2026 too", async () => {
    await win("weekly", "2026-11-02");
    const account = await getAccount(winner);
    expect(account!.profile.achievements).toContain("halloween-champion");
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

  it("lays a gifted cosmetic over the profile, and never takes one from a client", async () => {
    await query(`INSERT INTO cosmetic_gifts (user_id, cosmetic) VALUES ($1, 'gold-pumpkin')`, [
      winner,
    ]);
    const account = await getAccount(winner);
    expect(account!.profile.gifts).toEqual(["gold-pumpkin"]);
    // The dice, not the badge: a gift claims no win.
    expect(account!.profile.achievements).not.toContain("halloween-champion");
    const saved = await saveProfile(winner, { gifts: ["gold-ornament"] });
    expect(saved.gifts).toEqual(["gold-pumpkin"]);
  });

  it("gives the golden pumpkin to the account named Jimmy, once", async () => {
    const jimmy = randomUUID();
    await query(
      `INSERT INTO users (id, email, username, password_hash)
       VALUES ($1, 'jimmy@test.invalid', 'Jimmy', 'unused')`,
      [jimmy],
    );
    // The boot that added it found no Jimmy in this empty schema and was
    // written down regardless; run it again as a deploy would with him here.
    await query(`DELETE FROM schema_fixes WHERE id = 'gold-pumpkin-jimmy-2026-11'`);
    await migrate();
    expect((await getAccount(jimmy))!.profile.gifts).toEqual(["gold-pumpkin"]);
    expect((await getAccount(winner))!.profile.gifts).toEqual([]);
    // Not again: a later boot leaves the ledger as it is.
    await query(`DELETE FROM cosmetic_gifts`);
    await migrate();
    expect((await getAccount(jimmy))!.profile.gifts).toEqual([]);
  });

  describe("holiday runners-up", () => {
    const second = randomUUID();
    const third = randomUUID();
    beforeEach(async () => {
      await query("TRUNCATE holiday_runner_ups, weekly_runs, daily_runs");
      await query(
        `INSERT INTO users (id, email, username, password_hash)
         VALUES ($1, 'second@test.invalid', 'Second', 'unused'),
                ($2, 'third@test.invalid', 'Third', 'unused')`,
        [second, third],
      );
    });
    const weekly = (user: string, week: string, score: number) =>
      query(
        `INSERT INTO weekly_runs
           (user_id, week, score, turns, banks, busts, super_busts, hot_dice, best_turn, seed, moves)
         VALUES ($1, $2, $3, 10, 8, 2, 0, 1, 500, 0, '')`,
        [user, week, score],
      );
    const daily = (user: string, day: string, score: number) =>
      query(
        `INSERT INTO daily_runs
           (user_id, day, score, turns, banks, busts, super_busts, hot_dice, best_turn, moves, complete)
         VALUES ($1, $2, $3, 10, 8, 2, 0, 1, 500, '', true)`,
        [user, day, score],
      );
    const giftsOf = async (user: string) => (await getAccount(user))!.profile.gifts;

    it("gives second place on the week the gold dice when one player swept the holiday", async () => {
      await daily(winner, "2026-10-31", 4000);
      await daily(second, "2026-10-31", 3000);
      await weekly(winner, "2026-10-26", 5000);
      await weekly(second, "2026-10-26", 4500);
      await weekly(third, "2026-10-26", 4000);
      await refreshCareerChallengeWins("weekly");
      expect(await giftsOf(second)).toEqual(["gold-pumpkin"]);
      expect(await giftsOf(third)).toEqual([]);
      // The sweeper has the trophy, not a gift; second has the dice, not the badge.
      expect(await giftsOf(winner)).toEqual([]);
      expect((await getAccount(second))!.profile.achievements).not.toContain("halloween-champion");
      // The extra week after Halloween 2026 goes with the same Daily.
      await weekly(winner, "2026-11-02", 5000);
      await weekly(third, "2026-11-02", 4000);
      await refreshCareerChallengeWins("weekly");
      expect(await giftsOf(third)).toEqual(["gold-pumpkin"]);
    });

    it("gives nothing when the Daily and the Weekly went to different players", async () => {
      await daily(third, "2026-10-31", 4000);
      await weekly(winner, "2026-10-26", 5000);
      await weekly(second, "2026-10-26", 4500);
      await refreshCareerChallengeWins("weekly");
      expect(await giftsOf(second)).toEqual([]);
      const { rows } = await query(`SELECT user_id FROM holiday_runner_ups`);
      expect(rows).toEqual([{ user_id: null }]);
    });

    it("skips a runner-up who has won the holiday before, and decides a week once", async () => {
      await win("daily", "2025-10-31");
      await query(`UPDATE challenge_wins SET user_id = $1 WHERE period = '2025-10-31'`, [second]);
      await daily(winner, "2026-10-31", 4000);
      await weekly(winner, "2026-10-26", 5000);
      await weekly(second, "2026-10-26", 4500);
      await weekly(third, "2026-10-26", 4000);
      await refreshCareerChallengeWins("weekly");
      expect(await giftsOf(second)).toEqual([]);
      // Third does not inherit it, then or on any later look.
      await refreshCareerChallengeWins("weekly");
      expect(await giftsOf(third)).toEqual([]);
    });
  });

  it("merges advent doors by the higher count per year", async () => {
    await saveProfile(winner, { advent: { "2026": 7 } });
    await saveProfile(winner, { advent: { "2026": 3, "2025": 24 } });
    const after = await saveProfile(winner, { advent: { "2026": 9, junk: 4 } as never });
    expect(after.advent).toEqual({ "2026": 9, "2025": 24 });
  });
});
