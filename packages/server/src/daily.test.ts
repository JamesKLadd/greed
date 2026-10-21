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
  /** The run's biggest single turn — the board's tiebreak. See ranking.ts. */
  bestTurn: number;
}
const completions = new Set<string>();
const portraits = new Map<string, unknown>();
const rows = new Map<string, Row>();
const key = (user: string, day: string) => `${user}|${day}`;
/** Career best turn per user, as the users table would hold it. */
const bestTurns = new Map<string, number>();
/** Daily first places written back onto the account. */
const dailyWins = new Map<string, number>();
/**
 * The career column the BOARDS rank and the screens now read — distinct from
 * the profile copy above, which is a different number with a different owner.
 */
const careerDailyWins = new Map<string, number>();
/** Periods already written to the challenge_wins ledger. */
const banked = new Set<string>();

/** Finished runs for a day, best first — the order the board is built in. */
function finished(day: string): { user: string; row: Row }[] {
  return (
    [...rows.entries()]
      .filter(([k, row]) => k.endsWith(`|${day}`) && row.complete)
      .map(([k, row]) => ({ user: k.split("|")[0], row }))
      // Mirrors DAILY_ORDER: score, then the run's best turn. The sort is
      // stable, so runs level on both keep insertion order, which stands in for
      // the real query's created_at tiebreak.
      .sort((a, b) => b.row.score - a.row.score || b.row.bestTurn - a.row.bestTurn)
  );
}

/**
 * Every day that has CLOSED, as its final board.
 *
 * Days strictly before `today`, scoreless runs dropped — the same filter the
 * ranking statements apply. Sorting is stable, so equal scores keep insertion
 * order, which stands in for the real query's created_at tiebreak.
 */
function closedBoards(today: string): Map<string, { user: string; row: Row }[]> {
  const days = new Set(
    [...rows.entries()]
      .filter(([, row]) => row.complete && row.score > 0)
      .map(([k]) => k.split("|")[1])
      .filter((d) => d < today),
  );
  const out = new Map<string, { user: string; row: Row }[]>();
  for (const day of days) {
    out.set(
      day,
      finished(day).filter((e) => e.row.score > 0),
    );
  }
  return out;
}

// A stub that understands only the handful of statements daily.ts issues.
vi.mock("./db.js", () => ({
  withChallengeTransaction: vi.fn(async <T>(_user: string, work: () => Promise<T>) => work()),
  query: async (sql: string, params: unknown[] = []) => {
    if (sql.includes("INSERT INTO career_stats") && sql.includes("daily_wins")) {
      // The refresh: bank each closed period's winner the first time it is
      // seen, and add it on — as the real statement does through the
      // challenge_wins ledger. A period already banked is never counted again.
      const [today] = params as [string];
      for (const [period, board] of closedBoards(today)) {
        if (!board.length || banked.has(period)) continue;
        banked.add(period);
        careerDailyWins.set(board[0].user, (careerDailyWins.get(board[0].user) ?? 0) + 1);
      }
      return { rows: [] };
    }
    if (sql.includes("daily_wins AS wins FROM career_stats")) {
      const [ids] = params as [string[]];
      return {
        rows: ids
          .filter((id) => careerDailyWins.has(id))
          .map((id) => ({ user_id: id, wins: careerDailyWins.get(id) })),
      };
    }
    const [user, day] = params as [string, string];
    // ---- dailyStatus reads (their params are NOT [user, day]) ----
    // Two statements rank across every closed day; they are told apart by what
    // they select, NOT by the shared "PARTITION BY day" they both contain.
    if (sql.includes("FILTER (WHERE rank = 1)")) {
      // Wins and podiums per account: [userIds, today, podiumCap].
      const [ids, today, cap] = params as [string[], string, number];
      return {
        rows: ids
          .map((id) => {
            let wins = 0;
            let podiums = 0;
            for (const [rowDay, board] of closedBoards(today)) {
              void rowDay;
              const at = board.findIndex((e) => e.user === id);
              if (at < 0) continue;
              if (at === 0) wins += 1;
              if (at + 1 <= cap) podiums += 1;
            }
            return { user_id: id, wins: String(wins), podiums: String(podiums) };
          })
          .filter((r) => r.wins !== "0" || r.podiums !== "0"),
      };
    }
    if (sql.includes("WHERE k.rank = 1")) {
      // Every closed day's winner, newest day first: [today, limit].
      const [today, limit] = params as [string, number];
      return {
        rows: [...closedBoards(today)]
          .sort((a, b) => (a[0] < b[0] ? 1 : -1))
          .slice(0, limit)
          .map(([day, board]) => ({
            username: `player-${board[0].user}`,
            avatar: null,
            visual_beta: sql.includes("AS visual_beta") ? portraits.get(board[0].user) : undefined,
            day,
            score: board[0].row.score,
            user_id: board[0].user,
          })),
      };
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
            super_busts: 0,
            hot_dice: 0,
            best_turn: row.bestTurn,
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
          avatar: null,
          visual_beta: sql.includes("AS visual_beta") ? portraits.get(e.user) : undefined,
          score: e.row.score,
          turns: e.row.turns,
          best_turn: e.row.bestTurn,
          busts: 0,
          super_busts: 0,
          hot_dice: 0,
          user_id: e.user,
          rank: String(i + 1),
        })),
      };
    }
    if (sql.includes("COUNT(*)::text")) {
      return { rows: [{ n: String(finished(params[0] as string).length) }] };
    }
    if (sql.includes("INSERT INTO daily_completions")) {
      completions.add(key(user, day));
      return { rows: [] };
    }
    if (sql.includes("WITH RECURSIVE streak_days")) {
      let streak = 0;
      const cursor = new Date(`${day}T00:00:00Z`);
      while (completions.has(key(user, cursor.toISOString().slice(0, 10)))) {
        streak += 1;
        cursor.setUTCDate(cursor.getUTCDate() - 1);
      }
      return { rows: [{ streak: String(streak) }] };
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
        rows.set(k, {
          moves: "",
          seed: Number(params[2]),
          complete: false,
          score: 0,
          turns: 0,
          bestTurn: 0,
        });
      }
      return { rows: [] };
    }
    if (sql.includes("UPDATE users") && sql.includes("dailyWins")) {
      const [id, wins] = params as [string, number];
      dailyWins.set(id, Math.max(dailyWins.get(id) ?? 0, wins));
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
const { withChallengeTransaction } = await import("./db.js");

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
  completions.clear();
  portraits.clear();
  rows.clear();
  bestTurns.clear();
  dailyWins.clear();
  careerDailyWins.clear();
  banked.clear();
});

