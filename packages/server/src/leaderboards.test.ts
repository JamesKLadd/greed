/**
 * The career boards, with the database stubbed in memory.
 *
 * What is pinned here is the part a board cannot recover from getting wrong: a
 * category only ever names a column this module chose (the name lands inside
 * the SQL text), and a career count of challenge wins only ever climbs — the
 * figure it is fed shrinks on its own as old runs are pruned.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

/** Every statement the module sent, for checking what it asked the database. */
const sql: string[] = [];

vi.mock("./db.js", () => ({
  query: async (text: string) => {
    sql.push(text);
    return { rows: [] };
  },
}));

const { LEADERBOARD_CATEGORIES, isLeaderboardCategory, leaderboard, refreshCareerChallengeWins } =
  await import("./leaderboards.js");

beforeEach(() => {
  sql.length = 0;
});

describe("categories", () => {
  it("offers a board for daily and for weekly challenge wins", () => {
    expect(LEADERBOARD_CATEGORIES).toContain("dailyWins");
    expect(LEADERBOARD_CATEGORIES).toContain("weeklyWins");
  });

  it("accepts exactly the categories it offers and nothing else", () => {
    for (const c of LEADERBOARD_CATEGORIES) expect(isLeaderboardCategory(c)).toBe(true);
    // The category reaches SQL as a column name, so anything not on the list
    // has to be refused at the door rather than mapped to something harmless.
    for (const bad of ["daily_wins", "online_wins DESC", "1;DROP TABLE users", "", null, 7]) {
      expect(isLeaderboardCategory(bad), String(bad)).toBe(false);
    }
  });

  it("ranks each category on the column it is meant to", async () => {
    // Stated again here rather than imported, deliberately: a second, separate
    // copy of the mapping is what catches a category wired to the wrong column,
    // which the module's own FIELD map cannot do on its own.
    const column: Record<string, string> = {
      wins: "online_wins",
      bestTurn: "best_turn",
      bestStreak: "best_streak",
      bestTotal: "best_total",
      dailyWins: "daily_wins",
      weeklyWins: "weekly_wins",
    };
    for (const c of LEADERBOARD_CATEGORIES) {
      sql.length = 0;
      await leaderboard(c, null);
      const text = sql.join("\n");
      expect(text, c).toContain(`c.${column[c]}`);
      // And the caller's own string never reaches the statement. Every category
      // but "wins" is camelCase, which no column name here could contain.
      if (c !== "wins") expect(text, c).not.toContain(c);
    }
  });
});

describe("career challenge wins", () => {
  it("tallies from the run tables, not from anything a client reported", async () => {
    await refreshCareerChallengeWins("daily");
    const text = sql.join("\n");
    expect(text).toContain("FROM daily_runs");
    expect(text).toContain("career_stats");
    // The profile jsonb is what the boards were moved OFF; nothing here may
    // read it back in through the side door.
    expect(text).not.toContain("profile");
  });

  it("only ever climbs, because the figure it is fed can fall", async () => {
    // Wins are derived from runs, and runs are pruned after thirty days — so a
    // later tally genuinely reports fewer. A career total that went down would
    // be a strange thing to show anybody.
    await refreshCareerChallengeWins("weekly");
    expect(sql.join("\n")).toContain("GREATEST(career_stats.weekly_wins");
  });

  it("keeps the two counts in their own columns", async () => {
    sql.length = 0;
    await refreshCareerChallengeWins("daily");
    expect(sql.join("\n")).toContain("daily_wins");
    expect(sql.join("\n")).not.toContain("weekly_wins");

    sql.length = 0;
    await refreshCareerChallengeWins("weekly");
    expect(sql.join("\n")).toContain("weekly_wins");
    expect(sql.join("\n")).not.toContain("daily_wins");
  });

  it("counts only boards that have closed", async () => {
    // A day still being played is not a day anyone has won.
    await refreshCareerChallengeWins("daily");
    expect(sql.join("\n")).toMatch(/day < \$1::date/);
    sql.length = 0;
    await refreshCareerChallengeWins("weekly");
    expect(sql.join("\n")).toMatch(/week < \$1::date/);
  });

  it("refreshes itself when the board is read, and only for those two", async () => {
    for (const [category, expected] of [
      ["dailyWins", "daily_runs"],
      ["weeklyWins", "weekly_runs"],
    ] as const) {
      sql.length = 0;
      await leaderboard(category, null);
      expect(sql.join("\n"), category).toContain(expected);
    }
    for (const category of ["wins", "bestTurn", "bestStreak", "bestTotal"] as const) {
      sql.length = 0;
      await leaderboard(category, null);
      expect(sql.join("\n"), category).not.toContain("daily_runs");
      expect(sql.join("\n"), category).not.toContain("weekly_runs");
    }
  });
});
