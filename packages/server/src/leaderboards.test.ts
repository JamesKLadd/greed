/**
 * The career boards, with the database stubbed in memory.
 *
 * What is pinned here is the part a board cannot recover from getting wrong: a
 * category only ever names a column this module chose (the name lands inside
 * the SQL text), and a career count of challenge wins is a running total of a
 * ledger — never a count of the run tables, which are pruned after thirty days.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { dailyKey, weekKey } from "@greed/core";

/** Every statement the module sent, for checking what it asked the database. */
const sql: string[] = [];
/** And what it bound to them — which is where the open-week bug lived. */
const bound: unknown[][] = [];

vi.mock("./db.js", () => ({
  query: async (text: string, params: unknown[] = []) => {
    sql.push(text);
    bound.push(params);
    return { rows: [] };
  },
}));

const {
  LEADERBOARD_CATEGORIES,
  isLeaderboardCategory,
  careerChallengeWins,
  leaderboard,
  refreshCareerChallengeWins,
  seedChallengeWinsLedger,
} = await import("./leaderboards.js");

beforeEach(() => {
  sql.length = 0;
  bound.length = 0;
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

  it("adds each newly closed period, rather than re-counting the runs", async () => {
    // It used to keep GREATEST(stored, a count of the runs on file). The runs
    // are pruned after thirty days, so that count was a sliding window, and the
    // maximum of a window is not a total: two wins won while two old ones aged
    // out left the figure exactly where it was.
    await refreshCareerChallengeWins("weekly");
    const text = sql.join("\n");
    expect(text).toContain("INSERT INTO challenge_wins");
    expect(text).toContain("SET weekly_wins = career_stats.weekly_wins + EXCLUDED.weekly_wins");
    expect(text).not.toContain("GREATEST");
    // Only from what the ledger inserted this time, so a period is counted once.
    expect(text).toContain("RETURNING user_id");
    expect(text).toContain("FROM banked");
  });

  it("never gives a closed period a second winner", async () => {
    // Keyed on the period, not the player: whatever a later rule would make of
    // a day's surviving runs, the day was settled when it closed.
    await refreshCareerChallengeWins("daily");
    expect(sql.join("\n")).toMatch(/NOT EXISTS[\s\S]*c\.period = w\.period/);
    expect(bound.at(-1)).toEqual([dailyKey(), "daily"]);
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

  it("counts a week as closed only once the NEXT week has started", async () => {
    // The bug these boards shipped with. A week's key is the Monday it starts
    // on, so from Tuesday onward the open week's key is strictly less than
    // today's date — and comparing against today let the week in progress
    // through as closed, crediting whoever was leading it with a win.
    await refreshCareerChallengeWins("weekly");
    expect(bound.at(-1)).toEqual([weekKey(), "weekly"]);
  });

  it("does not count the open week, on a day that is not its Monday", () => {
    // Pinned to a WEDNESDAY on purpose. Asserting "the boundary is not today's
    // date" against the real clock passes six days a week and fails on the
    // seventh, when a week key and a date are the same string — and Monday is
    // the one day the bug was invisible, which is presumably how it shipped.
    const wednesday = new Date("2026-09-16T17:00:00Z");
    expect(weekKey(wednesday)).toBe("2026-09-14");
    expect(dailyKey(wednesday)).toBe("2026-09-16");
    // A run in the open week compares as BEFORE today, and as NOT before the
    // week boundary. That difference is the entire bug.
    expect(weekKey(wednesday) < dailyKey(wednesday)).toBe(true);
    expect(weekKey(wednesday) < weekKey(wednesday)).toBe(false);
  });

  it("counts a day as closed once the next day has started", async () => {
    await refreshCareerChallengeWins("daily");
    expect(bound.at(-1)).toEqual([dailyKey(), "daily"]);
  });

  it("seeds the ledger without lowering anybody", async () => {
    // The first boot with the ledger starts it from the runs still on file.
    // Those only reach back thirty days, so a stored figure may be holding a
    // win the runs no longer show — it is kept wherever it is higher.
    await seedChallengeWinsLedger("weekly");
    const text = sql.join("\n");
    expect(text).toContain("INSERT INTO challenge_wins");
    expect(text).toContain("GREATEST(career_stats.weekly_wins, EXCLUDED.weekly_wins)");
    expect(text).not.toContain("daily_wins");
    expect(bound.at(-1)).toEqual([weekKey(), "weekly"]);
  });

  it("reads the career tally for the screens, so they cannot disagree", async () => {
    sql.length = 0;
    await careerChallengeWins("daily", ["a", "b", "a"]);
    expect(sql.join("\n")).toContain("daily_wins AS wins FROM career_stats");
    // Deduplicated: the viewer is normally on the board they asked for too.
    expect(bound.at(-1)).toEqual([["a", "b"]]);
  });

  it("asks for nothing at all when there is nobody to ask about", async () => {
    sql.length = 0;
    expect(await careerChallengeWins("weekly", [])).toEqual(new Map());
    expect(sql).toEqual([]);
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
