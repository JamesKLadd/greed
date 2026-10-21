import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dailyKey,
  getLegalActions,
  runMoveStart,
  weekKey,
  weeklyPosition,
  type RunMove,
} from "@greed/core";
import { getPool, migrate, prune, query } from "./db.js";
import { dailyBest, weeklyBest } from "./leaderboards.js";
import { playDailyMove } from "./daily.js";
import { playWeeklyMove, weeklyStatus } from "./weekly.js";
import { preserveChallengeScores, recordChallengeScore } from "./challenge-scores.js";
import { statsSettled } from "./rollStats.js";

// Explicit opt-in and a disposable schema: never touch a live application's data.
describe.skipIf(!process.env.CHALLENGE_TEST_DATABASE_URL)(
  "all-time challenge scores (Postgres)",
  () => {
    const schema = `challenge_scores_test_${randomUUID().replaceAll("-", "")}`;
    const winner = randomUUID();
    const rival = randomUUID();
    const day = dailyKey();
    const week = weekKey();
    let admin: pg.Pool;

    beforeAll(async () => {
      admin = new pg.Pool({ connectionString: process.env.CHALLENGE_TEST_DATABASE_URL });
      await admin.query(`CREATE SCHEMA ${schema}`);
      const url = new URL(process.env.CHALLENGE_TEST_DATABASE_URL!);
      url.searchParams.set("options", `-c search_path=${schema} -c statement_timeout=3000`);
      vi.stubEnv("DATABASE_URL", url.toString());
      await migrate();
      await query(`CREATE FUNCTION reject_score_archive() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'injected score archive failure'; END;
    $$ LANGUAGE plpgsql`);
    });

    beforeEach(async () => {
      for (const kind of ["daily", "weekly"]) {
        await query(`DROP TRIGGER IF EXISTS reject_score ON ${kind}_scores`);
      }
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

    function ago(kind: "daily" | "weekly", n: number) {
      const date = new Date(`${kind === "daily" ? day : week}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() - n * (kind === "daily" ? 1 : 7));
      return date.toISOString().slice(0, 10);
    }

    async function run(
      kind: "daily" | "weekly",
      user: string,
      n: number,
      score = 3000,
      bestTurn = 1000,
      complete = true,
    ) {
      const period = kind === "daily" ? "day" : "week";
      await query(
        `INSERT INTO ${kind}_runs
         (user_id, ${period}, score, turns, banks, busts, super_busts, hot_dice, best_turn, seed, moves
          ${kind === "daily" ? ", complete" : ""})
       VALUES ($1, $2, $3, 10, 8, 2, 0, 1, $4, 0, '' ${kind === "daily" ? ", $5" : ""})`,
        kind === "daily"
          ? [user, ago(kind, n), score, bestTurn, complete]
          : [user, ago(kind, n), score, bestTurn],
      );
    }

    const board = (kind: "daily" | "weekly", user: string | null = null) =>
      kind === "daily" ? dailyBest(user, day) : weeklyBest(user, week);

    it.each(["daily", "weekly"] as const)(
      "shows current Locker portraits on the %s all-time board and personal best",
      async (kind) => {
        const portrait = {
          version: 1,
          mascot: "owl",
          frame: "neon",
          background: "stars",
          nameplate: "ticket",
          badge: "",
        };
        await query("UPDATE users SET profile = $2::jsonb WHERE id = $1", [
          winner,
          JSON.stringify({ avatar: "cat", visualBeta: portrait }),
        ]);
        await query("UPDATE users SET profile = $2::jsonb WHERE id = $1", [
          rival,
          JSON.stringify({
            visualBeta: { version: 1, mascot: "unknown", frame: null, badge: "<script>" },
          }),
        ]);
        await run(kind, winner, 400, 9000);
        await run(kind, rival, 401, 8000);
        await prune();

        const results = await board(kind, winner);
        expect(results.entries[0]).toMatchObject({
          username: "Winner",
          avatar: "cat",
          visualBeta: portrait,
          score: 9000,
          rank: 1,
        });
        expect(results.yourBest).toMatchObject({ avatar: "cat", visualBeta: portrait, you: true });
        expect(results.entries[1]).toMatchObject({
          avatar: "",
          visualBeta: {
            version: 1,
            mascot: "fox",
            frame: "brass",
            background: "felt",
            nameplate: "classic",
            badge: "",
          },
        });

        // Equipment is live account data; changing it must not rewrite or rank a score.
        const updated = { ...portrait, mascot: "frog" };
        await query("UPDATE users SET profile = $2::jsonb WHERE id = $1", [
          winner,
          JSON.stringify({ avatar: "cat", visualBeta: updated }),
        ]);
        await query("UPDATE users SET profile = '{}'::jsonb WHERE id = $1", [rival]);
        const refreshed = await board(kind, winner);
        expect(refreshed.entries[0]).toMatchObject({ visualBeta: updated, score: 9000, rank: 1 });
        expect(refreshed.yourBest).toMatchObject({ visualBeta: updated, score: 9000, rank: 1 });
        expect(refreshed.entries[1].avatar).toBe("");
        expect(refreshed.entries[1].visualBeta).toBeUndefined();
        expect(refreshed.runs).toBe(2);
      },
    );

    it.each(["daily", "weekly"] as const)(
      "keeps the %s top 25, personal best, ranks and counts after years-old replays expire",
      async (kind) => {
        for (let i = 0; i < 40; i++) await run(kind, winner, 400 + i, 5000 - i);
        await run(kind, rival, 500, 1000);
        await migrate();
        expect((await query(`SELECT * FROM ${kind}_runs`)).rows).toHaveLength(0);
        const results = await board(kind, rival);
        expect(results.entries).toHaveLength(25);
        expect(results.entries[0]).toMatchObject({ username: "Winner", score: 5000, rank: 1 });
        expect(results.entries[24]).toMatchObject({ score: 4976, rank: 25 });
        expect(results.yourBest).toMatchObject({
          username: "Rival",
          score: 1000,
          rank: 41,
          you: true,
        });
        expect(results.runs).toBe(41);
        await migrate();
        await prune();
        expect(await board(kind, rival)).toEqual(results);
        expect((await query(`SELECT count(*)::int AS n FROM ${kind}_scores`)).rows[0].n).toBe(41);
      },
    );

    it.each(["daily", "weekly"] as const)(
      "preserves the %s score, best-turn and date ordering",
      async (kind) => {
        await run(kind, winner, 400, 4000, 1500);
        await run(kind, rival, 401, 4000, 1500);
        await run(kind, rival, 402, 4000, 1000);
        await prune();
        const results = await board(kind);
        expect(results.entries.map((entry) => entry.username)).toEqual([
          "Rival",
          "Winner",
          "Rival",
        ]);
        expect(results.entries.map((entry) => entry.rank)).toEqual([1, 2, 3]);
      },
    );

    it("keeps today's daily scores hidden until a viewer has completed their own run", async () => {
      await run("daily", winner, 0, 9000);
      await run("daily", winner, 400, 5000);
      await run("daily", rival, 0, 1000, 500, false);
      await prune();
      expect((await dailyBest(null, day)).entries.map((entry) => entry.score)).toEqual([5000]);
      const unfinished = await dailyBest(rival, day);
      expect(unfinished.todayHidden).toBe(true);
      expect(unfinished.runs).toBe(1);
      expect(unfinished.yourBest).toBeNull();
      await query("UPDATE daily_runs SET complete = true WHERE user_id = $1", [rival]);
      await prune();
      const finished = await dailyBest(rival, day);
      expect(finished.todayHidden).toBe(false);
      expect(finished.entries.map((entry) => entry.score)).toEqual([9000, 5000, 1000]);
      expect(finished.yourBest).toMatchObject({ score: 1000, rank: 3 });
    });

    it("shows the current weekly result immediately and only improves its standing score", async () => {
      await run("weekly", winner, 0, 5000, 1000);
      await recordChallengeScore("weekly", winner, week);
      expect((await weeklyBest(winner, week)).yourBest).toMatchObject({ week, score: 5000 });
      await query("UPDATE weekly_runs SET score = 4000, best_turn = 3000");
      await preserveChallengeScores("weekly");
      expect((await query("SELECT score, best_turn FROM weekly_scores")).rows).toEqual([
        { score: 5000, best_turn: 1000 },
      ]);
      await query("UPDATE weekly_runs SET score = 5000, best_turn = 2000");
      await preserveChallengeScores("weekly");
      expect((await query("SELECT score, best_turn FROM weekly_scores")).rows).toEqual([
        { score: 5000, best_turn: 2000 },
      ]);
      await query("UPDATE weekly_runs SET score = 5500, best_turn = 1500");
      await preserveChallengeScores("weekly");
      expect((await query("SELECT score, best_turn FROM weekly_scores")).rows).toEqual([
        { score: 5500, best_turn: 1500 },
      ]);
    });

    it("recovers known archived winners' scores without inventing missing tiebreaks", async () => {
      await query(
        "INSERT INTO weekly_champions (week, user_id, score) VALUES ($1, $2, 6000), ($3, $2, NULL)",
        [ago("weekly", 60), winner, ago("weekly", 61)],
      );
      await run("weekly", rival, 70, 6000, 1500);
      await migrate();
      expect(
        (await query("SELECT score, best_turn FROM weekly_scores WHERE user_id = $1", [winner]))
          .rows,
      ).toEqual([{ score: 6000, best_turn: null }]);
      expect((await weeklyBest(null, week)).entries.map((entry) => entry.username)).toEqual([
        "Rival",
        "Winner",
      ]);
      expect((await query("SELECT * FROM weekly_champions")).rows).toHaveLength(0);
    });

    it("can still fill a winner's score from its all-time summary after the replay is gone", async () => {
      await run("weekly", winner, 10, 4200);
      await prune();
      await query("UPDATE weekly_champions SET score = NULL");
      expect((await weeklyStatus(rival, week)).champion).toMatchObject({
        username: "Winner",
        score: 4200,
      });
    });

    it("retains expiring winner summaries if their scores cannot be archived", async () => {
      await query("INSERT INTO weekly_champions (week, user_id, score) VALUES ($1, $2, 6000)", [
        ago("weekly", 60),
        winner,
      ]);
      await query(`CREATE TRIGGER reject_score BEFORE INSERT ON weekly_scores
      FOR EACH ROW EXECUTE FUNCTION reject_score_archive()`);
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        await prune();
        expect((await query("SELECT * FROM weekly_champions")).rows).toHaveLength(1);
      } finally {
        log.mockRestore();
        await query("DROP TRIGGER reject_score ON weekly_scores");
      }
      await prune();
      expect((await query("SELECT * FROM weekly_champions")).rows).toHaveLength(0);
      expect((await weeklyBest(null, week)).entries[0]).toMatchObject({ score: 6000 });
    });

    it.each(["daily", "weekly"] as const)(
      "skips %s replay cleanup if copying scores fails, then safely retries",
      async (kind) => {
        await run(kind, winner, 40, 4100);
        await query(`CREATE TRIGGER reject_score BEFORE INSERT ON ${kind}_scores
      FOR EACH ROW EXECUTE FUNCTION reject_score_archive()`);
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
          await prune();
          expect((await query(`SELECT * FROM ${kind}_runs`)).rows).toHaveLength(1);
          expect(log).toHaveBeenCalled();
        } finally {
          log.mockRestore();
          await query(`DROP TRIGGER reject_score ON ${kind}_scores`);
        }
        await prune();
        expect((await query(`SELECT * FROM ${kind}_runs`)).rows).toHaveLength(0);
        expect((await board(kind)).entries[0]).toMatchObject({ username: "Winner", score: 4100 });
      },
    );

    function completeMoves(seed: number): RunMove[] {
      const moves: RunMove[] = [];
      while (!weeklyPosition(seed, moves).result.complete) {
        const pos = weeklyPosition(seed, moves);
        moves.push(getLegalActions(runMoveStart(pos.state)).canBank ? "BANK" : "ROLL");
      }
      return moves;
    }

    it.each(["daily", "weekly"] as const)(
      "commits new %s results atomically with permanent scores",
      async (kind) => {
        const seed = 123456789;
        const moves = completeMoves(seed);
        const final = moves.pop()!;
        if (kind === "daily") {
          await run(kind, winner, 0, 0, 0, false);
          await query("UPDATE daily_runs SET seed = $1, moves = $2", [seed, moves.join(",")]);
        } else {
          await query(
            "INSERT INTO weekly_open (user_id, week, seed, moves) VALUES ($1, $2, $3, $4)",
            [winner, week, seed, moves.join(",")],
          );
        }
        await query(`CREATE TRIGGER reject_score BEFORE INSERT ON ${kind}_scores
      FOR EACH ROW EXECUTE FUNCTION reject_score_archive()`);
        const play = () =>
          kind === "daily"
            ? playDailyMove(winner, final, day)
            : playWeeklyMove(winner, final, week);
        await expect(play()).rejects.toThrow("injected score archive failure");
        expect((await query(`SELECT * FROM ${kind}_scores`)).rows).toHaveLength(0);
        if (kind === "daily") {
          expect((await query("SELECT complete, moves FROM daily_runs")).rows).toEqual([
            { complete: false, moves: moves.join(",") },
          ]);
          expect((await query("SELECT * FROM daily_completions")).rows).toHaveLength(0);
        } else {
          expect((await query("SELECT * FROM weekly_runs")).rows).toHaveLength(0);
          expect((await query("SELECT * FROM weekly_attempts")).rows).toHaveLength(0);
          expect((await query("SELECT moves FROM weekly_open")).rows).toEqual([
            { moves: moves.join(",") },
          ]);
        }
        await query(`DROP TRIGGER reject_score ON ${kind}_scores`);
        expect((await play()).complete).toBe(true);
        const result = weeklyPosition(seed, [...moves, final]).result;
        expect((await query(`SELECT score, best_turn FROM ${kind}_scores`)).rows).toEqual([
          { score: result.score, best_turn: result.bestTurn },
        ]);
        expect((await board(kind, winner)).yourBest?.score).toBe(result.score);
        if (kind === "weekly") {
          expect((await query("SELECT * FROM weekly_open")).rows).toHaveLength(0);
          expect((await query("SELECT attempts FROM weekly_runs")).rows).toEqual([{ attempts: 1 }]);
        }
      },
    );

    it("leaves unfinished daily runs and zero-score results out of all-time boards", async () => {
      await run("daily", winner, 400, 5000, 2000, false);
      await run("daily", rival, 401, 0);
      await run("weekly", rival, 60, 0);
      await prune();
      expect((await dailyBest(null, day)).entries).toEqual([]);
      expect((await weeklyBest(null, week)).entries).toEqual([]);
    });
  },
);
