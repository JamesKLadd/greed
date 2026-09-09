/**
 * Weekly challenge storage and leaderboard.
 *
 * The same deal as the daily — the server holds each attempt's seed, owns the
 * move list, and replays it through the shared engine to derive the score — but
 * a week may be attempted as often as a player likes, and only their best
 * attempt stands.
 *
 * Three rules do the work of keeping that honest. Every attempt is dealt a
 * FRESH secret seed, so retrying buys another roll of the dice and never a
 * second look at the same ones: a week cannot be scouted, learned, or solved.
 * A player may only have ONE attempt open at a time, so an attempt is finished
 * rather than abandoned the moment it goes badly — which is what stops the mode
 * collapsing into "reroll the first turn until it's good". And a week grants a
 * fixed number of attempts (see `weeklyAttemptLimit`), so a board is won by
 * playing well rather than by playing longest.
 *
 * Unlike the daily, this week's board is public from the start. With a week's
 * worth of attempts a score to chase is the point of the mode rather than
 * something that spoils a single attempt, so there is nothing to withhold.
 */

import {
  WEEKLY_TURNS,
  canToggleLock,
  getLegalActions,
  holdIndex,
  isRunMove,
  weekKey,
  weeklyAttemptLimit,
  weeklyMoveStart,
  weeklyPosition,
  type GameState,
  type WeeklyMove,
  type WeeklyResult,
} from "@greed/core";
import { randomInt } from "node:crypto";
import { query } from "./db.js";
import { AccountError } from "./accounts.js";

/** Cap on a single attempt's move list — a legitimate 10-turn run is far shorter. */
const MAX_MOVES = 2000;

/** How high on a FINISHED weekly board earns the badge. */
const PODIUM_RANK = 10;

/** How many past champions the weekly screen lists. */
const CHAMPIONS_LIMIT = 200;

export interface WeeklyEntry {
  username: string;
  /** Their equipped avatar id, so the row shows the face they chose. */
  avatar: string;
  score: number;
  turns: number;
  bestTurn: number;
  busts: number;
  hotDice: number;
  /** Attempts this player finished this week — what the score cost them. */
  attempts: number;
  /** How many weekly challenges this player has won outright. */
  wins: number;
  /** Position on the board, 1-based. */
  rank: number;
  /** True for the requesting player's own row. */
  you?: boolean;
  /** True for the reigning champion — see `champion`. */
  crown?: true;
}

/** Who took a week, once that week was over. */
export interface WeeklyChampion {
  /** The challenge week's Monday, as YYYY-MM-DD; formatted by the client. */
  week: string;
  username: string;
  avatar: string;
  score: number;
}

export interface WeeklyStatus {
  /** The Monday this challenge week starts on. */
  week: string;
  /** The player's best attempt this week, if they've finished one. */
  best: WeeklyResult | null;
  /** Attempts the player has finished this week. */
  attempts: number;
  /**
   * Attempts this week grants, or null on a week that is unlimited.
   *
   * Sent rather than left for the client to derive, even though the rule is a
   * pure function of the week both halves can compute. The server is what
   * actually enforces it, so this is the client being told what it will be held
   * to instead of guessing — and during the minutes after a release when the
   * running server is the older one, guessing would mean a screen refusing
   * attempts the server would happily have dealt.
   */
  attemptLimit: number | null;
  /** Current streak of consecutive weeks played, including this one. */
  streak: number;
  /**
   * This week's board. Public from the first moment of the week — unlike the
   * daily's, which is withheld until the player's single attempt is in.
   */
  leaderboard: WeeklyEntry[];
  /** The player's own rank, even when outside the top slice. */
  yourRank: number | null;
  players: number;
  /**
   * True once the player has finished in the top ten of a week that is OVER.
   *
   * Deliberately not "you are top ten right now": a board fills up across its
   * week, and with retries still to come a standing mid-week is not a result.
   * Standing on a board that has closed is the thing worth a badge.
   */
  eliteEarned: boolean;
  /** How many weekly challenges this player has won outright. */
  wins: number;
  /**
   * Who took the most recent week that has finished, or null before anyone has.
   *
   * Almost always last week's winner; on a week nobody played it reaches
   * further back rather than going blank, which is why it carries its own date.
   * The crown on this week's board goes to this player.
   */
  champion: WeeklyChampion | null;
  /** Every past winner, newest first. Closed weeks only. */
  champions: WeeklyChampion[];
}

