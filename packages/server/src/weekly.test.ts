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
import {
  WEEKLY_ATTEMPTS,
  WEEKLY_ATTEMPTS_PER_DAY,
  WEEKLY_CAP_FROM,
  WEEKLY_DAILY_CAP_FROM,
  dailyKey,
  weeklyPosition,
  type WeeklyMove,
} from "@greed/core";

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
  superBusts: number;
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
/** Attempts spent per player per DAY, as weekly_attempts would hold them. */
const spentToday = new Map<string, number>();
const key = (user: string, week: string) => `${user}|${week}`;
/** Career best turn per user, as the users table would hold it. */
const bestTurns = new Map<string, number>();
/** Weekly first places written back onto the account. */
const weeklyWins = new Map<string, number>();
/**
 * The career column the BOARDS rank and the screens now read — distinct from
 * the profile copy above, which is a different number with a different owner.
 */
const careerWeeklyWins = new Map<string, number>();
/** Periods already written to the challenge_wins ledger. */
const banked = new Set<string>();
/** Monotonic clock standing in for now(), so best_at ordering is checkable. */
let clock = 0;

/** Every row in a week, best first — the order the board is built in. */
function boardFor(week: string): { user: string; row: Best }[] {
  return (
    [...best.entries()]
      .filter(([k]) => k.endsWith(`|${week}`))
      .map(([k, row]) => ({ user: k.split("|")[0], row }))
      // The board's order, mirroring WEEKLY_ORDER: score, then the run's best
      // turn, then who got there first.
      .sort(
        (a, b) =>
          b.row.score - a.row.score ||
          b.row.bestTurn - a.row.bestTurn ||
          a.row.bestAt - b.row.bestAt,
      )
  );
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
    if (sql.includes("INSERT INTO career_stats") && sql.includes("weekly_wins")) {
      // The refresh: bank each closed period's winner the first time it is
      // seen, and add it on — as the real statement does through the
      // challenge_wins ledger. A period already banked is never counted again.
      const [thisWeek] = params as [string];
      for (const [period, board] of closedBoards(thisWeek)) {
        if (!board.length || banked.has(period)) continue;
        banked.add(period);
        careerWeeklyWins.set(board[0].user, (careerWeeklyWins.get(board[0].user) ?? 0) + 1);
      }
      return { rows: [] };
    }
    if (sql.includes("weekly_wins AS wins FROM career_stats")) {
      const [ids] = params as [string[]];
      return {
        rows: ids
          .filter((id) => careerWeeklyWins.has(id))
          .map((id) => ({ user_id: id, wins: careerWeeklyWins.get(id) })),
      };
    }
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
            super_busts: row.superBusts,
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
          super_busts: e.row.superBusts,
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
    if (sql.includes("SELECT attempts FROM weekly_runs")) {
      // What a week has cost this player so far: [userId, week].
      const [user, week] = params as [string, string];
      const row = best.get(key(user, week));
      return { rows: row ? [{ attempts: row.attempts }] : [] };
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
    if (sql.includes("INSERT INTO weekly_attempts")) {
      const [user, day] = params as [string, string];
      const k = key(user, day);
      spentToday.set(k, (spentToday.get(k) ?? 0) + 1);
      return { rows: [] };
    }
    if (sql.includes("FROM weekly_attempts")) {
      const [user, day] = params as [string, string];
      const n = spentToday.get(key(user, day));
      return { rows: n === undefined ? [] : [{ n }] };
    }
    if (sql.includes("INSERT INTO weekly_runs")) {
      // The settle upsert: count the attempt, keep the run only if it beat the
      // standing score. Mirrors the CASE ladder in the real statement.
      const [user, week, score, turns, banks, busts, superBusts, hotDice, bestTurn, seed, moves] =
        params as [
          string,
          string,
          number,
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
      const fresh = { score, turns, banks, busts, superBusts, hotDice, bestTurn, seed, moves };
      if (!existing) {
        best.set(k, { ...fresh, attempts: 1, bestAt: ++clock });
      } else {
        // Mirrors the real CASE ladder: the run is kept when it beats the
        // standing one by the board's order (score, then best turn), while
        // best_at moves only on a strictly higher SCORE.
        const beats =
          score > existing.score || (score === existing.score && bestTurn > existing.bestTurn);
        const attempts = existing.attempts + 1;
        if (beats) {
          const bestAt = score > existing.score ? ++clock : existing.bestAt;
          best.set(k, { ...fresh, score: Math.max(score, existing.score), attempts, bestAt });
        } else {
          existing.attempts = attempts;
        }
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
/**
 * A week the attempt cap applies to.
 *
 * Every other test in this file runs on WEEK, which is before the cap started —
 * so the suite as a whole is also the check that weeks played under the old
 * unlimited rule still behave that way.
 */
const CAPPED_WEEK = WEEKLY_CAP_FROM;

beforeEach(() => {
  open.clear();
  best.clear();
  spentToday.clear();
  bestTurns.clear();
  weeklyWins.clear();
  careerWeeklyWins.clear();
  banked.clear();
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
function record(user: string, week: string, score: number, attempts = 1): void {
  best.set(key(user, week), {
    score,
    turns: 10,
    banks: 8,
    busts: 2,
    superBusts: 1,
    hotDice: 1,
    bestTurn: 400,
    seed: 1,
    moves: "",
    attempts,
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
    expect(replay.superBusts).toBe(status.best!.superBusts);
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

  it("refuses to put back the last held die", async () => {
    // The same rule a local game applies, enforced here too — otherwise the one
    // mode whose dice the server owns would be the one place a free throw was
    // still available.
    await startWeeklyRun(USER, WEEK);
    let view = await playWeeklyMove(USER, "ROLL", WEEK);
    for (let i = 0; i < 8; i++) {
      if (view.complete) break;
      if (!view.state.turn.outcome && view.state.turn.locked.some(Boolean)) break;
      view = await playWeeklyMove(USER, "ROLL", WEEK);
    }
    // Release down to a single held die. Every one of THOSE taps is legal.
    for (let i = 0; i < 5; i++) {
      if (view.state.turn.locked.filter(Boolean).length === 1) break;
      if (view.state.turn.locked[i]) view = await playWeeklyMove(USER, ("H" + i) as "H0", WEEK);
    }
    expect(view.state.turn.locked.filter(Boolean).length).toBe(1);

    const only = view.state.turn.locked.findIndex(Boolean);
    await expect(playWeeklyMove(USER, ("H" + only) as "H0", WEEK)).rejects.toThrow(/isn't legal/i);
    // Refused, not dropped: the move never reached the stored list, so a replay
    // sees the position the player is actually looking at.
    expect(open.get(USER)!.moves.split(",")).not.toContain(`H${only}`);
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

    // Two dice have to be held before one can be released, since the last held
    // die stays put. If the throw only paid one, pick a loose one up first —
    // which is a recorded move in its own right.
    if (view.state.turn.locked.filter(Boolean).length === 1) {
      const loose = view.state.turn.locked.findIndex((l) => !l);
      view = await playWeeklyMove(USER, ("H" + loose) as "H0", WEEK);
      expect(view.state.turn.locked[loose]).toBe(true);
    }

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
    // And it is banked in the career tally, which is the single place the
    // boards, this screen and the Stats screen all now read it from.
    expect(careerWeeklyWins.get(USER)).toBe(1);
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

/**
 * A move list that plays a seed all the way out, banking at 300.
 *
 * Written straight into the open row by the tests below, which need an attempt
 * that is FINISHED but not yet settled — the state a row is in when settlement
 * did not complete. Playing one through the server instead would settle it, so
 * the state under test would never exist.
 */
function playedOut(seed: number): string {
  const moves: WeeklyMove[] = [];
  for (let guard = 0; guard < 400; guard++) {
    const pos = weeklyPosition(seed, moves);
    if (pos.result.complete) break;
    const turn = pos.state.turn;
    moves.push(!turn.outcome && turn.turnScore >= 300 ? "BANK" : "ROLL");
  }
  return moves.join(",");
}

describe("a week's worth of attempts", () => {
  it("deals the last one and refuses the one after it", async () => {
    record(USER, CAPPED_WEEK, 2000, WEEKLY_ATTEMPTS - 1);
    // The fiftieth is still owed, so it is dealt.
    await expect(startWeeklyRun(USER, CAPPED_WEEK)).resolves.toBeTruthy();

    // Play it out. That settles it, which is what spends it.
    await playAttempt(USER, 300, CAPPED_WEEK);
    expect(best.get(key(USER, CAPPED_WEEK))!.attempts).toBe(WEEKLY_ATTEMPTS);

    await expect(startWeeklyRun(USER, CAPPED_WEEK)).rejects.toThrow(/all 50 attempts/i);
    // And nothing was dealt on the way to refusing.
    expect(open.has(USER)).toBe(false);
  });

  it("still lets a player finish the attempt in their hands", async () => {
    // The cap decides whether a NEW attempt may be dealt. A run already open
    // was granted before the count ran out and is the player's to play out —
    // otherwise the fiftieth attempt could never be finished, only started.
    const view = await startWeeklyRun(USER, CAPPED_WEEK);
    expect(view.complete).toBe(false);
    record(USER, CAPPED_WEEK, 2000, WEEKLY_ATTEMPTS);

    const again = await startWeeklyRun(USER, CAPPED_WEEK);
    expect(again.complete).toBe(false);
    expect(await resumeWeeklyRun(USER, CAPPED_WEEK)).not.toBeNull();
  });

  it("counts a played-out attempt before deciding, not after", async () => {
    // The fiftieth attempt, finished but never folded in — settlement died
    // between writing the run and clearing the open row. Checking the count
    // before settling would read 49 and hand out a fifty-first.
    record(USER, CAPPED_WEEK, 2000, WEEKLY_ATTEMPTS - 1);
    const seed = 4242;
    open.set(USER, { week: CAPPED_WEEK, seed, moves: playedOut(seed) });

    await expect(startWeeklyRun(USER, CAPPED_WEEK)).rejects.toThrow(/all 50 attempts/i);
    // Settled on the way past, so the attempt is counted and the row is gone.
    expect(best.get(key(USER, CAPPED_WEEK))!.attempts).toBe(WEEKLY_ATTEMPTS);
    expect(open.has(USER)).toBe(false);
  });

  it("leaves a week from before the cap unlimited", async () => {
    // Far past fifty, on a week that was played under the old promise.
    record(USER, WEEK, 2000, 500);
    await expect(startWeeklyRun(USER, WEEK)).resolves.toBeTruthy();
  });

  it("counts the fifty against the WEEK, not against a day", async () => {
    // The week of WEEKLY_CAP_FROM is the one week that ever worked this way, so
    // its fifty must stay spendable in a single sitting.
    record(USER, CAPPED_WEEK, 2000, 12);
    const status = await weeklyStatus(USER, CAPPED_WEEK);
    expect(status.attemptPeriod).toBe("week");
    expect(status.attemptsUsed).toBe(12);
    expect(spentToday.size).toBe(0);
  });

  it("tells the screen what the week grants", async () => {
    record(USER, CAPPED_WEEK, 2000, 3);
    const capped = await weeklyStatus(USER, CAPPED_WEEK);
    expect(capped.attemptLimit).toBe(WEEKLY_ATTEMPTS);
    expect(capped.attempts).toBe(3);

    const uncapped = await weeklyStatus(USER, WEEK);
    expect(uncapped.attemptLimit).toBeNull();
  });
});

describe("ties on the weekly board", () => {
  /** Put a finished run on the board directly, with the figures it is ranked by. */
  function standing(user: string, week: string, score: number, bestTurn: number): void {
    best.set(key(user, week), {
      score,
      turns: 10,
      banks: 8,
      busts: 2,
      superBusts: 0,
      hotDice: 1,
      bestTurn,
      seed: 1,
      moves: "",
      attempts: 1,
      bestAt: ++clock,
    });
  }

  it("puts the bigger single turn first when two players finish level", async () => {
    // The reported case: two players on 5850, settled by whoever got there
    // first. The one who built it out of a bigger turn now takes the week.
    standing("early", WEEK, 5850, 2000); // got there first...
    standing("bigger", WEEK, 5850, 2400); // ...but played the better turn
    const board = (await weeklyStatus("early", WEEK)).leaderboard;
    expect(board.map((e) => e.username)).toEqual(["player-bigger", "player-early"]);
    expect(board.map((e) => e.rank)).toEqual([1, 2]);
  });

  it("falls back to who got there first when the turns match too", async () => {
    standing("early", WEEK, 5850, 2400);
    standing("late", WEEK, 5850, 2400);
    const board = (await weeklyStatus("early", WEEK)).leaderboard;
    expect(board.map((e) => e.username)).toEqual(["player-early", "player-late"]);
    // And exactly one of them is first, so the week has one winner.
    expect(board.filter((e) => e.rank === 1)).toHaveLength(1);
  });

  it("still ranks on score before anything else", async () => {
    // A monstrous turn does not outweigh a higher total.
    standing("total", WEEK, 6000, 400);
    standing("turn", WEEK, 5850, 3000);
    const board = (await weeklyStatus("total", WEEK)).leaderboard;
    expect(board.map((e) => e.username)).toEqual(["player-total", "player-turn"]);
  });
});

describe("a day's worth of attempts", () => {
  const DAY_WEEK = WEEKLY_DAILY_CAP_FROM;

  /** Spend `n` attempts today, as settling that many runs would. */
  function spend(user: string, n: number): void {
    spentToday.set(key(user, dailyKey()), n);
  }

  it("deals the last one of the day and refuses the one after it", async () => {
    spend(USER, WEEKLY_ATTEMPTS_PER_DAY - 1);
    await expect(startWeeklyRun(USER, DAY_WEEK)).resolves.toBeTruthy();
    await playAttempt(USER, 300, DAY_WEEK);
    expect(spentToday.get(key(USER, dailyKey()))).toBe(WEEKLY_ATTEMPTS_PER_DAY);

    await expect(startWeeklyRun(USER, DAY_WEEK)).rejects.toThrow(/all 10 attempts for today/i);
    expect(open.has(USER)).toBe(false);
  });

  it("does not care how many the player has already made this week", async () => {
    // The whole point of the change: a week is no longer a pot that can be
    // emptied on Monday. Forty attempts already made, none of them today.
    record(USER, DAY_WEEK, 2500, 40);
    await expect(startWeeklyRun(USER, DAY_WEEK)).resolves.toBeTruthy();
  });

  it("gives a fresh ten when the day turns over", async () => {
    // Yesterday's count is a different row, so it cannot hold today back.
    spentToday.set(key(USER, "1999-01-01"), 500);
    spend(USER, 0);
    await expect(startWeeklyRun(USER, DAY_WEEK)).resolves.toBeTruthy();
  });

  it("charges the day an attempt was PLAYED OUT, not the one it was dealt on", async () => {
    // Same rule the week count already follows: an attempt costs nothing until
    // it is finished, so opening one and walking away is free.
    await startWeeklyRun(USER, DAY_WEEK);
    expect(spentToday.get(key(USER, dailyKey())) ?? 0).toBe(0);
    await playAttempt(USER, 300, DAY_WEEK);
    expect(spentToday.get(key(USER, dailyKey()))).toBe(1);
  });

  it("still lets a player finish the attempt in their hands", async () => {
    const view = await startWeeklyRun(USER, DAY_WEEK);
    expect(view.complete).toBe(false);
    spend(USER, WEEKLY_ATTEMPTS_PER_DAY);
    const again = await startWeeklyRun(USER, DAY_WEEK);
    expect(again.complete).toBe(false);
  });

  it("tells the screen it is a daily ration, and what is spent against it", async () => {
    record(USER, DAY_WEEK, 2500, 23); // 23 attempts this week...
    spend(USER, 4); // ...four of them today
    const status = await weeklyStatus(USER, DAY_WEEK);
    expect(status.attemptLimit).toBe(WEEKLY_ATTEMPTS_PER_DAY);
    expect(status.attemptPeriod).toBe("day");
    expect(status.attemptsUsed).toBe(4);
    // The week's total is untouched — it is what "best of N attempts" means.
    expect(status.attempts).toBe(23);
  });
});
