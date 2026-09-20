/**
 * The challenges' standings order, and the places that have to use it.
 *
 * Fourteen queries rank challenge runs, seven per challenge. They were fourteen
 * copies of two ORDER BYs, and a copy that drifts is not a theoretical worry
 * here — a diverged boundary in the weekly's career tally is what credited a
 * win for a week that had not finished. So each order lives in one constant,
 * and this checks nobody has written their own again.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DAILY_ALLTIME_ORDER_R,
  DAILY_ORDER,
  DAILY_ORDER_R,
  WEEKLY_ALLTIME_ORDER_R,
  WEEKLY_ORDER,
  WEEKLY_ORDER_R,
} from "./ranking.js";

const read = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), "utf8");
const weekly = read("weekly.ts");
const daily = read("daily.ts");
const boards = read("leaderboards.ts");

/** Both challenges, so every rule below is asserted of each of them. */
const CHALLENGES = [
  {
    name: "weekly",
    order: WEEKLY_ORDER,
    qualified: WEEKLY_ORDER_R,
    allTime: WEEKLY_ALLTIME_ORDER_R,
    /** The column standing for "who got there first". */
    first: "best_at",
    period: "week",
    source: weekly,
    /** Board, own rank, closed-period placings, champion. */
    inSource: 4,
  },
  {
    name: "daily",
    order: DAILY_ORDER,
    qualified: DAILY_ORDER_R,
    allTime: DAILY_ALLTIME_ORDER_R,
    first: "created_at",
    period: "day",
    source: daily,
    inSource: 4,
  },
];

describe.each(CHALLENGES)("the $name challenge's standings order", (c) => {
  it("settles a tie on the better single turn before falling back to the clock", () => {
    expect(c.order).toBe(`score DESC, best_turn DESC, ${c.first} ASC`);
  });

  it("aliases the same rule rather than restating it", () => {
    expect(c.qualified).toBe(
      c.order
        .split(", ")
        .map((term) => `r.${term}`)
        .join(", "),
    );
  });

  it("ends on something that cannot tie, so a period has ONE winner", () => {
    // Two players level on score and best turn would otherwise both rank first,
    // leaving the period with two champions and the crown with two owners.
    for (const order of [c.order, c.qualified, c.allTime]) {
      expect(order.split(", ").at(-1), order).toMatch(/ASC$/);
    }
  });

  it("ranks the all-time board the same way, down to its last term", () => {
    // Across periods "first" means the earlier period rather than the earlier
    // instant, but a tie is still settled on the run, not on the calendar.
    expect(c.allTime).toBe(`r.score DESC, r.best_turn DESC, r.${c.period} ASC`);
  });

  it("is the only ordering in its module — no query writes its own", () => {
    const handWritten = [...c.source.matchAll(/ORDER BY[^)]*\bscore DESC\b[^)]*\)/g)].filter(
      (m) => !m[0].includes("${"),
    );
    expect(handWritten.map((m) => m[0])).toEqual([]);
  });

  it("is used by the period's board, own rank, placings and champion", () => {
    const uses = c.source.match(/\$\{(WEEKLY|DAILY)_ORDER(_R)?\}/g) ?? [];
    expect(uses.length).toBe(c.inSource);
  });
});

describe("the career boards module", () => {
  it("uses each challenge's order for its wins tally", () => {
    expect((boards.match(/\$\{WEEKLY_ORDER\}/g) ?? []).length).toBe(1);
    expect((boards.match(/\$\{DAILY_ORDER\}/g) ?? []).length).toBe(1);
  });

  it("uses each challenge's all-time order for its all-time board", () => {
    // Twice apiece: the board itself, and the viewer's own row on it.
    expect((boards.match(/\$\{WEEKLY_ALLTIME_ORDER_R\}/g) ?? []).length).toBe(2);
    expect((boards.match(/\$\{DAILY_ALLTIME_ORDER_R\}/g) ?? []).length).toBe(2);
  });

  it("leaves the CAREER boards ranking on account age, not on a run", () => {
    // Those boards rank a lifetime figure, not a single run, so they have no
    // best turn to break a tie with and settle it on who signed up first.
    expect(boards).toContain("u.created_at ASC");
  });
});

describe("the two challenges", () => {
  it("differ only in the column standing for who got there first", () => {
    const strip = (order: string) => order.split(", ").slice(0, 2).join(", ");
    expect(strip(DAILY_ORDER)).toBe(strip(WEEKLY_ORDER));
    expect(strip(DAILY_ALLTIME_ORDER_R)).toBe(strip(WEEKLY_ALLTIME_ORDER_R));
  });
});

describe("the weekly's stored best attempt", () => {
  it("stores a new attempt that beats the standing one BY THAT ORDER", () => {
    // Not merely on score. An attempt matching your total with a bigger turn is
    // the better run once the turn is a tiebreak, and if it is not stored the
    // board ranks you on the weaker of two runs you played.
    expect(weekly).toContain(
      "(EXCLUDED.score, EXCLUDED.best_turn) > (weekly_runs.score, weekly_runs.best_turn)",
    );
    // …except best_at, which marks when the SCORE was first reached and must
    // not move when only the turn behind it improves.
    expect(weekly).toMatch(/best_at\s+= CASE WHEN EXCLUDED\.score > weekly_runs\.score/);
  });

  it("has no daily equivalent, because a day is one run", () => {
    // The daily writes a single row per player per day and updates it as they
    // play, so there is no best-of-N selection to keep in step with the order.
    expect(daily).not.toContain("ON CONFLICT (user_id, day) DO UPDATE SET score");
  });
});
