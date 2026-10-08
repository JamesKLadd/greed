import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WEEKLY_ATTEMPTS_PER_DAY,
  dailyKey,
  dailyPosition,
  getLegalActions,
  runMoveStart,
  weekKey,
  weeklyPosition,
  type RunMove,
} from "@greed/core";
import { getPool, migrate, query, withChallengeTransaction } from "./db.js";
import { playDailyMove, startDailyRun } from "./daily.js";
import { playWeeklyMove, startWeeklyRun } from "./weekly.js";
import { publicGameState } from "./public-state.js";

// Opt in explicitly. All application queries, including migrations, are confined
// to a fresh schema; DATABASE_URL alone must never enable this suite.
describe.skipIf(!process.env.CHALLENGE_TEST_DATABASE_URL)(
  "challenge transactions (Postgres)",
  () => {
    const schema = `challenge_test_${randomUUID().replaceAll("-", "")}`;
    const userId = randomUUID();
    const otherUserId = randomUUID();
    const day = dailyKey();
    const week = weekKey();
    let admin: pg.Pool;

    beforeAll(async () => {
      admin = new pg.Pool({ connectionString: process.env.CHALLENGE_TEST_DATABASE_URL });
      await admin.query(`CREATE SCHEMA ${schema}`);
      const url = new URL(process.env.CHALLENGE_TEST_DATABASE_URL!);
      url.searchParams.set(
        "options",
        `-c search_path=${schema} -c statement_timeout=3000 -c lock_timeout=3000`,
      );
      vi.stubEnv("DATABASE_URL", url.toString());
      await migrate();
      await query("CREATE TABLE test_dealt_seeds (seed bigint NOT NULL)");
      // Make overlapping requests deterministic: without the account lock these
      // pauses let another request read the same position before its write.
      await query(`CREATE FUNCTION delay_challenge_write() RETURNS trigger AS $$
      BEGIN
        IF TG_TABLE_NAME = 'weekly_open' AND TG_OP = 'INSERT' THEN
          INSERT INTO test_dealt_seeds VALUES (NEW.seed);
        END IF;
        PERFORM pg_sleep(0.04);
        RETURN NEW;
      END;
    $$ LANGUAGE plpgsql`);
      for (const table of ["daily_runs", "weekly_open"]) {
        await query(`CREATE TRIGGER delay_write BEFORE INSERT OR UPDATE ON ${table}
        FOR EACH ROW EXECUTE FUNCTION delay_challenge_write()`);
      }
      await query(`CREATE FUNCTION reject_open_delete() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'injected settlement failure'; END;
    $$ LANGUAGE plpgsql`);
    });

    beforeEach(async () => {
      await query("DROP TRIGGER IF EXISTS reject_delete ON weekly_open");
      await query("TRUNCATE users, test_dealt_seeds CASCADE");
      await query(
        `INSERT INTO users (id, email, username, password_hash)
       VALUES ($1, 'first@test.invalid', 'First', 'unused'),
              ($2, 'second@test.invalid', 'Second', 'unused')`,
        [userId, otherUserId],
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

    function completeMoves(seed: number): RunMove[] {
      const moves: RunMove[] = [];
      while (!weeklyPosition(seed, moves).result.complete) {
        const pos = weeklyPosition(seed, moves);
        moves.push(getLegalActions(runMoveStart(pos.state)).canBank ? "BANK" : "ROLL");
      }
      return moves;
    }

    it("grants James Tidal Wave once without changing other profiles or progress", async () => {
      const original = { bestTurn: 3000, dice: "ivory", achievements: ["first-win"] };
      await query("UPDATE users SET username = 'James', profile = $2 WHERE id = $1", [
        userId,
        original,
      ]);
      await migrate();
      const profile = (await query("SELECT profile FROM users WHERE id = $1", [userId])).rows[0]
        .profile;
      expect(profile).toEqual({ ...original, achievements: ["first-win", "tidal-wave"] });
      expect(
        (await query("SELECT profile FROM users WHERE id = $1", [otherUserId])).rows[0],
      ).toEqual({ profile: {} });
      expect(
        (await query("SELECT 1 FROM schema_fixes WHERE id = 'tidal-wave-james-2026-10-08'"))
          .rowCount,
      ).toBe(1);
      await migrate();
      expect(
        (await query("SELECT profile FROM users WHERE id = $1", [userId])).rows[0].profile,
      ).toEqual(profile);
    });

    async function prepareFinalMove(seed = 123456789): Promise<RunMove> {
      const moves = completeMoves(seed);
      const final = moves.pop()!;
      await query("INSERT INTO weekly_open (user_id, week, seed, moves) VALUES ($1, $2, $3, $4)", [
        userId,
        week,
        seed,
        moves.join(","),
      ]);
      return final;
    }

    it("deals one weekly seed when multiple starts arrive together", async () => {
      const views = await Promise.all(
        Array.from({ length: 8 }, () => startWeeklyRun(userId, week)),
      );
      expect(views.every((view) => JSON.stringify(view) === JSON.stringify(views[0]))).toBe(true);
      const dealt = await query("SELECT seed FROM test_dealt_seeds");
      expect(dealt.rows).toHaveLength(1);
      const stored = await query<{ seed: string; moves: string }>(
        "SELECT seed, moves FROM weekly_open WHERE user_id = $1",
        [userId],
      );
      expect(stored.rows[0].moves).toBe("");
      expect(views[0].state).toEqual(
        publicGameState(weeklyPosition(Number(stored.rows[0].seed), []).state),
      );
      expect(views[0].state.config.seed).toBe(0);
      expect(views[0].state.rng).toBe(0);
    });

    it.each(["daily", "weekly"] as const)("preserves both concurrent %s rolls", async (kind) => {
      const isDaily = kind === "daily";
      if (isDaily) await startDailyRun(userId, day);
      else await startWeeklyRun(userId, week);
      const play = () =>
        isDaily ? playDailyMove(userId, "ROLL", day) : playWeeklyMove(userId, "ROLL", week);
      const views = await Promise.all([play(), play()]);
      const table = isDaily ? "daily_runs" : "weekly_open";
      const stored = await query<{ seed: string; moves: string }>(
        `SELECT seed, moves FROM ${table} WHERE user_id = $1`,
        [userId],
      );
      expect(stored.rows[0].moves).toBe("ROLL,ROLL");
      const position = isDaily ? dailyPosition : weeklyPosition;
      const expected = [1, 2].map((n) =>
        publicGameState(position(Number(stored.rows[0].seed), Array(n).fill("ROLL")).state),
      );
      expect(views.map((view) => view.state)).toEqual(expect.arrayContaining(expected));
      for (const view of views) {
        expect(view.state.config.seed).toBe(0);
        expect(view.state.rng).toBe(0);
      }
    });

    it("settles simultaneous final moves once", async () => {
      const final = await prepareFinalMove();
      const replies = await Promise.allSettled([
        playWeeklyMove(userId, final, week),
        playWeeklyMove(userId, final, week),
      ]);
      expect(replies.filter((reply) => reply.status === "fulfilled")).toHaveLength(1);
      expect(replies.filter((reply) => reply.status === "rejected")).toHaveLength(1);
      expect((await query("SELECT attempts FROM weekly_runs")).rows).toEqual([{ attempts: 1 }]);
      expect((await query("SELECT n FROM weekly_attempts")).rows).toEqual([{ n: 1 }]);
      expect((await query("SELECT * FROM weekly_open")).rows).toHaveLength(0);
    });

    it("rolls back the whole settlement if freeing the open slot fails", async () => {
      const final = await prepareFinalMove();
      const before = (await query("SELECT seed, moves FROM weekly_open")).rows;
      await query(`CREATE TRIGGER reject_delete BEFORE DELETE ON weekly_open
      FOR EACH ROW EXECUTE FUNCTION reject_open_delete()`);
      await expect(playWeeklyMove(userId, final, week)).rejects.toThrow(
        "injected settlement failure",
      );
      expect((await query("SELECT * FROM weekly_attempts")).rows).toHaveLength(0);
      expect((await query("SELECT * FROM weekly_runs")).rows).toHaveLength(0);
      expect((await query("SELECT seed, moves FROM weekly_open")).rows).toEqual(before);
      await query("DROP TRIGGER reject_delete ON weekly_open");
      expect((await playWeeklyMove(userId, final, week)).complete).toBe(true);
      expect((await query("SELECT attempts FROM weekly_runs")).rows).toEqual([{ attempts: 1 }]);
    });

    it("commits recovered settlement before refusing an exhausted daily allowance", async () => {
      await query("INSERT INTO weekly_open (user_id, week, seed, moves) VALUES ($1, $2, $3, $4)", [
        userId,
        week,
        123456789,
        completeMoves(123456789).join(","),
      ]);
      await query("INSERT INTO weekly_attempts (user_id, day, n) VALUES ($1, $2, $3)", [
        userId,
        day,
        WEEKLY_ATTEMPTS_PER_DAY - 1,
      ]);
      await expect(startWeeklyRun(userId, week)).rejects.toMatchObject({
        code: "weekly.spentToday",
      });
      expect((await query("SELECT n FROM weekly_attempts")).rows).toEqual([
        { n: WEEKLY_ATTEMPTS_PER_DAY },
      ]);
      expect((await query("SELECT attempts FROM weekly_runs")).rows).toEqual([{ attempts: 1 }]);
      expect((await query("SELECT * FROM weekly_open")).rows).toHaveLength(0);
    });

    it("uses one connection for nested queries and leaves other accounts independent", async () => {
      let entered!: () => void;
      let release!: () => void;
      const ready = new Promise<void>((resolve) => (entered = resolve));
      const gate = new Promise<void>((resolve) => (release = resolve));
      const first = withChallengeTransaction(userId, async () => {
        await query("UPDATE users SET profile = '{\"pending\":true}' WHERE id = $1", [userId]);
        entered();
        await gate;
        throw new Error("rollback requested");
      });
      // Install rejection handling before the deliberate rollback happens.
      const rolledBack = expect(first).rejects.toThrow("rollback requested");
      try {
        await ready;
        expect((await query("SELECT profile FROM users WHERE id = $1", [userId])).rows).toEqual([
          { profile: {} },
        ]);
        await withChallengeTransaction(otherUserId, () =>
          query("UPDATE users SET profile = '{\"committed\":true}' WHERE id = $1", [otherUserId]),
        );
      } finally {
        release();
        await rolledBack;
      }
      expect((await query("SELECT profile FROM users WHERE id = $1", [userId])).rows).toEqual([
        { profile: {} },
      ]);
      expect((await query("SELECT profile FROM users WHERE id = $1", [otherUserId])).rows).toEqual([
        { profile: { committed: true } },
      ]);
    });

    it("coordinates the account lock with an independent database connection", async () => {
      const external = await admin.connect();
      let pending: ReturnType<typeof startWeeklyRun> | undefined;
      try {
        await external.query("BEGIN");
        await external.query("SELECT pg_advisory_xact_lock(1735549285, hashtext($1))", [userId]);
        pending = startWeeklyRun(userId, week);
        // Work for another account finishes while the external connection still
        // owns this account's lock, exactly as a second server process would.
        await startWeeklyRun(otherUserId, week);
        expect(
          (await query("SELECT * FROM weekly_open WHERE user_id = $1", [userId])).rows,
        ).toHaveLength(0);
        expect(
          (await query("SELECT * FROM weekly_open WHERE user_id = $1", [otherUserId])).rows,
        ).toHaveLength(1);
      } finally {
        await external.query("ROLLBACK");
        external.release();
        await pending;
      }
      expect(
        (await query("SELECT * FROM weekly_open WHERE user_id = $1", [userId])).rows,
      ).toHaveLength(1);
    });
  },
);
