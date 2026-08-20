/**
 * The daily challenge's anti-cheat guarantees, against the real replay and
 * storage logic with the database stubbed in memory.
 *
 * These exist because the exploit they close was not a bug in a function — it
 * was in where the dice lived. The client used to hold the seed and play the
 * run locally, so leaving the screen and coming back dealt the SAME dice again
 * and a player could retry a turn until it went well. What follows pins the
 * properties that make that impossible: a run is claimed on the first start,
 * its seed is the server's secret, and the move list only ever grows.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { dailyPosition, type DailyMove } from "@greed/core";

/** One row of daily_runs, keyed by user+day. */
interface Row {
  moves: string;
  seed: number;
  complete: boolean;
  score: number;
  turns: number;
}
const rows = new Map<string, Row>();
const key = (user: string, day: string) => `${user}|${day}`;
/** Career best turn per user, as the users table would hold it. */
const bestTurns = new Map<string, number>();

/** Finished runs for a day, best first — the order the board is built in. */
function finished(day: string): { user: string; row: Row }[] {
  return [...rows.entries()]
    .filter(([k, row]) => k.endsWith(`|${day}`) && row.complete)
    .map(([k, row]) => ({ user: k.split("|")[0], row }))
    .sort((a, b) => b.row.score - a.row.score);
}

// A stub that understands only the handful of statements daily.ts issues.
vi.mock("./db.js", () => ({
  query: async (sql: string, params: unknown[] = []) => {
    const [user, day] = params as [string, string];
    // ---- dailyStatus reads (their params are NOT [user, day]) ----
    if (sql.includes("PARTITION BY day")) {
      // "Have they ever placed on a board that has closed?": [userId, today, cap].
      const [id, today, cap] = params as [string, string, number];
      const placed = [...rows.entries()].some(([k, row]) => {
        const [user, rowDay] = k.split("|");
        if (user !== id || !row.complete || row.score <= 0) return false;
        if (rowDay >= today) return false; // today's board is still open
        const sameDay = [...rows.entries()].filter(
          ([k2, r2]) => k2.endsWith("|" + rowDay) && r2.complete && r2.score > 0,
        );
        const better = sameDay.filter(([, r2]) => r2.score > row.score).length;
        return better + 1 <= cap;
      });
      return { rows: placed ? [{ ok: 1 }] : [] };
    }
    if (sql.includes("FROM ranked WHERE user_id")) {
      // The requesting player's own standing: params are [day, userId].
      const board = finished(params[0] as string);
      const i = board.findIndex((e) => e.user === (params[1] as string));
      if (i < 0) return { rows: [] };
      const { row } = board[i];
      return {
        rows: [
          {
            score: row.score,
            turns: row.turns,
            banks: 0,
            busts: 0,
            hot_dice: 0,
            best_turn: 0,
            rank: String(i + 1),
            players: String(board.length),
          },
        ],
      };
    }
    if (sql.includes("JOIN users u ON u.id = r.user_id")) {
      // The board itself: params are [day, top].
      return {
        rows: finished(params[0] as string).map((e, i) => ({
          username: `player-${e.user}`,
          score: e.row.score,
          turns: e.row.turns,
          best_turn: 0,
          busts: 0,
          user_id: e.user,
          rank: String(i + 1),
        })),
      };
    }
    if (sql.includes("COUNT(*)::text")) {
      return { rows: [{ n: String(finished(params[0] as string).length) }] };
    }
    if (sql.includes("SELECT to_char(day")) {
      return { rows: [] }; // streak: not what these tests are about
    }
    if (sql.includes("SELECT moves, seed, complete FROM daily_runs")) {
      const row = rows.get(key(user, day));
      return {
        rows: row ? [{ moves: row.moves, seed: String(row.seed), complete: row.complete }] : [],
      };
    }
    if (sql.includes("INSERT INTO daily_runs")) {
      const k = key(user, day);
      // ON CONFLICT DO NOTHING: an existing run is never replaced.
      if (!rows.has(k)) {
        rows.set(k, { moves: "", seed: Number(params[2]), complete: false, score: 0, turns: 0 });
      }
      return { rows: [] };
    }
    if (sql.includes("UPDATE users") && sql.includes("bestTurn")) {
      // GREATEST(...) in the real statement; the stub keeps the higher number.
      const [id, points] = params as [string, number];
      bestTurns.set(id, Math.max(bestTurns.get(id) ?? 0, points));
      return { rows: [] };
    }
    if (sql.includes("UPDATE daily_runs")) {
      const row = rows.get(key(user, day));
      if (row && !row.complete) {
        row.score = params[2] as number;
        row.turns = params[3] as number;
        row.moves = params[8] as string;
        row.complete = params[9] as boolean;
      }
      return { rows: [] };
    }
    return { rows: [] };
  },
}));