/** The attempt as the client is allowed to see it: the position, nothing more. */
export interface WeeklyRunView {
  state: GameState;
  turns: number;
  totalTurns: number;
  complete: boolean;
}

/** An attempt in progress: the secret seed and the moves played so far. */
interface OpenRun {
  week: string;
  seed: number;
  moves: WeeklyMove[];
}

function parseMoves(raw: string): WeeklyMove[] {
  return raw ? (raw.split(",") as WeeklyMove[]) : [];
}

/** The attempt this player currently has open, whatever week it belongs to. */
async function openRun(userId: string): Promise<OpenRun | null> {
  const { rows } = await query<{ week: string; seed: string; moves: string }>(
    `SELECT to_char(week, 'YYYY-MM-DD') AS week, seed, moves
       FROM weekly_open WHERE user_id = $1`,
    [userId],
  );
  if (!rows[0]) return null;
  // bigint comes back as a string from pg.
  return { week: rows[0].week, seed: Number(rows[0].seed), moves: parseMoves(rows[0].moves) };
}

async function clearOpenRun(userId: string): Promise<void> {
  await query(`DELETE FROM weekly_open WHERE user_id = $1`, [userId]);
}

/**
 * Attempts this player has SPENT on a week.
 *
 * Counted off the settled row, which is where `settle` increments it, so an
 * attempt costs a player nothing until it has been played out. That is the
 * honest reading of a cap on attempts, and it is also the only one the
 * one-open-run rule can support: a player who could burn an attempt by opening
 * one and walking away would be paying for dice they never rolled.
 */
async function attemptsUsed(userId: string, week: string): Promise<number> {
  const { rows } = await query<{ attempts: number }>(
    `SELECT attempts FROM weekly_runs WHERE user_id = $1 AND week = $2`,
    [userId, week],
  );
  return rows[0]?.attempts ?? 0;
}

function viewOf(run: OpenRun): WeeklyRunView {
  const pos = weeklyPosition(run.seed, run.moves);
  return {
    state: pos.state,
    turns: pos.turns,
    totalTurns: WEEKLY_TURNS,
    complete: pos.result.complete,
  };
}

/**
 * Open an attempt and deal its first position.
 *
 * Starting while an attempt is already open returns THAT attempt rather than
 * dealing a new one — which is the whole of the "finish what you started" rule:
 * there is no way to get fresh dice except by playing the ones you have to the
 * end. An attempt left open when the week turned over is a different matter: it
 * belongs to a week that has closed and can no longer be scored, so it is
 * discarded here and the player gets a clean start on the new week.
 *
 * Refuses once the week's attempts are spent. The order below is the point:
 * a finished-but-unsettled run is settled FIRST, so the count this checks
 * includes it. Checking before settling would hand out a fifty-first attempt to
 * anyone whose fiftieth had not been folded in yet.
 */
