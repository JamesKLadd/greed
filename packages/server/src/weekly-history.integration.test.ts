import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { weekKey } from "@greed/core";
import { getPool, migrate, prune, query } from "./db.js";
import { weeklyStatus } from "./weekly.js";
import { preserveWeeklyChampions } from "./weekly-history.js";
import { statsSettled } from "./rollStats.js";

// Explicit test URL only. Migrations and pruning stay in a disposable schema.
describe.skipIf(!process.env.CHALLENGE_TEST_DATABASE_URL)(
  "weekly winner history (Postgres)",
  () => {
    const schema = `weekly_history_test_${randomUUID().replaceAll("-", "")}`;
    const winner = randomUUID();
    const rival = randomUUID();
    const week = weekKey();
    let admin: pg.Pool;

    beforeAll(async () => {
      admin = new pg.Pool({ connectionString: process.env.CHALLENGE_TEST_DATABASE_URL });
      await admin.query(`CREATE SCHEMA ${schema}`);
      const url = new URL(process.env.CHALLENGE_TEST_DATABASE_URL!);
      url.searchParams.set("options", `-c search_path=${schema} -c statement_timeout=3000`);
      vi.stubEnv("DATABASE_URL", url.toString());
      await migrate();
      await query(`CREATE FUNCTION reject_weekly_archive() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'injected archive failure'; END;
    $$ LANGUAGE plpgsql`);
    });

    beforeEach(async () => {
      await query("DROP TRIGGER IF EXISTS reject_archive ON weekly_champions");
      // A finished run files its statistics in the background; let it land first.
      await statsSettled();
      await query("TRUNCATE users CASCADE");
      await query(
        `INSERT INTO users (id, email, username, password_hash)
       VALUES ($1, 'winner@test.invalid', 'Winner', 'unused'),
              ($2, 'rival@test.invalid', 'Rival', 'unused')`,
        [winner, rival],
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

    function ago(n: number) {
      const day = new Date(`${week}T00:00:00Z`);
      day.setUTCDate(day.getUTCDate() - n * 7);
      return day.toISOString().slice(0, 10);
    }

    async function run(user: string, weeksAgo: number, score = 3000, bestTurn = 1000) {
      await query(
        `INSERT INTO weekly_runs
         (user_id, week, score, turns, banks, busts, super_busts, hot_dice, best_turn, seed, moves)
       VALUES ($1, $2, $3, 10, 8, 2, 0, 1, $4, 0, '')`,
        [user, ago(weeksAgo), score, bestTurn],
      );
    }

    it("archives exactly 52 closed weeks, retaining names and scores after replay cleanup", async () => {
      for (let n = 0; n <= 60; n++) await run(winner, n, 3000 + n);
      await migrate();
      const status = await weeklyStatus(rival, week);
      expect(status.champions).toHaveLength(52);
      expect(status.champions[0]).toMatchObject({ week: ago(1), username: "Winner", score: 3001 });
      expect(status.champions[51]).toMatchObject({ week: ago(52), score: 3052 });
      expect(status.champions.some((c) => c.week === week || c.week === ago(53))).toBe(false);
      expect((await query("SELECT count(*)::int AS n FROM weekly_runs")).rows[0].n).toBeLessThan(
        10,
      );
      expect((await query("SELECT count(*)::int AS n FROM weekly_champions")).rows[0].n).toBe(52);
      await migrate();
      expect((await weeklyStatus(rival, week)).champions).toEqual(status.champions);
      expect(
        (await query("SELECT weekly_wins FROM career_stats WHERE user_id = $1", [winner])).rows[0]
          .weekly_wins,
      ).toBe(60);
    });

    it("recovers old ledger winners with an unknown score rather than a made-up result", async () => {
      await query("INSERT INTO challenge_wins (kind, period, user_id) VALUES ('weekly', $1, $2)", [
        ago(20),
        winner,
      ]);
      await migrate();
      const status = await weeklyStatus(rival, week);
      expect(status.champion).toMatchObject({ week: ago(20), username: "Winner", score: null });
      expect(status.champion).not.toHaveProperty("userId");
      await run(winner, 20, 4200);
      await preserveWeeklyChampions();
      expect((await weeklyStatus(rival, week)).champion?.score).toBe(4200);
    });

    it("uses the settled winner and keeps the captured score even if old rankings change", async () => {
      await run(winner, 1, 3000, 1500);
      await run(rival, 1, 3000, 1200);
      expect((await weeklyStatus(rival, week)).champion?.username).toBe("Winner");
      await query("UPDATE weekly_runs SET score = 9999 WHERE user_id = $1", [rival]);
      await query("UPDATE weekly_runs SET score = 2000 WHERE user_id = $1", [winner]);
      expect((await weeklyStatus(rival, week)).champion).toMatchObject({
        username: "Winner",
        score: 3000,
      });
      await query("DELETE FROM weekly_runs");
      expect((await weeklyStatus(rival, week)).champion).toMatchObject({
        username: "Winner",
        score: 3000,
      });
    });

    it("expires summaries beyond the 52-week window without removing lifetime wins", async () => {
      await query(
        `INSERT INTO challenge_wins (kind, period, user_id)
       VALUES ('weekly', $1, $3), ('weekly', $2, $3)`,
        [ago(52), ago(53), winner],
      );
      await query("INSERT INTO weekly_champions (week, user_id, score) VALUES ($1, $2, 3300)", [
        ago(53),
        winner,
      ]);
      await prune();
      expect((await weeklyStatus(rival, week)).champions.map((c) => c.week)).toEqual([ago(52)]);
      expect((await query("SELECT count(*)::int AS n FROM weekly_champions")).rows[0].n).toBe(1);
      expect(
        (await query("SELECT count(*)::int AS n FROM challenge_wins WHERE kind = 'weekly'")).rows[0]
          .n,
      ).toBe(2);
    });

    it("keeps scored runs if archiving fails, then preserves their results on retry", async () => {
      await run(winner, 10, 4100);
      await query(`CREATE TRIGGER reject_archive BEFORE INSERT ON weekly_champions
      FOR EACH ROW EXECUTE FUNCTION reject_weekly_archive()`);
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        await prune();
        expect((await query("SELECT count(*)::int AS n FROM weekly_runs")).rows[0].n).toBe(1);
        expect(log).toHaveBeenCalled();
      } finally {
        log.mockRestore();
        await query("DROP TRIGGER reject_archive ON weekly_champions");
      }
      await prune();
      expect((await query("SELECT count(*)::int AS n FROM weekly_runs")).rows[0].n).toBe(0);
      expect((await weeklyStatus(rival, week)).champion).toMatchObject({
        username: "Winner",
        score: 4100,
      });
    });

    it("shows no champion for an unfinished or scoreless week", async () => {
      await run(winner, 0);
      await run(rival, 1, 0);
      await prune();
      expect((await weeklyStatus(rival, week)).champions).toEqual([]);
    });
  },
);
