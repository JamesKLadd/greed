/**
 * The weekly's standings order, and the places that have to use it.
 *
 * Seven queries rank weekly runs. They were seven copies of one ORDER BY, and
 * a copy that drifts is not a theoretical worry here — a diverged boundary in
 * the career tally is what credited a win for a week that had not finished. So
 * the order lives in one constant, and this checks nobody has written their
 * own again.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WEEKLY_ALLTIME_ORDER_R, WEEKLY_ORDER, WEEKLY_ORDER_R } from "./ranking.js";

const read = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), "utf8");
/** Every module that ranks weekly runs. */
const sources = ["weekly.ts", "leaderboards.ts"].map((f) => ({ file: f, text: read(f) }));

describe("the weekly's standings order", () => {
  it("settles a tie on the better single turn before falling back to the clock", () => {
    expect(WEEKLY_ORDER).toBe("score DESC, best_turn DESC, best_at ASC");
    // The qualified form has to be the same rule, only aliased — writing it out
    // twice is exactly how two boards come to disagree.
    expect(WEEKLY_ORDER_R).toBe(
      WEEKLY_ORDER.split(", ")
        .map((term) => `r.${term}`)
        .join(", "),
    );
  });

  it("still ends on something that cannot tie, so a week has ONE winner", () => {
    // Two players level on score and best turn would otherwise both rank first,
    // leaving the week with two champions and the crown with two owners.
    for (const order of [WEEKLY_ORDER, WEEKLY_ORDER_R, WEEKLY_ALLTIME_ORDER_R]) {
      const final = order.split(", ").at(-1)!;
      expect(final, order).toMatch(/best_at ASC|week ASC/);
    }
  });

  it("ranks the all-time board the same way, down to its last term", () => {
    // Across weeks "first" means the earlier week rather than the earlier
    // instant, but a tie is still settled on the run, not on the calendar.
    expect(WEEKLY_ALLTIME_ORDER_R).toBe("r.score DESC, r.best_turn DESC, r.week ASC");
    expect(WEEKLY_ALLTIME_ORDER_R.startsWith("r.score DESC, r.best_turn DESC")).toBe(true);
  });

  it("is the only weekly ordering anywhere — no query writes its own", () => {
    for (const { file, text } of sources) {
      // A hand-written ORDER BY over a weekly run's columns, in SQL rather than
      // through the constant. The daily's own ordering uses created_at and is
      // deliberately not covered here.
      const handWritten = [...text.matchAll(/ORDER BY[^)]*\bbest_at\b[^)]*\)/g)].filter(
        (m) => !m[0].includes("${"),
      );
      expect(
        handWritten.map((m) => m[0]),
        file,
      ).toEqual([]);
    }
  });

  it("is used by every weekly board, tally and champion query", () => {
    const weekly = sources.find((s) => s.file === "weekly.ts")!.text;
    const boards = sources.find((s) => s.file === "leaderboards.ts")!.text;
    // Four in weekly.ts: this week's board, your rank on it, closed-week
    // placings, and each week's champion.
    expect((weekly.match(/\$\{WEEKLY_ORDER(_R)?\}/g) ?? []).length).toBe(4);
    // Three in leaderboards.ts: the career wins tally, and the all-time board
    // with the viewer's own row on it.
    expect((boards.match(/\$\{WEEKLY_ORDER\}/g) ?? []).length).toBe(1);
    expect((boards.match(/\$\{WEEKLY_ALLTIME_ORDER_R\}/g) ?? []).length).toBe(2);
  });

  it("stores a new attempt that beats the standing one BY THAT ORDER", () => {
    // Not merely on score. An attempt matching your total with a bigger turn is
    // the better run once the turn is a tiebreak, and if it is not stored the
    // board ranks you on the weaker of two runs you played.
    const weekly = sources.find((s) => s.file === "weekly.ts")!.text;
    expect(weekly).toContain(
      "(EXCLUDED.score, EXCLUDED.best_turn) > (weekly_runs.score, weekly_runs.best_turn)",
    );
    // …except best_at, which marks when the SCORE was first reached and must
    // not move when only the turn behind it improves.
    expect(weekly).toMatch(/best_at\s+= CASE WHEN EXCLUDED\.score > weekly_runs\.score/);
  });
});