export async function startWeeklyRun(userId: string, week = weekKey()): Promise<WeeklyRunView> {
  const open = await openRun(userId);
  if (open && open.week === week) {
    const view = viewOf(open);
    // Self-healing: a run that is already played out but whose row outlived its
    // settlement is finished, not resumable. Settle it and deal a new one.
    //
    // Note this returns BEFORE the cap is consulted. An attempt already open is
    // one the player has been granted; the cap decides whether a new one may be
    // dealt, never whether a run in progress may be finished.
    if (!view.complete) return view;
    await settle(userId, open);
  } else if (open) {
    // Last week's abandoned attempt. It was never completed, so it counts for
    // nothing — no attempt is recorded and no score is written.
    await clearOpenRun(userId);
  }

  const limit = weeklyAttemptLimit(week);
  if (limit !== null && (await attemptsUsed(userId, week)) >= limit) {
    throw new AccountError(
      409,
      `You have used all ${limit} attempts for this week. New dice on Monday.`,
    );
  }

  // A fresh, unguessable seed per ATTEMPT. Deriving it from the week or the
  // player would make every retry the same dice, which is exactly what makes a
  // second attempt worth having.
  const seed = randomInt(0, 2 ** 31);
  await query(
    `INSERT INTO weekly_open (user_id, week, seed, moves, started_at)
       VALUES ($1, $2, $3, '', now())
     ON CONFLICT (user_id) DO UPDATE
       SET week = EXCLUDED.week, seed = EXCLUDED.seed, moves = '', started_at = now()`,
    [userId, week, seed],
  );
  return viewOf({ week, seed, moves: [] });
}

/**
 * Fold a finished attempt into the player's week: count it, and keep it if it
 * beat what they had.
 *
 * The upsert decides in one statement rather than reading and then writing, so
 * the stored best is never a stale value written back over a newer one. Only a
 * STRICTLY better score displaces the standing run, which is what keeps
 * `best_at` — and with it the board's tiebreak — pinned to the moment the score
 * was first reached rather than to the last time it was matched.
 */
async function settle(userId: string, run: OpenRun): Promise<WeeklyResult> {
  const r = weeklyPosition(run.seed, run.moves).result;
  await query(
    `INSERT INTO weekly_runs
       (user_id, week, score, turns, banks, busts, hot_dice, best_turn, seed, moves,
        attempts, best_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, now())
     ON CONFLICT (user_id, week) DO UPDATE SET
       attempts  = weekly_runs.attempts + 1,
       score     = GREATEST(weekly_runs.score, EXCLUDED.score),
       turns     = CASE WHEN EXCLUDED.score > weekly_runs.score
                        THEN EXCLUDED.turns     ELSE weekly_runs.turns     END,
       banks     = CASE WHEN EXCLUDED.score > weekly_runs.score
                        THEN EXCLUDED.banks     ELSE weekly_runs.banks     END,
       busts     = CASE WHEN EXCLUDED.score > weekly_runs.score
                        THEN EXCLUDED.busts     ELSE weekly_runs.busts     END,
       hot_dice  = CASE WHEN EXCLUDED.score > weekly_runs.score
                        THEN EXCLUDED.hot_dice  ELSE weekly_runs.hot_dice  END,
       best_turn = CASE WHEN EXCLUDED.score > weekly_runs.score
                        THEN EXCLUDED.best_turn ELSE weekly_runs.best_turn END,
       seed      = CASE WHEN EXCLUDED.score > weekly_runs.score
                        THEN EXCLUDED.seed      ELSE weekly_runs.seed      END,
       moves     = CASE WHEN EXCLUDED.score > weekly_runs.score
                        THEN EXCLUDED.moves     ELSE weekly_runs.moves     END,
       best_at   = CASE WHEN EXCLUDED.score > weekly_runs.score
                        THEN now()              ELSE weekly_runs.best_at   END`,
    [
      userId,
      run.week,
      r.score,
      r.turns,
      r.banks,
      r.busts,
      r.hotDice,
      r.bestTurn,
      run.seed,
      run.moves.join(","),
    ],
  );
  // The attempt is recorded, so the open slot is free for the next one. Done
  // after the write rather than before: an open row that outlives its
  // settlement is recoverable (see startWeeklyRun), one that dies before it
  // would lose the attempt outright.
  await clearOpenRun(userId);
  return r;
}

/**
 * Raise a player's career best turn to `points`, if it beats what they have.
 *
 * A turn banked in a weekly attempt is a turn the player played, so it counts
 * toward their career best like any other — the same rule the daily follows,
 * and written from HERE for the same reason: this is the mode whose score the
 * server derives itself, and feeding the board from the number it derived keeps
 * that property instead of handing it back to a client to pass along.
 *
 * GREATEST in the statement rather than a read-then-write, so two runs finishing
 * at once cannot talk over each other — and so this can never LOWER a figure.
 */