describe("claiming a run", () => {
  it("chooses the new challenge day if a queued start crosses midnight", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-09T04:59:59Z"));
      vi.mocked(withChallengeTransaction).mockImplementationOnce(async (_user, work) => {
        vi.setSystemTime(new Date("2026-10-09T05:00:00Z"));
        return work();
      });
      await startDailyRun(USER);
      expect(rows.has(key(USER, "2026-10-08"))).toBe(false);
      expect(rows.has(key(USER, "2026-10-09"))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

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
  it("redacts prediction inputs from start, move, resume and finished views", async () => {
    let view = await startDailyRun(USER, DAY);
    const check = (candidate: typeof view) => {
      const wire = JSON.parse(JSON.stringify(candidate));
      expect(wire.state.config.seed).toBe(0);
      expect(wire.state.rng).toBe(0);
      expect(wire).not.toHaveProperty("seed");
    };
    check(view);
    view = await playDailyMove(USER, "ROLL", DAY);
    check(view);
    check((await resumeDailyRun(USER, DAY))!);
    check(await startDailyRun(USER, DAY));

    for (let guard = 0; !view.complete && guard < 400; guard++) {
      view = await playDailyMove(
        USER,
        !view.state.turn.outcome && view.state.turn.turnScore > 0 ? "BANK" : "ROLL",
        DAY,
      );
      check(view);
    }
    expect(view.complete).toBe(true);
    const row = rows.get(key(USER, DAY))!;
    const replay = dailyPosition(row.seed, row.moves.split(",") as DailyMove[]);
    expect(view.state.turn).toEqual(replay.state.turn);
    expect(view.state.players).toEqual(replay.state.players);
    expect(replay.state.config.seed).toBe(row.seed);
  });

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
      bestTurn: 0,
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

    // Which second move is legal depends on how the opening throw fell, so read
    // the position rather than assume it. This used to bank unconditionally,
    // and the seed a run is dealt is the server's own `randomInt` — about one
    // opening throw in ten busts, leaving nothing to bank, and the test failed
    // on a run that was behaving perfectly. A test that is red one push in ten
    // for no reason teaches you to ignore the build.
    const run = (await resumeDailyRun(USER, DAY))!;
    const second = run.state.turn.turnScore > 0 && !run.state.turn.outcome ? "BANK" : "ROLL";
    await playDailyMove(USER, second, DAY);
    expect(rows.get(key(USER, DAY))!.moves).toBe(`ROLL,${second}`);
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

    // A die can only go back while another is held — the last one stays put, or
    // the throw would be free. So if this throw paid a single die, pick up a
    // loose one first.
    if (run!.state.turn.locked.filter(Boolean).length === 1) {
      const loose = run!.state.turn.locked.findIndex((l) => !l);
      await playDailyMove(USER, ("H" + loose) as "H0", DAY);
    }

    await playDailyMove(USER, ("H" + paying) as "H0", DAY);
    const after = await resumeDailyRun(USER, DAY);
    expect(after!.state.turn.locked[paying]).toBe(false);
    expect(after!.state.turn.turnScore).toBeLessThan(before);
  });

  it("refuses to put back the last held die", async () => {
    // The rule the engine applies, enforced on the server too: the daily is one
    // of the two modes whose dice the server owns, so it must not be the place
    // a free throw is still available.
    await startDailyRun(USER, DAY);
    let view = await playDailyMove(USER, "ROLL", DAY);
    for (let i = 0; i < 8; i++) {
      if (view.complete) break;
      if (!view.state.turn.outcome && view.state.turn.locked.some(Boolean)) break;
      view = await playDailyMove(USER, "ROLL", DAY);
    }
    // Release down to a single held die; each of those taps is legal.
    for (let i = 0; i < 5; i++) {
      if (view.state.turn.locked.filter(Boolean).length === 1) break;
      if (view.state.turn.locked[i]) view = await playDailyMove(USER, ("H" + i) as "H0", DAY);
    }
    expect(view.state.turn.locked.filter(Boolean).length).toBe(1);
    const only = view.state.turn.locked.findIndex(Boolean);
    await expect(playDailyMove(USER, ("H" + only) as "H0", DAY)).rejects.toThrow(/isn't legal/i);
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
  function record(user: string, day: string, score: number, bestTurn = 0) {
    rows.set(`${user}|${day}`, {
      moves: "",
      seed: 1,
      complete: true,
      score,
      turns: 10,
      bestTurn,
    });
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

describe("winning a day", () => {
  const YESTERDAY = "2026-08-11";
  const BEFORE = "2026-08-10";

  /** A finished run on a given day, at a given score. */
  function record(user: string, day: string, score: number, bestTurn = 0) {
    rows.set(`${user}|${day}`, {
      moves: "",
      seed: 1,
      complete: true,
      score,
      turns: 10,
      bestTurn,
    });
  }

  it("counts a first place on a day that has closed", async () => {
    record(USER, YESTERDAY, 3000);
    record("rival", YESTERDAY, 2000);
    expect((await dailyStatus(USER, DAY)).wins).toBe(1);
  });

  it("does not count leading a day that is still open", async () => {
    // The same cheese the podium badge closes: top of today means little at
    // 00:05, and today's board can still change.
    record(USER, DAY, 9000);
    expect((await dailyStatus(USER, DAY)).wins).toBe(0);
  });

  it("does not count second place", async () => {
    record("rival", YESTERDAY, 5000);
    record(USER, YESTERDAY, 4999);
    expect((await dailyStatus(USER, DAY)).wins).toBe(0);
  });

  it("adds up across days", async () => {
    record(USER, YESTERDAY, 3000);
    record("rival", YESTERDAY, 100);
    record(USER, BEFORE, 2000);
    record("rival", BEFORE, 1900);
    expect((await dailyStatus(USER, DAY)).wins).toBe(2);
  });

  it("banks the count where the Stats screen will read it", async () => {
    // It used to be written onto the profile blob as well, which made a second
    // copy that could disagree — and did. The career tally is the only one now;
    // the profile picks it up from there on its way to the client.
    record(USER, YESTERDAY, 3000);
    await dailyStatus(USER, DAY);
    expect(careerDailyWins.get(USER)).toBe(1);
    expect(dailyWins.has(USER)).toBe(false);
  });

  it("keeps a win after the run that earned it has been pruned", async () => {
    // The reported bug, in miniature: four wins, two more won, still four.
    // The tally was GREATEST(stored, a count of the runs still on file), and
    // the runs are only kept thirty days — so as old winning days were pruned
    // and new ones won, the count taken from the runs stayed where it was and
    // the high-water mark never moved. Wins have to be ADDED, once each.
    record(USER, BEFORE, 3000);
    record(USER, YESTERDAY, 3000);
    await dailyStatus(USER, "2026-08-12");
    expect(careerDailyWins.get(USER)).toBe(2);

    // The retention sweep takes both runs; two new days are won.
    rows.delete(`${USER}|${BEFORE}`);
    rows.delete(`${USER}|${YESTERDAY}`);
    record(USER, "2026-08-12", 3000);
    record(USER, "2026-08-13", 3000);
    const status = await dailyStatus(USER, "2026-08-14");
    expect(status.wins).toBe(4);
    expect(careerDailyWins.get(USER)).toBe(4);
  });

  it("counts a closed day once, however often the board is read", async () => {
    record(USER, YESTERDAY, 3000);
    for (let i = 0; i < 3; i++) await dailyStatus(USER, DAY);
    expect(careerDailyWins.get(USER)).toBe(1);
  });

  it("ignores a scoreless day nobody won", async () => {
    record(USER, YESTERDAY, 0);
    const status = await dailyStatus(USER, DAY);
    expect(status.wins).toBe(0);
    expect(status.champion).toBe(null);
  });
});

describe("ties on the daily board", () => {
  const DAY = "2026-08-12";
  const YESTERDAY = "2026-08-11";

  function record(user: string, day: string, score: number, bestTurn = 0) {
    rows.set(`${user}|${day}`, {
      moves: "",
      seed: 1,
      complete: true,
      score,
      turns: 10,
      bestTurn,
    });
  }

  it("puts the bigger single turn first when two players finish level", async () => {
    // The same rule the weekly took: a day settled purely on who got there
    // first rewards playing at the right hour rather than playing well.
    record(USER, DAY, 3000, 2000); // the viewer, in first by arrival...
    record("rival", DAY, 3000, 2400); // ...but beaten on the run itself
    const board = (await dailyStatus(USER, DAY)).leaderboard;
    expect(board.map((e) => e.username)).toEqual(["player-rival", `player-${USER}`]);
    expect(board.map((e) => e.rank)).toEqual([1, 2]);
  });

  it("still ranks on score before anything else", async () => {
    record(USER, DAY, 3200, 400);
    record("rival", DAY, 3000, 3000);
    const board = (await dailyStatus(USER, DAY)).leaderboard;
    expect(board.map((e) => e.username)).toEqual([`player-${USER}`, "player-rival"]);
  });

  it("credits the win to the player the board shows first", async () => {
    // The agreement that matters: a tally disagreeing with the board hands a
    // win to somebody who is not shown in first place.
    record(USER, YESTERDAY, 3000, 2000);
    record("rival", YESTERDAY, 3000, 2400);
    const status = await dailyStatus(USER, DAY);
    expect(status.champion?.username).toBe("player-rival");
    // And the viewer, who led on arrival, is credited with nothing.
    expect(dailyWins.get(USER) ?? 0).toBe(0);
  });
});

describe("the reigning champion", () => {
  const YESTERDAY = "2026-08-11";
  const BEFORE = "2026-08-10";

  function record(user: string, day: string, score: number, bestTurn = 0) {
    rows.set(`${user}|${day}`, {
      moves: "",
      seed: 1,
      complete: true,
      score,
      turns: 10,
      bestTurn,
    });
  }

  it("is whoever took the most recent day that finished", async () => {
    record("winner", YESTERDAY, 4000);
    record("runner-up", YESTERDAY, 3000);
    record("old-winner", BEFORE, 9000);
    const status = await dailyStatus(USER, DAY);
    expect(status.champion?.username).toBe("player-winner");
    expect(status.champion?.score).toBe(4000);
    expect(status.champion?.day).toBe(YESTERDAY);
  });

  it("lists every past winner, newest day first", async () => {
    record("a", YESTERDAY, 4000);
    record("b", BEFORE, 9000);
    const { champions } = await dailyStatus(USER, DAY);
    expect(champions.map((c) => c.day)).toEqual([YESTERDAY, BEFORE]);
    expect(champions.map((c) => c.username)).toEqual(["player-a", "player-b"]);
  });

  it("names nobody before any day has closed", async () => {
    record(USER, DAY, 5000);
    const status = await dailyStatus(USER, DAY);
    expect(status.champion).toBe(null);
    expect(status.champions).toEqual([]);
  });

  it("is announced before this player's own run is in", async () => {
    // The roll of champions is drawn from CLOSED days only, so it gives nothing
    // away about today — unlike the board, which stays withheld.
    record("winner", YESTERDAY, 4000);
    record("someone", DAY, 2500);
    const status = await dailyStatus(USER, DAY);
    expect(status.run).toBe(null);
    expect(status.leaderboard).toEqual([]);
    expect(status.champion?.username).toBe("player-winner");
  });

  it("wears the crown on today's board", async () => {
    record("winner", YESTERDAY, 4000);
    record("winner", DAY, 1000);
    record(USER, DAY, 500);
    const status = await dailyStatus(USER, DAY);
    expect(status.leaderboard.find((e) => e.username === "player-winner")?.crown).toBe(true);
    expect(status.leaderboard.find((e) => e.you)?.crown).toBeUndefined();
  });
});

describe("reading another player's run", () => {
  const YESTERDAY = "2026-08-11";

  function record(user: string, day: string, score: number, bestTurn = 0) {
    rows.set(`${user}|${day}`, {
      moves: "",
      seed: 1,
      complete: true,
      score,
      turns: 10,
      bestTurn,
    });
  }

  it("carries what the close-up shows: their best turn, busts, hot dice and wins", async () => {
    record("rival", YESTERDAY, 4000);
    record("rival", DAY, 3000);
    record(USER, DAY, 2000);
    const row = (await dailyStatus(USER, DAY)).leaderboard.find(
      (e) => e.username === "player-rival",
    );
    expect(row).toBeDefined();
    expect(row).toMatchObject({ busts: 0, hotDice: 0, bestTurn: 0, wins: 1 });
  });

  it("stays withheld until this player's own run is in", async () => {
    record("rival", DAY, 3000);
    const status = await dailyStatus(USER, DAY);
    expect(status.leaderboard).toEqual([]);
    expect(status.friendsLeaderboard).toEqual([]);
  });
});

describe("equipped challenge portraits", () => {
  it("sends the account portrait on board rows and past winners", async () => {
    const look = {
      version: 1,
      mascot: "owl",
      frame: "neon",
      background: "stars",
      nameplate: "ticket",
      hat: "none",
      badge: "",
    };
    portraits.set(USER, look);
    for (const day of [DAY, "2026-08-11"]) {
      rows.set(key(USER, day), {
        moves: "",
        seed: 1,
        complete: true,
        score: 1200,
        turns: 10,
        bestTurn: 500,
      });
    }
    const status = await dailyStatus(USER, DAY);
    expect(status.leaderboard[0].visualBeta).toEqual(look);
    expect(status.champion?.visualBeta).toEqual(look);
    expect(status.champions[0].visualBeta).toEqual(look);
    expect(status.champion).not.toHaveProperty("userId");

    portraits.set(USER, { ...look, mascot: "panda" });
    expect((await dailyStatus(USER, DAY)).leaderboard[0].visualBeta?.mascot).toBe("panda");
  });

  it("keeps old accounts and malformed portrait data readable", async () => {
    rows.set(key(USER, DAY), {
      moves: "",
      seed: 1,
      complete: true,
      score: 1200,
      turns: 10,
      bestTurn: 500,
    });
    expect((await dailyStatus(USER, DAY)).leaderboard[0].visualBeta).toBeUndefined();
    portraits.set(USER, "invalid");
    expect((await dailyStatus(USER, DAY)).leaderboard[0].visualBeta).toBeUndefined();
  });
});

describe("daily streak completion recording", () => {
  it("counts beyond 31 and 400 days after old run records are gone", async () => {
    const cursor = new Date(`${DAY}T00:00:00Z`);
    for (let n = 0; n < 450; n++) {
      completions.add(key(USER, cursor.toISOString().slice(0, 10)));
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    expect(rows.size).toBe(0);
    expect((await dailyStatus(USER, DAY)).streak).toBe(450);
    completions.delete(key(USER, "2026-08-11"));
    expect((await dailyStatus(USER, DAY)).streak).toBe(1);
    completions.delete(key(USER, DAY));
    expect((await dailyStatus(USER, DAY)).streak).toBe(0);
  });

  it("only counts a finished run and retains it after the replay log expires", async () => {
    await startDailyRun(USER, DAY);
    await playDailyMove(USER, "ROLL", DAY);
    expect((await dailyStatus(USER, DAY)).streak).toBe(0);
    expect(completions.size).toBe(0);
    await playOut();
    expect((await dailyStatus(USER, DAY)).streak).toBe(1);
    expect(completions.size).toBe(1);
    await expect(playDailyMove(USER, "ROLL", DAY)).rejects.toThrow(/already played/i);
    expect(completions.size).toBe(1);
    rows.clear();
    expect((await dailyStatus(USER, DAY)).streak).toBe(1);
  });
});
