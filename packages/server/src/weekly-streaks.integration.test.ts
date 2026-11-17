import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { weekKey } from "@greed/core";
import { getPool, migrate, prune, query } from "./db.js";
import { weeklyStatus } from "./weekly.js";
import {
  currentWeeklyStreak,
  preserveWeeklyCompletions,
  recordWeeklyCompletion,
} from "./weekly-streaks.js";
import { statsSettled } from "./rollStats.js";

// Use only an explicit test URL and a disposable schema, never live account data.
describe.skipIf(!process.env.CHALLENGE_TEST_DATABASE_URL)(
  "weekly streak retention (Postgres)",
  () => {
    const schema = `weekly_streak_test_${randomUUID().replaceAll("-", "")}`;
    const userId = randomUUID();
    const otherId = randomUUID();
    const thisWeek = weekKey();
    let admin: pg.Pool;

    beforeAll(async () => {
      admin = new pg.Pool({ connectionString: process.env.CHALLENGE_TEST_DATABASE_URL });
      await admin.query(`CREATE SCHEMA ${schema}`);
      const url = new URL(process.env.CHALLENGE_TEST_DATABASE_URL!);
      url.searchParams.set("options", `-c search_path=${schema} -c statement_timeout=3000`);
      vi.stubEnv("DATABASE_URL", url.toString());
      await migrate();
      await query(`CREATE FUNCTION reject_completion() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'injected completion failure'; END;
    $$ LANGUAGE plpgsql`);
    });

    beforeEach(async () => {
      await query("DROP TRIGGER IF EXISTS reject_completion ON weekly_completions");
      await statsSettled();
      await query("TRUNCATE users CASCADE");
      await query(
        `INSERT INTO users (id, email, username, password_hash)
         VALUES ($1, 'streak@test.invalid', 'Streak', 'unused'),
                ($2, 'other@test.invalid', 'Other', 'unused')`,
        [userId, otherId],
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

    /** `weeks` consecutive finished weeks, ending with `end`. */
    async function history(weeks: number, user = userId, end = thisWeek) {
      await query(
        `INSERT INTO weekly_runs
           (user_id, week, score, turns, banks, busts, super_busts, hot_dice, best_turn, seed, moves)
         SELECT $1, $2::date - 7 * n, 1000, 10, 8, 2, 0, 1, 500, 0, ''
           FROM generate_series(0, $3::int - 1) n`,
        [user, end, weeks],
      );
    }

    it("goes past five weeks, and keeps counting once the runs behind it are cleared", async () => {
      await history(12);
      await migrate();
      await prune();
      // The runs older than a month are gone; the streak is not.
      expect(
        (await query("SELECT count(*)::int AS n FROM weekly_runs WHERE user_id = $1", [userId]))
          .rows[0].n,
      ).toBeLessThan(12);
      expect((await weeklyStatus(userId, thisWeek)).streak).toBe(12);
      expect(await currentWeeklyStreak(otherId, thisWeek)).toBe(0);
    });

    it("brings back a streak the old count cut short, from the all-time scores", async () => {
      // Runs already pruned under the old rule; only their kept scores remain.
      await query(
        `INSERT INTO weekly_scores (user_id, week, score, best_turn)
         SELECT $1, $2::date - 7 * n, 1000, 500 FROM generate_series(4, 9) n`,
        [userId, thisWeek],
      );
      await history(4);
      await preserveWeeklyCompletions();
      expect(await currentWeeklyStreak(userId, thisWeek)).toBe(10);
    });

    it("stops at a missed week, and does not count this week until it is played", async () => {
      const lastWeek = new Date(`${thisWeek}T00:00:00Z`);
      lastWeek.setUTCDate(lastWeek.getUTCDate() - 7);
      const last = lastWeek.toISOString().slice(0, 10);
      await history(6, userId, last);
      await preserveWeeklyCompletions();
      expect(await currentWeeklyStreak(userId, thisWeek)).toBe(0);
      await recordWeeklyCompletion(userId, thisWeek);
      await recordWeeklyCompletion(userId, thisWeek); // a retry does not count twice
      expect(await currentWeeklyStreak(userId, thisWeek)).toBe(7);
      await query(`DELETE FROM weekly_completions WHERE user_id = $1 AND week = $2::date - 14`, [
        userId,
        thisWeek,
      ]);
      expect(await currentWeeklyStreak(userId, thisWeek)).toBe(2);
    });

    it("keeps the weekly runs when the record cannot be written, and writes it next time", async () => {
      await history(8);
      await query(`CREATE TRIGGER reject_completion BEFORE INSERT ON weekly_completions
        FOR EACH ROW EXECUTE FUNCTION reject_completion()`);
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        await prune();
        expect((await query("SELECT count(*)::int AS n FROM weekly_runs")).rows[0].n).toBe(8);
        expect(log).toHaveBeenCalled();
      } finally {
        log.mockRestore();
        await query("DROP TRIGGER reject_completion ON weekly_completions");
      }
      await prune();
      expect(await currentWeeklyStreak(userId, thisWeek)).toBe(8);
      expect((await query("SELECT count(*)::int AS n FROM weekly_runs")).rows[0].n).toBeLessThan(8);
    });
  },
);