async function raiseBestTurn(userId: string, points: number): Promise<void> {
  await query(
    `UPDATE users
        SET profile = jsonb_set(
              profile,
              '{bestTurn}',
              to_jsonb(GREATEST(COALESCE((profile ->> 'bestTurn')::numeric, 0), $2::numeric)),
              true
            ),
            updated_at = now()
      WHERE id = $1`,
    [userId, points],
  );
}

/**
 * Record a player's weekly first places on their account, if it beats what is
 * stored. Same GREATEST-in-the-statement rule as the best turn above.
 *
 * The count is DERIVED — it can always be recomputed from weekly_runs, and is,
 * every time a status is read. This copy exists so the figure reaches the Stats
 * screen and the profile sync like any other career stat.
 */
async function raiseWeeklyWins(userId: string, wins: number): Promise<void> {
  await query(
    `UPDATE users
        SET profile = jsonb_set(
              profile,
              '{weeklyWins}',
              to_jsonb(GREATEST(COALESCE((profile ->> 'weeklyWins')::numeric, 0), $2::numeric)),
              true
            ),
            updated_at = now()
      WHERE id = $1`,
    [userId, wins],
  );
}

/**
 * Play one move in the open attempt. The server owns the move list and the
 * dice: it appends, replays from the seed, and hands back the new position.
 *
 * The client is never told the seed, so it cannot deal itself a preview of the
 * attempt or submit a run it did not actually play. A move that isn't legal in
 * the current position is rejected rather than dropped, so a desynced client
 * hears about it instead of silently losing a turn.
 */
export async function playWeeklyMove(
  userId: string,
  rawMove: unknown,
  week = weekKey(),
): Promise<WeeklyRunView & { settled?: WeeklyResult }> {
  if (!isRunMove(rawMove)) throw new AccountError(400, "Invalid move.");
  const move: WeeklyMove = rawMove;

  const run = await openRun(userId);
  if (run === null) throw new AccountError(400, "Start a run first.");
  if (run.week !== week) {
    // The week turned over mid-run. Scoring it now would rewrite a board that
    // has already closed — and with it a champion someone has been crowned —
    // so the attempt is void and the player starts the new week fresh.
    await clearOpenRun(userId);
    throw new AccountError(409, "That run belonged to last week. Start a new one.");
  }
  if (run.moves.length >= MAX_MOVES) throw new AccountError(400, "That run is too long.");

  const before = weeklyPosition(run.seed, run.moves);
  if (before.result.complete) {
    // An attempt that outlived its settlement (see startWeeklyRun). Settle it
    // rather than letting another move onto a finished run.
    await settle(userId, run);
    throw new AccountError(409, "That run is already finished.");
  }

  // Holding a die is judged against the turn as it stands — it does not start a
  // new one — and by the engine's own rule, so the server refuses exactly the
  // taps a local game refuses (including putting back the last held die).
  const held = holdIndex(move);
  if (held !== null) {
    if (!canToggleLock(before.state.turn, held)) {
      throw new AccountError(400, "That move isn't legal.");
    }
  } else {
    // Legality is checked against the position the NEXT move actually starts
    // from — a finished turn is advanced past first, exactly as the replay does.
    const legal = getLegalActions(weeklyMoveStart(before.state));
    if (move === "ROLL" && !legal.canRoll) throw new AccountError(400, "That move isn't legal.");
    if (move === "BANK" && !legal.canBank) throw new AccountError(400, "That move isn't legal.");
  }

  const next = [...run.moves, move];
  const after = weeklyPosition(run.seed, next);
  const r = after.result;

  if (r.bestTurn > before.result.bestTurn) {
    await raiseBestTurn(userId, r.bestTurn);
  }

  if (r.complete) {
    const settled = await settle(userId, { ...run, moves: next });
    return {
      state: after.state,
      turns: after.turns,
      totalTurns: WEEKLY_TURNS,
      complete: true,
      settled,
    };
  }

  await query(`UPDATE weekly_open SET moves = $2 WHERE user_id = $1`, [userId, next.join(",")]);
  return {
    state: after.state,
    turns: after.turns,
    totalTurns: WEEKLY_TURNS,
    complete: false,
  };
}

