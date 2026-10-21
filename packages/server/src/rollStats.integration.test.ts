import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DAILY_TURNS, dailyKey, runPosition, type RunMove } from "@greed/core";
import { ROLL_DATA_DAYS, ThrowCollector, encodeThrows, rollGameFromState } from "@greed/bots";
import { getPool, migrate, prune, query } from "./db.js";
import { playDailyMove, startDailyRun } from "./daily.js";
import { playWeeklyMove, startWeeklyRun } from "./weekly.js";
import {
  backfillDailyRolls,
  isStatsAdmin,
  recordLocalGame,
  rollExport,
  rollSummary,
  snapshotStatsAdmins,
} from "./rollStats.js";

/** A finished run's moves, the simple way: roll twice, bank, repeat. */
const PLAY: RunMove[] = Array.from(
  { length: 60 },
  () => ["ROLL", "ROLL", "BANK"] as RunMove[],
).flat();

// Explicit opt-in and a disposable schema: never touch a live application's data.
describe.skipIf(!process.env.CHALLENGE_TEST_DATABASE_URL)("roll statistics (Postgres)", () => {
  const schema = `roll_stats_test_${randomUUID().replaceAll("-", "")}`;
  const james = randomUUID();
  const jimmy = randomUUID();
  const player = randomUUID();
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
       VALUES ($1, 'james@test.invalid', 'James', 'unused'),
              ($2, 'jimmy@test.invalid', 'Jimmy', 'unused'),
              ($3, 'player@test.invalid', 'Player', 'unused')`,
      [james, jimmy, player],
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

  /** Statistics are filed after the commit, off the reply's path. */
  async function rowsFor(userId: string, mode: string, expected: number) {
    for (let i = 0; i < 50; i++) {
      const { rows } = await query<{ key: string; throws: string; tally: Record<string, number> }>(
        `SELECT key, throws, tally FROM roll_games WHERE user_id = $1 AND mode = $2`,
        [userId, mode],
      );
      if (rows.length >= expected) return rows;
      await new Promise((r) => setTimeout(r, 40));
    }
    throw new Error(`expected ${expected} ${mode} row(s) for ${userId}`);
  }

  async function playToTheEnd(move: (m: RunMove) => Promise<{ complete: boolean }>) {
    for (let i = 0; i < 400; i++) {
      for (const m of ["ROLL", "BANK"] as RunMove[]) {
        try {
          if ((await move(m)).complete) return;
          break;
        } catch (err) {
          if ((err as { code?: string }).code !== "move.illegal") throw err;
        }
      }
    }
    throw new Error("run never finished");
  }

  it("grants the all-players view to the named accounts as they stand, by id", async () => {
    await snapshotStatsAdmins(["James", "Jimmy"]);
    expect(await isStatsAdmin(james)).toBe(true);
    expect(await isStatsAdmin(jimmy)).toBe(true);
    expect(await isStatsAdmin(player)).toBe(false);
    // A later account that takes a freed name is a player, not the owner.
    await query(`DELETE FROM users WHERE id = $1`, [jimmy]);
    const impostor = randomUUID();
    await query(
      `INSERT INTO users (id, email, username, password_hash)
       VALUES ($1, 'new@test.invalid', 'Jimmy', 'unused')`,
      [impostor],
    );
    expect(await isStatsAdmin(impostor)).toBe(false);
  });

  it("files a finished daily run, every throw, once", async () => {
    await startDailyRun(player);
    await playToTheEnd((m) => playDailyMove(player, m));
    const [row] = await rowsFor(player, "daily", 1);
    expect(row.key).toBe(`daily:${player}:${dailyKey()}`);
    const { rows } = await query<{ moves: string; seed: string }>(
      `SELECT moves, seed FROM daily_runs WHERE user_id = $1`,
      [player],
    );
    const replay = runPosition(
      Number(rows[0].seed),
      rows[0].moves.split(",") as RunMove[],
      DAILY_TURNS,
    );
    const rolls = replay.state.log.filter((e) => e.type === "roll").length;
    expect(JSON.parse(row.throws)).toHaveLength(rolls);
    expect(row.tally.throws).toBe(rolls);
    expect(row.tally.b5).toBe(replay.result.superBusts);
  });

  it("files EVERY weekly attempt, not just the best", async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      await startWeeklyRun(player);
      await playToTheEnd((m) => playWeeklyMove(player, m));
    }
    const rows = await rowsFor(player, "weekly", 2);
    expect(new Set(rows.map((r) => r.key)).size).toBe(2);
  });

  function localGame(playedAt = new Date()) {
    const collector = new ThrowCollector(["you"]);
    const pos = runPosition(77, PLAY, DAILY_TURNS, (b, a) => collector.observe(b, a));
    const game = rollGameFromState("local", pos.state, "you", collector.throwsFor("you"), playedAt);
    return {
      ...game,
      won: true,
      goal: 3000,
      players: 2,
      throws: JSON.parse(encodeThrows(game.throws)),
    };
  }

  it("takes an uploaded solo game once, however often it is sent", async () => {
    const id = randomUUID();
    await recordLocalGame(player, { id, game: localGame() });
    await recordLocalGame(player, { id, game: localGame() });
    expect(await rowsFor(player, "local", 1)).toHaveLength(1);
    await expect(
      recordLocalGame(player, { id: randomUUID(), game: { nonsense: true } }),
    ).rejects.toMatchObject({
      code: "stats.invalid",
    });
  });

  it("summarises one player, or everyone combined", async () => {
    await recordLocalGame(player, { id: randomUUID(), game: localGame() });
    await recordLocalGame(james, { id: randomUUID(), game: localGame() });
    const mine = await rollSummary("games", player);
    const everyone = await rollSummary("local", null);
    expect(mine.tally.games).toBe(1);
    expect(mine.series).toHaveLength(1);
    expect(everyone.tally.games).toBe(2);
    expect(everyone.playerCount).toBe(2);
    expect(everyone.tally.throws).toBe(2 * mine.tally.throws);
    expect(everyone.series[0].games).toBe(2);
    // Online games are not local ones.
    expect((await rollSummary("online", null)).tally.games).toBe(0);
  });

  it("exports CSV: a player's own, and everyone's under pseudonyms", async () => {
    await recordLocalGame(player, { id: randomUUID(), game: localGame() });
    await recordLocalGame(james, { id: randomUUID(), game: localGame() });
    const mine = (await rollExport("games", "games", player)).trim().split("\n");
    expect(mine).toHaveLength(2);
    expect(mine[0].startsWith("played_at,mode,score")).toBe(true);
    const all = await rollExport("local", "throws", null);
    expect(all.startsWith("player,")).toBe(true);
    expect(all).not.toContain("James");
    expect(all).not.toContain(james);
    expect(all).toMatch(/^P-[0-9a-f]{8},/m);
  });

  it(`keeps ${ROLL_DATA_DAYS} days and lets older data go`, async () => {
    const day = 86_400_000;
    await recordLocalGame(player, { id: randomUUID(), game: localGame() });
    // Written straight in: an upload that old is refused at the door.
    await query(
      `INSERT INTO roll_games (key, user_id, mode, played_at, score, turns, banks, busts,
                               banked_points, lost_points, best_turn, tally, throws)
       VALUES ('old', $1, 'local', $2, 0, 0, 0, 0, 0, 0, 0, '{}', '[]'),
              ('recent', $1, 'local', $3, 0, 0, 0, 0, 0, 0, 0, '{}', '[]')`,
      [
        player,
        new Date(Date.now() - (ROLL_DATA_DAYS + 1) * day),
        new Date(Date.now() - (ROLL_DATA_DAYS - 1) * day),
      ],
    );
    await prune();
    const { rows } = await query<{ key: string }>(
      `SELECT key FROM roll_games WHERE key IN ('old', 'recent')`,
    );
    expect(rows.map((r) => r.key)).toEqual(["recent"]);
  });

  it("backfills daily runs already on record, skipping ones that cannot be replayed", async () => {
    const day = dailyKey();
    await query(
      `INSERT INTO daily_runs (user_id, day, score, turns, banks, busts, hot_dice, best_turn, moves, seed, complete)
       VALUES ($1, $3, 0, 10, 0, 0, 0, 0, $4, 12345, true),
              ($2, $3, 0, 10, 0, 0, 0, 0, $4, 0, true)`,
      [player, james, day, PLAY.join(",")],
    );
    await backfillDailyRolls(DAILY_TURNS);
    await backfillDailyRolls(DAILY_TURNS); // twice: still one row
    expect(await rowsFor(player, "daily", 1)).toHaveLength(1);
    const { rows } = await query(`SELECT 1 FROM roll_games WHERE user_id = $1`, [james]);
    expect(rows).toHaveLength(0);
  });
});