const { startDailyRun, playDailyMove, resumeDailyRun, dailyStatus } = await import("./daily.js");

const DAY = "2026-08-12";
const USER = "user-1";

/** Play until the run completes, banking as soon as there is anything to bank. */
async function playOut(user = USER) {
  for (let i = 0; i < 400; i++) {
    const run = await resumeDailyRun(user, DAY);
    if (!run) break;
    const move = run.state.turn.turnScore > 0 && !run.state.turn.outcome ? "BANK" : "ROLL";
    await playDailyMove(user, move, DAY);
  }
}

beforeEach(() => {
  rows.clear();
  bestTurns.clear();
});

describe("claiming a run", () => {
  it("creates the run on start, before a single move is played", async () => {
    await startDailyRun(USER, DAY);
    expect(rows.has(key(USER, DAY))).toBe(true);
  });

  it("starting again returns the run in progress, not a fresh one", async () => {
    const first = await startDailyRun(USER, DAY);
    await playDailyMove(USER, "ROLL", DAY);
    const seed = rows.get(key(USER, DAY))!.seed;

    const second = await startDailyRun(USER, DAY);
    // Same seed, and the throw already played is still there — this is the
    // exact move that used to hand out a brand-new board.
    expect(rows.get(key(USER, DAY))!.seed).toBe(seed);
    expect(second.state.turn.rollCount).toBeGreaterThan(0);
    expect(second.state.turn.dice).not.toEqual(first.state.turn.dice);
  });

  it("resuming after leaving returns the same position, not a new deal", async () => {
    await startDailyRun(USER, DAY);
    await playDailyMove(USER, "ROLL", DAY);
    const a = await resumeDailyRun(USER, DAY);
    const b = await resumeDailyRun(USER, DAY);
    expect(b!.state.turn.dice).toEqual(a!.state.turn.dice);
    expect(b!.turns).toBe(a!.turns);
  });

  it("refuses moves for a run that was never started", async () => {
    await expect(playDailyMove(USER, "ROLL", DAY)).rejects.toThrow(/start today's run/i);
  });
});

describe("the seed is the server's", () => {
  it("gives two players different dice on the same day", async () => {
    const a = await startDailyRun("player-a", DAY);
    const b = await startDailyRun("player-b", DAY);
    await playDailyMove("player-a", "ROLL", DAY);
    await playDailyMove("player-b", "ROLL", DAY);
    const after = [await resumeDailyRun("player-a", DAY), await resumeDailyRun("player-b", DAY)];
    expect(after[0]!.state.turn.dice).not.toEqual(after[1]!.state.turn.dice);
    expect(a.state.turn.dice).toEqual(b.state.turn.dice); // both un-rolled to begin with
  });

  it("is not derived from the day and player, so it cannot be recomputed", async () => {
    // Two players on the same day, and the same player on two runs, must not
    // land on a predictable value. Seeds are random per run.
    const seeds = new Set<number>();
    for (let i = 0; i < 20; i++) {
      rows.clear();
      await startDailyRun(USER, DAY);
      seeds.add(rows.get(key(USER, DAY))!.seed);
    }
    // A derived seed would give the same value all 20 times.
    expect(seeds.size).toBeGreaterThan(1);
  });
});

describe("a run is one attempt", () => {
  it("rejects further moves once the run is complete", async () => {
    await startDailyRun(USER, DAY);
    await playOut();
    expect(rows.get(key(USER, DAY))!.complete).toBe(true);
    await expect(playDailyMove(USER, "ROLL", DAY)).rejects.toThrow(/already played/i);
  });

  it("will not re-open a finished run by starting again", async () => {
    await startDailyRun(USER, DAY);
    await playOut();
    const score = rows.get(key(USER, DAY))!.score;
    const moves = rows.get(key(USER, DAY))!.moves;

    await startDailyRun(USER, DAY);
    expect(rows.get(key(USER, DAY))!.score).toBe(score);
    expect(rows.get(key(USER, DAY))!.moves).toBe(moves);
    expect(await resumeDailyRun(USER, DAY)).toBeNull();
  });

  it("plays exactly DAILY_TURNS turns", async () => {
    await startDailyRun(USER, DAY);
    await playOut();
    expect(rows.get(key(USER, DAY))!.turns).toBe(10);
  });
});

describe("runs recorded before the seed was stored", () => {
  /**
   * A row written by the old scheme: its moves belong to a seed derived from
   * (day, player), while the `seed` column defaulted to 0. Replaying those
   * moves against 0 meets different dice and lands short of the turn limit, so
   * anything that infers completion from a replay will offer a finished run
   * back as playable.
   */
  const LEGACY_MOVES = "ROLL,ROLL,BANK,ROLL,BANK,ROLL,ROLL,BANK,ROLL,BANK";

  function legacyRow() {
    rows.set(key(USER, DAY), {
      moves: LEGACY_MOVES,
      seed: 0,
      complete: true,
      score: 2550,
      turns: 10,
    });
  }

  it("has a replay that really does disagree with the stored flag", () => {
    // Guards the fixture. If these moves happened to complete when replayed
    // against seed 0, everything below would pass without exercising the bug.
    const pos = dailyPosition(0, LEGACY_MOVES.split(",") as DailyMove[]);
    expect(pos.result.complete).toBe(false);
    expect(pos.turns).toBeLessThan(10);
  });

  it("is not offered as a run to resume", async () => {
    legacyRow();
    expect(await resumeDailyRun(USER, DAY)).toBeNull();
  });

  it("cannot be played on", async () => {
    legacyRow();
    await expect(playDailyMove(USER, "ROLL", DAY)).rejects.toThrow(/already played/i);
  });

  it("is not reopened or overwritten by starting again", async () => {
    legacyRow();
    const view = await startDailyRun(USER, DAY);
    expect(view.complete).toBe(true);
    const row = rows.get(key(USER, DAY))!;
    expect(row.score).toBe(2550);
    expect(row.seed).toBe(0);
  });
});

describe("moves only ever append", () => {
  it("stores one more move per accepted action", async () => {
    await startDailyRun(USER, DAY);
    await playDailyMove(USER, "ROLL", DAY);
    expect(rows.get(key(USER, DAY))!.moves).toBe("ROLL");
    await playDailyMove(USER, "BANK", DAY);
    expect(rows.get(key(USER, DAY))!.moves).toBe("ROLL,BANK");
  });

  it("rejects an illegal move instead of silently dropping it", async () => {
    await startDailyRun(USER, DAY);
    // Banking before rolling is not legal, so the run must not advance.
    await expect(playDailyMove(USER, "BANK", DAY)).rejects.toThrow(/isn't legal/i);
    expect(rows.get(key(USER, DAY))!.moves).toBe("");
  });

  it("rejects anything that isn't a ROLL or a BANK", async () => {
    await startDailyRun(USER, DAY);
    await expect(playDailyMove(USER, "ADVANCE", DAY)).rejects.toThrow(/invalid move/i);
    await expect(playDailyMove(USER, { type: "ROLL" }, DAY)).rejects.toThrow(/invalid move/i);
  });
});

describe("the board is a reward for playing", () => {
  /** Somebody else's finished run, so there is always a board to withhold. */
  async function anotherPlayerFinishes(user = "user-2") {
    await startDailyRun(user, DAY);
    await playOut(user);
  }

  it("sends no scores to a player who hasn't started", async () => {
    await anotherPlayerFinishes();
    const status = await dailyStatus(USER, DAY);
    expect(status.leaderboard).toEqual([]);
    expect(status.run).toBe(null);
    expect(status.yourRank).toBe(null);
  });

  it("sends no scores mid-run either — the whole point is not knowing yet", async () => {
    await anotherPlayerFinishes();
    await startDailyRun(USER, DAY);
    await playDailyMove(USER, "ROLL", DAY);
    expect((await dailyStatus(USER, DAY)).leaderboard).toEqual([]);
  });

  it("opens the board once the run is finished", async () => {
    await anotherPlayerFinishes();
    await startDailyRun(USER, DAY);
    await playOut(USER);
    const status = await dailyStatus(USER, DAY);
    expect(status.leaderboard.length).toBe(2);
    expect(status.run?.complete).toBe(true);
    expect(status.yourRank).not.toBe(null);
    // Own row is marked, which is what the board highlights.
    expect(status.leaderboard.some((e) => e.you)).toBe(true);
  });

  it("still says how many people have played, which gives nothing away", async () => {
    await anotherPlayerFinishes();
    await anotherPlayerFinishes("user-3");
    const status = await dailyStatus(USER, DAY);
    expect(status.players).toBe(2);
    expect(status.leaderboard).toEqual([]);
  });
});

describe("holding dice in a daily run", () => {
  it("records the hold in the move list, so a replay meets the same dice", async () => {
    await startDailyRun(USER, DAY);
    await playDailyMove(USER, "ROLL", DAY);
    const held = await resumeDailyRun(USER, DAY);
    // The seed is random per run, so the opening throw is whatever it is: a
    // bust leaves no live turn to hold dice in, and every die scoring leaves
    // none loose. Neither is what this test is about.
    if (held!.state.turn.outcome) return;
    const before = held!.state.turn.locked.findIndex((l) => !l);
    if (before < 0) return;
    await playDailyMove(USER, ("H" + before) as "H0", DAY);
    expect(rows.get(key(USER, DAY))!.moves.split(",")).toContain("H" + before);
    const after = await resumeDailyRun(USER, DAY);
    expect(after!.state.turn.locked[before]).toBe(true);
  });

  it("puts a held die back, and the tally with it", async () => {
    await startDailyRun(USER, DAY);
    await playDailyMove(USER, "ROLL", DAY);
    const run = await resumeDailyRun(USER, DAY);
    if (run!.state.turn.outcome) return; // busted opening throw
    const paying = run!.state.turn.locked.findIndex(Boolean);
    if (paying < 0) return;
    const before = run!.state.turn.turnScore;
    await playDailyMove(USER, ("H" + paying) as "H0", DAY);
    const after = await resumeDailyRun(USER, DAY);
    expect(after!.state.turn.locked[paying]).toBe(false);
    expect(after!.state.turn.turnScore).toBeLessThan(before);
  });

  it("refuses a hold before the first throw, and anything that is not a move", async () => {
    await startDailyRun(USER, DAY);
    await expect(playDailyMove(USER, "H0", DAY)).rejects.toThrow(/isn't legal/i);
    await expect(playDailyMove(USER, "H5", DAY)).rejects.toThrow(/invalid move/i);
    await expect(playDailyMove(USER, "HOLD", DAY)).rejects.toThrow(/invalid move/i);
  });
});

describe("a daily turn counts toward the career best", () => {
  it("raises the account's best turn when a run banks a bigger one", async () => {
    await startDailyRun(USER, DAY);
    await playOut();
    const run = dailyPosition(
      rows.get(key(USER, DAY))!.seed,
      rows.get(key(USER, DAY))!.moves.split(",") as DailyMove[],
    );
    // Whatever the run's best turn was, the account has at least that.
    expect(bestTurns.get(USER) ?? 0).toBe(run.result.bestTurn);
    expect(run.result.bestTurn).toBeGreaterThan(0);
  });

  it("writes it as the run goes, not only at the end", async () => {
    await startDailyRun(USER, DAY);
    // Play until the first turn is banked; the best turn exists from then on.
    for (let i = 0; i < 40; i++) {
      const run = await resumeDailyRun(USER, DAY);
      if (!run) break;
      const banked = run.state.turn.turnScore > 0 && !run.state.turn.outcome;
      await playDailyMove(USER, banked ? "BANK" : "ROLL", DAY);
      if (banked) break;
    }
    const stored = dailyPosition(
      rows.get(key(USER, DAY))!.seed,
      rows.get(key(USER, DAY))!.moves.split(",") as DailyMove[],
    );
    if (stored.result.bestTurn > 0) {
      expect(bestTurns.get(USER)).toBe(stored.result.bestTurn);
    }
  });

  it("never lowers a career best that is already higher", async () => {
    bestTurns.set(USER, 99999);
    await startDailyRun(USER, DAY);
    await playOut();
    expect(bestTurns.get(USER)).toBe(99999);
  });
});

describe("the podium badge settles when the day does", () => {
  const YESTERDAY = "2026-08-11";

  /** A finished run on a given day, at a given score. */
  function record(user: string, day: string, score: number) {
    rows.set(`${user}|${day}`, { moves: "", seed: 1, complete: true, score, turns: 10 });
  }

  it("is not earned by topping a board that is still open", async () => {
    // The cheese: play the moment the day resets, when almost nobody has.
    record(USER, DAY, 3000);
    const status = await dailyStatus(USER, DAY);
    expect(status.yourRank).toBe(1); // top of today, for what that is worth
    expect(status.eliteEarned).toBe(false);
  });

  it("is earned once that day has closed with you in the top ten", async () => {
    record(USER, YESTERDAY, 3000);
    expect((await dailyStatus(USER, DAY)).eliteEarned).toBe(true);
  });

  it("is not earned by finishing eleventh on a closed day", async () => {
    for (let i = 0; i < 10; i++) record("rival-" + i, YESTERDAY, 5000 + i);
    record(USER, YESTERDAY, 1000);
    expect((await dailyStatus(USER, DAY)).eliteEarned).toBe(false);
  });

  it("counts a top-ten finish on a crowded closed day", async () => {
    for (let i = 0; i < 30; i++) record("rival-" + i, YESTERDAY, 100 + i);
    record(USER, YESTERDAY, 9000);
    expect((await dailyStatus(USER, DAY)).eliteEarned).toBe(true);
  });

  it("ignores a scoreless run", async () => {
    record(USER, YESTERDAY, 0);
    expect((await dailyStatus(USER, DAY)).eliteEarned).toBe(false);
  });
});
