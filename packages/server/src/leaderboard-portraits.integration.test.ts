import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getPool, migrate, query } from "./db.js";
import { LEADERBOARD_CATEGORIES, leaderboard } from "./leaderboards.js";

// Only a disposable local test database, with each suite isolated in its own schema.
describe.skipIf(!process.env.CHALLENGE_TEST_DATABASE_URL)(
  "career board portraits (Postgres)",
  () => {
    const schema = `leaderboard_portraits_test_${randomUUID().replaceAll("-", "")}`;
    const leader = randomUUID();
    const viewer = randomUUID();
    const portrait = {
      version: 1,
      mascot: "owl",
      frame: "neon",
      background: "stars",
      nameplate: "ticket",
      badge: "",
    };
    let admin: pg.Pool;

    beforeAll(async () => {
      admin = new pg.Pool({ connectionString: process.env.CHALLENGE_TEST_DATABASE_URL });
      await admin.query(`CREATE SCHEMA ${schema}`);
      const url = new URL(process.env.CHALLENGE_TEST_DATABASE_URL!);
      url.searchParams.set("options", `-c search_path=${schema} -c statement_timeout=3000`);
      vi.stubEnv("DATABASE_URL", url.toString());
      await migrate();
    });

    beforeEach(async () => {
      await query("TRUNCATE users CASCADE");
      await query(
        `INSERT INTO users (id, email, username, password_hash, created_at, profile)
       VALUES ($1, 'leader@test.invalid', 'Leader', 'unused', '2026-01-01', $3::jsonb),
              ($2, 'viewer@test.invalid', 'Viewer', 'unused', '2026-01-02', $4::jsonb)`,
        [
          leader,
          viewer,
          JSON.stringify({ avatar: "cat", visualBeta: portrait }),
          JSON.stringify({ visualBeta: { version: 1, mascot: "unknown", badge: "<script>" } }),
        ],
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

    async function stats(user: string, value: number) {
      await query(
        `INSERT INTO career_stats
         (user_id, online_wins, best_turn, best_streak, best_total, daily_wins, weekly_wins)
       VALUES ($1, $2, $2, $2, $2, $2, $2)`,
        [user, value],
      );
    }

    it.each(LEADERBOARD_CATEGORIES)(
      "returns current equipment and preserves tied %s standings",
      async (category) => {
        await stats(leader, 30);
        await stats(viewer, 30);
        const result = await leaderboard(category, leader);
        expect(result.entries[0]).toEqual({
          username: "Leader",
          avatar: "cat",
          visualBeta: portrait,
          rank: 1,
          value: 30,
          you: true,
        });
        expect(result.yourEntry).toEqual(result.entries[0]);
        expect(result.yourRank).toBe(1);
        expect(result.yourValue).toBe(30);
        expect(result.players).toBe(2);
        expect(result.entries[1]).toMatchObject({
          username: "Viewer",
          rank: 2,
          value: 30,
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

        const updated = { ...portrait, mascot: "frog" };
        await query("UPDATE users SET profile = $2::jsonb WHERE id = $1", [
          leader,
          JSON.stringify({ avatar: "cat", visualBeta: updated }),
        ]);
        await query("UPDATE users SET profile = '{}'::jsonb WHERE id = $1", [viewer]);
        const refreshed = await leaderboard(category, leader);
        expect(refreshed.entries[0]).toEqual({ ...result.entries[0], visualBeta: updated });
        expect(refreshed.yourEntry).toEqual(refreshed.entries[0]);
        expect(refreshed.entries[1].avatar).toBe("");
        expect(refreshed.entries[1].visualBeta).toBeUndefined();
        expect(refreshed.yourRank).toBe(result.yourRank);
        expect(refreshed.yourValue).toBe(result.yourValue);
        expect(refreshed.players).toBe(result.players);
      },
    );

    it.each(LEADERBOARD_CATEGORIES)(
      "returns the equipped personal %s entry outside the top 25",
      async (category) => {
        await stats(leader, 1000);
        await stats(viewer, 1);
        await query("UPDATE users SET profile = $2::jsonb WHERE id = $1", [
          viewer,
          JSON.stringify({ avatar: "owl", visualBeta: { ...portrait, mascot: "panda" } }),
        ]);
        for (let index = 0; index < 25; index++) {
          const id = randomUUID();
          await query(
            `INSERT INTO users (id, email, username, password_hash)
           VALUES ($1, $2, $3, 'unused')`,
            [id, `other-${index}@test.invalid`, `Other ${index}`],
          );
          await stats(id, 100 + index);
        }
        const result = await leaderboard(category, viewer);
        expect(result.entries).toHaveLength(25);
        expect(result.entries.some((entry) => entry.you)).toBe(false);
        expect(result.yourEntry).toEqual({
          username: "Viewer",
          avatar: "owl",
          visualBeta: { ...portrait, mascot: "panda" },
          rank: 27,
          value: 1,
          you: true,
        });
        expect(result.yourRank).toBe(27);
        expect(result.yourValue).toBe(1);
        expect(result.players).toBe(27);
      },
    );

    it("omits personal standings for guests and accounts without positive values", async () => {
      await stats(leader, 10);
      await stats(viewer, 0);
      await query("UPDATE users SET profile = $2::jsonb WHERE id = $1", [
        leader,
        JSON.stringify({ visualBeta: { version: 99 } }),
      ]);
      for (const category of LEADERBOARD_CATEGORIES) {
        for (const user of [null, viewer]) {
          const result = await leaderboard(category, user);
          expect(result.yourEntry, category).toBeNull();
          expect(result.yourRank, category).toBeNull();
          expect(result.yourValue, category).toBeNull();
          expect(result.players, category).toBe(1);
          expect(result.entries[0].avatar, category).toBe("");
          expect(result.entries[0].visualBeta, category).toBeUndefined();
        }
      }
    });
  },
);
