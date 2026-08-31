/**
 * The weekly challenge's rules and guarantees, against the real replay and
 * storage logic with the database stubbed in memory.
 *
 * The weekly gives away the thing the daily protects — you may attempt it as
 * often as you like — so what has to be pinned here is everything that stops
 * that becoming a way to get free dice. An attempt is dealt a fresh secret
 * seed, only one may be open at a time, and a week that has closed can never be
 * scored into again.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { weeklyPosition, type WeeklyMove } from "@greed/core";

/** The one attempt a player has open, keyed by user. */
interface Open {
  week: string;
  seed: number;
  moves: string;
}
/** A player's best attempt in a week, as weekly_runs would hold it. */
interface Best {
  score: number;
  turns: number;
  banks: number;
  busts: number;
  hotDice: number;
  bestTurn: number;
  seed: number;
  moves: string;
  attempts: number;
  /** Stands in for best_at: the ordinal of the write that set the score. */
  bestAt: number;
}

const open = new Map<string, Open>();
const best = new Map<string, Best>();
const key = (user: string, week: string) => `${user}|${week}`;
/** Career best turn per user, as the users table would hold it. */
const bestTurns = new Map<string, number>();
/** Weekly first places written back onto the account. */
const weeklyWins = new Map<string, number>();
/** Monotonic clock standing in for now(), so best_at ordering is checkable. */
let clock = 0;

/** Every row in a week, best first — the order the board is built in. */
function boardFor(week: string): { user: string; row: Best }[] {
  return [...best.entries()]
    .filter(([k]) => k.endsWith(`|${week}`))
    .map(([k, row]) => ({ user: k.split("|")[0], row }))
    .sort((a, b) => b.row.score - a.row.score || a.row.bestAt - b.row.bestAt);
}

/** Every week that has CLOSED, as its final board. */
function closedBoards(thisWeek: string): Map<string, { user: string; row: Best }[]> {
  const weeks = new Set(
    [...best.entries()]
      .filter(([, row]) => row.score > 0)
      .map(([k]) => k.split("|")[1])
      .filter((w) => w < thisWeek),
  );
  const out = new Map<string, { user: string; row: Best }[]>();
  for (const week of weeks) {
    out.set(
      week,
      boardFor(week).filter((e) => e.row.score > 0),
    );
  }
  return out;
}