/** The attempt in progress on THIS week, for resuming after leaving the screen. */
export async function resumeWeeklyRun(
  userId: string,
  week = weekKey(),
): Promise<WeeklyRunView | null> {
  const run = await openRun(userId);
  // An attempt from a closed week is not resumable; it is cleared when the
  // player next starts one, not from a read.
  if (run === null || run.week !== week) return null;
  const view = viewOf(run);
  return view.complete ? null : view;
}

/** Consecutive weeks with a finished attempt, counting back from this one. */
async function currentStreak(userId: string, thisWeek: string): Promise<number> {
  const { rows } = await query<{ week: string }>(
    `SELECT to_char(week, 'YYYY-MM-DD') AS week FROM weekly_runs
       WHERE user_id = $1 AND week <= $2
       ORDER BY week DESC LIMIT 400`,
    [userId, thisWeek],
  );
  let streak = 0;
  const cursor = new Date(`${thisWeek}T00:00:00Z`);
  for (const row of rows) {
    if (row.week !== cursor.toISOString().slice(0, 10)) break;
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 7);
  }
  return streak;
}

/** What a player has to show for the weekly boards that have CLOSED. */
export interface WeeklyPlacings {
  /** Weeks taken outright. */
  wins: number;
  /** Weeks finished in the top `PODIUM_RANK`. */
  podiums: number;
}

/**
 * First places and top-ten finishes on closed weeks, for the given accounts.
 *
 * Weeks strictly before `thisWeek` only: a board fills up over the course of
 * its week and every player on it may still improve, so neither figure means
 * anything until the week is over. Ties break on who reached the score first,
 * the same order the board is drawn in — so every week has exactly one winner,
 * and the crown has one owner.
 */
export async function closedWeekPlacings(
  userIds: string[],
  thisWeek = weekKey(),
): Promise<Map<string, WeeklyPlacings>> {
  const out = new Map<string, WeeklyPlacings>();
  if (userIds.length === 0) return out;
  const { rows } = await query<{ user_id: string; wins: string; podiums: string }>(
    `WITH ranked AS (
       SELECT user_id,
              RANK() OVER (PARTITION BY week ORDER BY score DESC, best_at ASC) AS rank
         FROM weekly_runs
        WHERE score > 0 AND week < $2::date
     )
     SELECT user_id,
            count(*) FILTER (WHERE rank = 1)::text AS wins,
            count(*) FILTER (WHERE rank <= $3)::text AS podiums
       FROM ranked
      WHERE user_id = ANY($1::uuid[])
      GROUP BY user_id`,
    [[...new Set(userIds)], thisWeek, PODIUM_RANK],
  );
  for (const r of rows) {
    out.set(r.user_id, { wins: Number(r.wins), podiums: Number(r.podiums) });
  }
  return out;
}

/** A champion as the client sees them — the account id stays here. */
function strip(c: WeeklyChampion & { userId: string }): WeeklyChampion {
  return { week: c.week, username: c.username, avatar: c.avatar, score: c.score };
}

/** Every week's winner, newest first. Closed weeks only. */
async function weeklyChampions(
  thisWeek: string,
  limit = CHAMPIONS_LIMIT,
): Promise<(WeeklyChampion & { userId: string })[]> {
  const { rows } = await query<{
    username: string;
    avatar: string | null;
    week: string;
    score: number;
    user_id: string;
  }>(
    `WITH ranked AS (
       SELECT user_id, week, score,
              RANK() OVER (PARTITION BY week ORDER BY score DESC, best_at ASC) AS rank
         FROM weekly_runs
        WHERE score > 0 AND week < $1::date
     )
     SELECT u.username, u.profile ->> 'avatar' AS avatar,
            to_char(k.week, 'YYYY-MM-DD') AS week, k.score, k.user_id
       FROM ranked k JOIN users u ON u.id = k.user_id
      WHERE k.rank = 1
      ORDER BY k.week DESC
      LIMIT $2`,
    [thisWeek, limit],
  );
  return rows.map((r) => ({
    week: r.week,
    username: r.username,
    avatar: r.avatar ?? "",
    score: r.score,
    userId: r.user_id,
  }));
}

