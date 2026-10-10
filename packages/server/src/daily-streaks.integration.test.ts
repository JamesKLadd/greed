import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dailyKey,
  dailyPosition,
  getLegalActions,
  dailyMoveStart,
  type DailyMove,
} from "@greed/core";
import { getPool, migrate, prune, query } from "./db.js";
import { dailyStatus, playDailyMove, startDailyRun } from "./daily.js";
import {
  currentDailyStreak,
  preserveDailyCompletions,
  recordDailyCompletion,
} from "./daily-streaks.js";

// Use only an explicit test URL and a disposable schema, never live account data.
describe.skipIf(!process.env.CHALLENGE_TEST_DATABASE_URL)(
  "daily streak retention (Postgres)",
  () => {
    const schema = `daily_streak_test_${randomUUID().replaceAll("-", "")}`;
    const userId = randomUUID();
    const otherId = randomUUID();
    const today = dailyKey();
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
      await query("DROP TRIGGER IF EXISTS reject_completion ON daily_completions");
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

    async function history(days: number, complete = true, user = userId, end = today) {
      await query(
        `INSERT INTO daily_runs
         (user_id, day, score, turns, banks, busts, super_busts, hot_dice, best_turn, moves, complete)
       SELECT $1, $2::date - n, 0, 10, 0, 10, 0, 0, 0, '', $4
         FROM generate_series(0, $3::int - 1) n`,
        [user, end, days, complete],
      );
    }

    it("backfills existing completed dates on boot, surviving repeated migration and cleanup", async () => {
      await history(75);
      await history(75, false, otherId);
      await migrate();
      expect(await currentDailyStreak(userId, today)).toBe(75);
      expect(await currentDailyStreak(otherId, today)).toBe(0);
      expect(
        (await query("SELECT count(*)::int AS n FROM daily_runs WHERE user_id = $1", [userId]))
          .rows[0].n,
      ).toBeLessThan(75);
      await migrate();
      await prune();
      expect((await dailyStatus(userId, today)).streak).toBe(75);
      expect((await query("SELECT count(*)::int AS n FROM daily_completions", [])).rows[0].n).toBe(
        75,
      );
    });

    it("continues past 31 and 400 days without retaining replay records", async () => {
      const yesterday = new Date(`${today}T00:00:00Z`);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      await history(450, true, userId, yesterday.toISOString().slice(0, 10));
      await preserveDailyCompletions();
      await prune();
      expect(await currentDailyStreak(userId, today)).toBe(0); // today's run not finished
      await recordDailyCompletion(userId, today);
      await recordDailyCompletion(userId, today); // retry does not count twice
      expect(await currentDailyStreak(userId, today)).toBe(451);
      expect((await query("SELECT count(*)::int AS n FROM daily_completions")).rows[0].n).toBe(451);
      await prune();
      expect(await currentDailyStreak(userId, today)).toBe(451);
    });

    it("stops at missed or unfinished days and ignores other players and future dates", async () => {
      await history(40);
      await query(
        "UPDATE daily_runs SET complete = false WHERE user_id = $1 AND day = $2::date - 4",
        [userId, today],
      );
      await history(1, true, otherId);
      await preserveDailyCompletions();
      await recordDailyCompletion(otherId, today);
      await recordDailyCompletion(userId, "2099-01-01");
      expect(await currentDailyStreak(userId, today)).toBe(4);
      await query("DELETE FROM daily_completions WHERE user_id = $1 AND day = $2::date - 1", [
        userId,
        today,
      ]);
      expect(await currentDailyStreak(userId, today)).toBe(1);
      await query("DELETE FROM daily_completions WHERE user_id = $1 AND day = $2::date", [
        userId,
        today,
      ]);
      expect(await currentDailyStreak(userId, today)).toBe(0);
    });

    it("counts calendar days across daylight-saving, leap days and year boundaries", async () => {
      for (const end of ["2026-03-10", "2026-11-03", "2024-03-02", "2026-01-03"]) {
        await history(8, true, userId, end);
        await preserveDailyCompletions();
        expect(await currentDailyStreak(userId, end)).toBe(8);
      }
    });

    it("keeps daily runs when archiving fails, then archives them before a later cleanup", async () => {
      await history(60);
      await query(`CREATE TRIGGER reject_completion BEFORE INSERT ON daily_completions
      FOR EACH ROW EXECUTE FUNCTION reject_completion()`);
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        await prune();
        expect((await query("SELECT count(*)::int AS n FROM daily_runs")).rows[0].n).toBe(60);
        expect(log).toHaveBeenCalled();
      } finally {
        log.mockRestore();
        await query("DROP TRIGGER reject_completion ON daily_completions");
      }
      await prune();
      expect(await currentDailyStreak(userId, today)).toBe(60);
      expect((await query("SELECT count(*)::int AS n FROM daily_runs")).rows[0].n).toBeLessThan(60);
    });

    it("commits the completion with the final move and rolls both back if recording fails", async () => {
      const seed = 123456789;
      const moves: DailyMove[] = [];
      while (!dailyPosition(seed, moves).result.complete) {
        const pos = dailyPosition(seed, moves);
        moves.push(getLegalActions(dailyMoveStart(pos.state)).canBank ? "BANK" : "ROLL");
      }
      const final = moves.pop()!;
      await startDailyRun(userId, today);
      await query("UPDATE daily_runs SET seed = $2, moves = $3 WHERE user_id = $1", [
        userId,
        seed,
        moves.join(","),
      ]);
      await query(`CREATE TRIGGER reject_completion BEFORE INSERT ON daily_completions
      FOR EACH ROW EXECUTE FUNCTION reject_completion()`);
      await expect(playDailyMove(userId, final, today)).rejects.toThrow(
        "injected completion failure",
      );
      expect(
        (await query("SELECT complete, moves FROM daily_runs WHERE user_id = $1", [userId])).rows,
      ).toEqual([{ complete: false, moves: moves.join(",") }]);
      expect(await currentDailyStreak(userId, today)).toBe(0);
      await query("DROP TRIGGER reject_completion ON daily_completions");
      expect((await playDailyMove(userId, final, today)).complete).toBe(true);
      expect((await dailyStatus(userId, today)).streak).toBe(1);
      await expect(playDailyMove(userId, final, today)).rejects.toMatchObject({
        code: "daily.alreadyPlayed",
      });
      expect((await query("SELECT count(*)::int AS n FROM daily_completions")).rows[0].n).toBe(1);
    });
  },
);