// A stub that understands only the statements weekly.ts issues. Ordered
// most-specific first: several of them mention the same tables.
vi.mock("./db.js", () => ({
  query: async (sql: string, params: unknown[] = []) => {
    if (sql.includes("FILTER (WHERE rank = 1)")) {
      // Wins and podiums per account on closed weeks: [userIds, thisWeek, cap].
      const [ids, thisWeek, cap] = params as [string[], string, number];
      return {
        rows: ids
          .map((id) => {
            let wins = 0;
            let podiums = 0;
            for (const [, board] of closedBoards(thisWeek)) {
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
      // Every closed week's winner, newest week first: [thisWeek, limit].
      const [thisWeek, limit] = params as [string, number];
      return {
        rows: [...closedBoards(thisWeek)]
          .sort((a, b) => (a[0] < b[0] ? 1 : -1))
          .slice(0, limit)
          .map(([week, board]) => ({
            username: `player-${board[0].user}`,
            avatar: null,
            week,
            score: board[0].row.score,
            user_id: board[0].user,
          })),
      };
    }
    if (sql.includes("FROM ranked WHERE user_id = $2")) {
      // The requesting player's own standing: [week, userId].
      const board = boardFor(params[0] as string);
      const i = board.findIndex((e) => e.user === (params[1] as string));
      if (i < 0) return { rows: [] };
      const { row } = board[i];
      return {
        rows: [
          {
            score: row.score,
            turns: row.turns,
            banks: row.banks,
            busts: row.busts,
            hot_dice: row.hotDice,
            best_turn: row.bestTurn,
            attempts: row.attempts,
            rank: String(i + 1),
          },
        ],
      };
    }
    if (sql.includes("JOIN users u ON u.id = r.user_id")) {
      // The board itself: [week, top].
      return {
        rows: boardFor(params[0] as string).map((e, i) => ({
          username: `player-${e.user}`,
          avatar: null,
          score: e.row.score,
          turns: e.row.turns,
          best_turn: e.row.bestTurn,
          busts: e.row.busts,
          hot_dice: e.row.hotDice,
          attempts: e.row.attempts,
          user_id: e.user,
          rank: String(i + 1),
        })),
      };
    }
    if (sql.includes("COUNT(*)::text")) {
      return { rows: [{ n: String(boardFor(params[0] as string).length) }] };
    }
    if (sql.includes("week <= $2")) {
      // The streak read: every week this player has finished, newest first.
      const [user, thisWeek] = params as [string, string];
      return {
        rows: [...best.keys()]
          .filter((k) => k.startsWith(`${user}|`))
          .map((k) => k.split("|")[1])
          .filter((w) => w <= thisWeek)
          .sort()
          .reverse()
          .map((week) => ({ week })),
      };
    }
    // Checked before the SELECT below, which its own text would otherwise match.
    if (sql.includes("DELETE FROM weekly_open")) {
      open.delete(params[0] as string);
      return { rows: [] };
    }
    if (sql.includes("SELECT to_char(week, 'YYYY-MM-DD') AS week, seed, moves")) {
      const row = open.get(params[0] as string);
      return {
        rows: row ? [{ week: row.week, seed: String(row.seed), moves: row.moves }] : [],
      };
    }
    if (sql.includes("INSERT INTO weekly_open")) {
      const [user, week, seed] = params as [string, string, number];
      open.set(user, { week, seed, moves: "" });
      return { rows: [] };
    }
    if (sql.includes("UPDATE weekly_open")) {
      const [user, moves] = params as [string, string];
      const row = open.get(user);
      if (row) row.moves = moves;
      return { rows: [] };
    }
    if (sql.includes("INSERT INTO weekly_runs")) {
      // The settle upsert: count the attempt, keep the run only if it beat the
      // standing score. Mirrors the CASE ladder in the real statement.
      const [user, week, score, turns, banks, busts, hotDice, bestTurn, seed, moves] = params as [
        string,
        string,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        string,
      ];
      const k = key(user, week);
      const existing = best.get(k);
      const fresh = { score, turns, banks, busts, hotDice, bestTurn, seed, moves };
      if (!existing) {
        best.set(k, { ...fresh, attempts: 1, bestAt: ++clock });
      } else if (score > existing.score) {
        best.set(k, { ...fresh, attempts: existing.attempts + 1, bestAt: ++clock });
      } else {
        existing.attempts += 1;
      }
      return { rows: [] };
    }
    if (sql.includes("UPDATE users") && sql.includes("weeklyWins")) {
      const [id, wins] = params as [string, number];
      weeklyWins.set(id, Math.max(weeklyWins.get(id) ?? 0, wins));
      return { rows: [] };
    }
    if (sql.includes("UPDATE users") && sql.includes("bestTurn")) {
      const [id, points] = params as [string, number];
      bestTurns.set(id, Math.max(bestTurns.get(id) ?? 0, points));
      return { rows: [] };
    }
    return { rows: [] };
  },
}));

const { startWeeklyRun, playWeeklyMove, resumeWeeklyRun, weeklyStatus } =
  await import("./weekly.js");

const WEEK = "2026-08-24"; // a Monday
const LAST_WEEK = "2026-08-17";
const USER = "player-1";

beforeEach(() => {
  open.clear();
  best.clear();
  bestTurns.clear();
  weeklyWins.clear();
  clock = 0;
});

/**
 * Play an attempt to the end, banking once the turn is worth `bankAt`.
 * Returns the score the server derived.
 */
async function playAttempt(user: string, bankAt: number, week = WEEK): Promise<number> {
  let view = await startWeeklyRun(user, week);
  for (let guard = 0; guard < 400 && !view.complete; guard++) {
    const turn = view.state.turn;
    const bank = !turn.outcome && turn.turnScore >= bankAt;
    view = await playWeeklyMove(user, bank ? "BANK" : "ROLL", week);
  }
  return view.state.players[0].total;
}

/**
 * Write a settled result straight into the store.
 *
 * The champion, badge and streak rules all turn on WHO scored what — and a real
 * attempt scores whatever its dice give it. These tests state the scores
 * instead of rolling for them, so what they check is the ranking rule rather
 * than the luck of a seed.
 */
function record(user: string, week: string, score: number): void {
  best.set(key(user, week), {
    score,
    turns: 10,
    banks: 8,
    busts: 2,
    hotDice: 1,
    bestTurn: 400,
    seed: 1,
    moves: "",
    attempts: 1,
    bestAt: ++clock,
  });
}

describe("one attempt at a time", () => {
  it("starting again returns the attempt already open, not fresh dice", async () => {
    const first = await startWeeklyRun(USER, WEEK);
    const seed = open.get(USER)!.seed;
    await playWeeklyMove(USER, "ROLL", WEEK);

    const again = await startWeeklyRun(USER, WEEK);
    // Same seed, and the throw already made is still there: this is the same
    // attempt, which is what "finish before you start another" means.
    expect(open.get(USER)!.seed).toBe(seed);
    expect(again.state.turn.rollCount).toBe(1);
    expect(first.complete).toBe(false);
  });

  it("will not deal a second attempt to escape a bad one", async () => {
    await startWeeklyRun(USER, WEEK);
    await playWeeklyMove(USER, "ROLL", WEEK);
    const dice = open.get(USER)!.moves;
    // Ten starts in a row cannot shake the attempt loose.
    for (let i = 0; i < 10; i++) await startWeeklyRun(USER, WEEK);
    expect(open.get(USER)!.moves).toBe(dice);
  });

  it("deals a genuinely new attempt once the last one is finished", async () => {
    await playAttempt(USER, 300);
    expect(open.has(USER)).toBe(false); // the finished attempt released the slot
    const seeds = new Set<number>();
    for (let i = 0; i < 5; i++) {
      await startWeeklyRun(USER, WEEK);
      seeds.add(open.get(USER)!.seed);
      await playAttempt(USER, 300);
    }
    // Retrying buys another roll of the dice, never the same one again.
    expect(seeds.size).toBe(5);
  });

  it("rejects a move when nothing is open", async () => {
    await expect(playWeeklyMove(USER, "ROLL", WEEK)).rejects.toThrow(/start a run first/i);
  });
});

describe("the best attempt is the one that stands", () => {
  it("keeps the highest score, not the most recent", async () => {
    // A cautious run banks small and often; a reckless one swings. Play both
    // and whichever scored more is the one on the board.
    const first = await playAttempt(USER, 250);
    const second = await playAttempt(USER, 2000);
    const status = await weeklyStatus(USER, WEEK);
    expect(status.best?.score).toBe(Math.max(first, second));
  });

  it("a standing score only ever goes up, whatever a later attempt does", async () => {
    // Asserted against the running maximum rather than against a "good" and a
    // "bad" attempt: the dice decide what an attempt scores, so banking early
    // beats banking late often enough that naming one of them the worse run
    // would make this test a coin flip.
    let previous = 0;
    const scores: number[] = [];
    for (let i = 0; i < 6; i++) {
      scores.push(await playAttempt(USER, 200 + i * 250));
      const standing = (await weeklyStatus(USER, WEEK)).best!.score;
      expect(standing).toBeGreaterThanOrEqual(previous);
      expect(standing).toBe(Math.max(...scores));
      previous = standing;
    }
  });

  it("counts every finished attempt, winning or not", async () => {
    for (let i = 0; i < 3; i++) await playAttempt(USER, 300);
    expect((await weeklyStatus(USER, WEEK)).attempts).toBe(3);
  });

  it("shows the stats OF the best attempt, and re-verifies from its moves", async () => {
    await playAttempt(USER, 250);
    await playAttempt(USER, 1500);
    const status = await weeklyStatus(USER, WEEK);
    const row = best.get(key(USER, WEEK))!;
    // The stored seed and moves still replay to exactly the stored figures —
    // which is the whole point of keeping them: any score can be re-checked.
    const replay = weeklyPosition(row.seed, row.moves.split(",") as WeeklyMove[]).result;
    expect(replay.score).toBe(status.best!.score);
    expect(replay.bestTurn).toBe(status.best!.bestTurn);
    expect(replay.busts).toBe(status.best!.busts);
    expect(replay.complete).toBe(true);
  });

  it("an unfinished attempt is worth nothing at all", async () => {
    await startWeeklyRun(USER, WEEK);
    await playWeeklyMove(USER, "ROLL", WEEK);
    const status = await weeklyStatus(USER, WEEK);
    expect(status.best).toBeNull();
    expect(status.attempts).toBe(0);
    expect(status.leaderboard).toEqual([]);
  });
});

describe("a week that has turned over", () => {
  it("discards an attempt left open last week rather than resuming it", async () => {
    await startWeeklyRun(USER, LAST_WEEK);
    await playWeeklyMove(USER, "ROLL", LAST_WEEK);
    const staleSeed = open.get(USER)!.seed;

    const fresh = await startWeeklyRun(USER, WEEK);
    expect(open.get(USER)!.week).toBe(WEEK);
    expect(open.get(USER)!.seed).not.toBe(staleSeed);
    expect(fresh.state.turn.rollCount).toBe(0);
    // It was never completed, so it counts for nothing on either week.
    expect(best.has(key(USER, LAST_WEEK))).toBe(false);
  });

  it("voids a move on a run whose week has closed", async () => {
    await startWeeklyRun(USER, LAST_WEEK);
    // Monday arrives mid-run. Scoring this now would rewrite a closed board.
    await expect(playWeeklyMove(USER, "ROLL", WEEK)).rejects.toThrow(/belonged to last week/i);
    expect(open.has(USER)).toBe(false);
    expect(best.has(key(USER, LAST_WEEK))).toBe(false);
  });

  it("resume offers this week's attempt and never a stale one", async () => {
    await startWeeklyRun(USER, LAST_WEEK);
    expect(await resumeWeeklyRun(USER, WEEK)).toBeNull();
    expect(await resumeWeeklyRun(USER, LAST_WEEK)).not.toBeNull();
  });

  it("resume returns the position a half-played attempt reached", async () => {
    await startWeeklyRun(USER, WEEK);
    await playWeeklyMove(USER, "ROLL", WEEK);
    const resumed = await resumeWeeklyRun(USER, WEEK);
    expect(resumed?.state.turn.rollCount).toBe(1);
    expect(resumed?.complete).toBe(false);
  });

  it("offers nothing to resume once the attempt is finished", async () => {
    await playAttempt(USER, 300);
    expect(await resumeWeeklyRun(USER, WEEK)).toBeNull();
  });
});

describe("the move list is the server's", () => {
  it("rejects a move that isn't legal in the current position", async () => {
    await startWeeklyRun(USER, WEEK);
    // Nothing has been thrown, so there is nothing to bank.
    await expect(playWeeklyMove(USER, "BANK", WEEK)).rejects.toThrow(/isn't legal/i);
  });

  it("rejects anything that isn't a move", async () => {
    await startWeeklyRun(USER, WEEK);
    await expect(playWeeklyMove(USER, "ADVANCE", WEEK)).rejects.toThrow(/invalid move/i);
    await expect(playWeeklyMove(USER, { type: "ROLL" }, WEEK)).rejects.toThrow(/invalid move/i);
    await expect(playWeeklyMove(USER, "H5", WEEK)).rejects.toThrow(/invalid move/i);
  });

  it("rejects holding a die before anything has been thrown", async () => {
    await startWeeklyRun(USER, WEEK);
    await expect(playWeeklyMove(USER, "H0", WEEK)).rejects.toThrow(/isn't legal/i);
  });

  it("records holds, so the replay throws the dice the player actually saw", async () => {
    await startWeeklyRun(USER, WEEK);
    // Find a live turn with something held. A first throw can bust outright,
    // which ends the turn and leaves nothing to hold — so roll on until there
    // is. (Busting five dice is rare, so this almost always exits at once.)
    let view = await playWeeklyMove(USER, "ROLL", WEEK);
    for (let i = 0; i < 8; i++) {
      if (view.complete) break;
      if (!view.state.turn.outcome && view.state.turn.locked.some(Boolean)) break;
      view = await playWeeklyMove(USER, "ROLL", WEEK);
    }
    const held = view.state.turn.locked.findIndex(Boolean);
    expect(held).toBeGreaterThanOrEqual(0);

    const afterHold = await playWeeklyMove(USER, ("H" + held) as "H0", WEEK);
    // Putting a scoring die back gives up what it was paying for...
    expect(afterHold.state.turn.locked[held]).toBe(false);
    // ...and the move is in the list, because the dice a LATER throw produces
    // depend on which of them were held. A replay missing it would deal the
    // player different dice from the ones they were looking at.
    expect(open.get(USER)!.moves.split(",")).toContain(`H${held}`);

    const row = open.get(USER)!;
    const replay = weeklyPosition(row.seed, row.moves.split(",") as WeeklyMove[]);
    expect(replay.state.turn.locked).toEqual(afterHold.state.turn.locked);
    expect(replay.state.turn.dice).toEqual(afterHold.state.turn.dice);
  });

  it("is append-only: the score is always a replay of what was played", async () => {
    await startWeeklyRun(USER, WEEK);
    const seed = open.get(USER)!.seed;
    for (let i = 0; i < 6; i++) {
      const view = await playWeeklyMove(USER, "ROLL", WEEK).catch(() => null);
      if (!view) break;
      const row = open.get(USER);
      if (!row) break;
      expect(weeklyPosition(seed, row.moves.split(",") as WeeklyMove[]).state.turn.dice).toEqual(
        view.state.turn.dice,
      );
    }
  });
});

describe("the board", () => {
  it("is public before this player has played — unlike the daily's", async () => {
    // The one place the weekly parts company with the daily on purpose: with
    // retries still to come, the score to beat is the point of the mode.
    await playAttempt("rival", 400);
    const status = await weeklyStatus(USER, WEEK);
    expect(status.best).toBeNull(); // this player hasn't finished anything
    expect(status.leaderboard.length).toBe(1);
    expect(status.leaderboard[0].username).toBe("player-rival");
    expect(status.players).toBe(1);
  });

  it("ranks by best score and reports the viewer's own place", async () => {
    await playAttempt("rival", 3000); // banks late, swings high
    await playAttempt(USER, 200); // banks early, scores low
    const status = await weeklyStatus(USER, WEEK);
    const scores = status.leaderboard.map((e) => e.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(status.yourRank).toBe(status.leaderboard.findIndex((e) => e.you) + 1);
  });

  it("shows how many attempts each score cost", async () => {
    await playAttempt(USER, 300);
    await playAttempt(USER, 300);
    await playAttempt("rival", 300);
    const status = await weeklyStatus(USER, WEEK);
    const mine = status.leaderboard.find((e) => e.you);
    const theirs = status.leaderboard.find((e) => !e.you);
    expect(mine?.attempts).toBe(2);
    expect(theirs?.attempts).toBe(1);
  });
});

describe("champions, crowns and badges settle when a week does", () => {
  it("crowns the winner of the most recent CLOSED week", async () => {
    record("rival", LAST_WEEK, 3000);
    record(USER, LAST_WEEK, 1500);
    record(USER, WEEK, 900);

    const status = await weeklyStatus(USER, WEEK);
    expect(status.champion?.week).toBe(LAST_WEEK);
    expect(status.champion?.username).toBe("player-rival");
    expect(status.champions.map((c) => c.week)).toEqual([LAST_WEEK]);
  });

  it("says nothing about a week still being played", async () => {
    record("rival", WEEK, 3000);
    const status = await weeklyStatus(USER, WEEK);
    // This week has a leader, but a leader is not a champion: the week is live
    // and every player on it may still improve.
    expect(status.leaderboard.length).toBe(1);
    expect(status.champion).toBeNull();
    expect(status.champions).toEqual([]);
    expect(status.wins).toBe(0);
    expect(status.eliteEarned).toBe(false);
  });

  it("counts a win only once the week it was won on is over", async () => {
    record(USER, LAST_WEEK, 1200);
    const duringLastWeek = await weeklyStatus(USER, LAST_WEEK);
    expect(duringLastWeek.wins).toBe(0);

    const afterItClosed = await weeklyStatus(USER, WEEK);
    expect(afterItClosed.wins).toBe(1);
    expect(afterItClosed.eliteEarned).toBe(true);
    // And the figure reaches the account, so Stats agrees without a re-sync.
    expect(weeklyWins.get(USER)).toBe(1);
  });

  it("counts a streak in weeks, not days", async () => {
    for (const week of ["2026-08-10", "2026-08-17", "2026-08-24"]) {
      record(USER, week, 1000);
    }
    expect((await weeklyStatus(USER, WEEK)).streak).toBe(3);
    // A gap breaks it: nothing was played the week of the 17th.
    best.delete(key(USER, "2026-08-17"));
    expect((await weeklyStatus(USER, WEEK)).streak).toBe(1);
  });
});

describe("career stats", () => {
  it("raises the career best turn from a weekly attempt", async () => {
    // Banking on the first points of every turn, so the attempt reliably banks
    // something: what is under test is that the figure travels, not the dice.
    await playAttempt(USER, 50);
    const row = best.get(key(USER, WEEK))!;
    // The server derived the run's best turn itself and pushed it onto the
    // account — the client never reports a number here.
    expect(bestTurns.get(USER) ?? 0).toBeGreaterThan(0);
    expect(bestTurns.get(USER) ?? 0).toBeGreaterThanOrEqual(row.bestTurn);
  });

  it("only ever raises it, however a later attempt goes", async () => {
    // Monotonic, not "the first attempt wins": a later attempt may well post a
    // better turn while scoring less overall, and it should keep that credit.
    // What must never happen is the figure going DOWN.
    let previous = 0;
    for (let i = 0; i < 5; i++) {
      await playAttempt(USER, 100 + i * 300);
      const now = bestTurns.get(USER) ?? 0;
      expect(now).toBeGreaterThanOrEqual(previous);
      previous = now;
    }
    expect(previous).toBeGreaterThan(0);
  });
});