/**
 * Where the player stands on this week's challenge.
 *
 * The board is sent whether or not they have played. That is the one place this
 * mode deliberately parts company with the daily: there, a single attempt is
 * spoiled by knowing the number to beat, so the board is withheld until the run
 * is in. Here the number to beat is what a player is retrying AGAINST, and
 * hiding it would only hide the point of the mode.
 */
export async function weeklyStatus(
  userId: string,
  week = weekKey(),
  top = 20,
): Promise<WeeklyStatus> {
  const mine = await query<{
    score: number;
    turns: number;
    banks: number;
    busts: number;
    hot_dice: number;
    best_turn: number;
    attempts: number;
    rank: string;
  }>(
    `WITH ranked AS (
       SELECT user_id, score, turns, banks, busts, hot_dice, best_turn, attempts,
              RANK() OVER (ORDER BY score DESC, best_at ASC) AS rank
         FROM weekly_runs WHERE week = $1
     )
     SELECT * FROM ranked WHERE user_id = $2`,
    [week, userId],
  );
  const own = mine.rows[0];

  const board = await query<{
    username: string;
    avatar: string | null;
    score: number;
    turns: number;
    best_turn: number;
    busts: number;
    hot_dice: number;
    attempts: number;
    rank: string;
    user_id: string;
  }>(
    `SELECT u.username, u.profile ->> 'avatar' AS avatar,
            r.score, r.turns, r.best_turn, r.busts, r.hot_dice, r.attempts, r.user_id,
            RANK() OVER (ORDER BY r.score DESC, r.best_at ASC) AS rank
       FROM weekly_runs r JOIN users u ON u.id = r.user_id
      WHERE r.week = $1
      ORDER BY rank
      LIMIT $2`,
    [week, top],
  );

  const total = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM weekly_runs WHERE week = $1`,
    [week],
  );

  // What this player, and everyone on the board with them, has to show for the
  // weeks that have already CLOSED.
  const placings = await closedWeekPlacings([userId, ...board.rows.map((r) => r.user_id)], week);
  const mineClosed = placings.get(userId) ?? { wins: 0, podiums: 0 };

  const champions = await weeklyChampions(week);
  const reigning = champions[0] ?? null;

  // Keep the account's copy in step, so the count reaches the Stats screen and
  // the leaderboards rather than living only in this response.
  if (mineClosed.wins > 0) await raiseWeeklyWins(userId, mineClosed.wins);

  return {
    week,
    best: own
      ? {
          score: own.score,
          turns: own.turns,
          banks: own.banks,
          busts: own.busts,
          hotDice: own.hot_dice,
          bestTurn: own.best_turn,
          complete: true,
        }
      : null,
    attempts: own?.attempts ?? 0,
    attemptLimit: weeklyAttemptLimit(week),
    streak: await currentStreak(userId, week),
    leaderboard: board.rows.map((r) => ({
      username: r.username,
      avatar: r.avatar ?? "",
      score: r.score,
      turns: r.turns,
      bestTurn: r.best_turn,
      busts: r.busts,
      hotDice: r.hot_dice,
      attempts: r.attempts,
      wins: placings.get(r.user_id)?.wins ?? 0,
      rank: Number(r.rank),
      you: r.user_id === userId ? true : undefined,
      crown: reigning && r.user_id === reigning.userId ? (true as const) : undefined,
    })),
    yourRank: own ? Number(own.rank) : null,
    players: Number(total.rows[0]?.n ?? 0),
    eliteEarned: mineClosed.podiums > 0,
    wins: mineClosed.wins,
    champion: reigning && strip(reigning),
    champions: champions.map(strip),
  };
}
