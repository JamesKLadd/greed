/**
 * Holiday runners-up: when one player sweeps a holiday — its Daily AND its
 * Weekly — nobody else can win that holiday's gold dice, so the player who
 * finished second on the holiday Weekly is given them.
 *
 * Given as a gift (cosmetic_gifts), never as the trophy: the trophy's badge
 * says "Halloween Champion", and second place is not that. The dice alone, and
 * the popup that announces them says they are a gift. First done by hand for
 * Halloween 2026 (db.ts, "gold-pumpkin-jimmy-2026-11"); this is that, as a rule.
 *
 * Decided once per holiday week, the first time the week is banked into
 * challenge_wins — while its runs are still on record to say who was second —
 * and written down in holiday_runner_ups whatever the answer, so a week is
 * never re-decided later from whatever runs survive the 30-day cleanup. That
 * is the same rule the wins ledger keeps: a closed period's result stands.
 */
import { HOLIDAY_GOLD_DICE, holidayDailyOfWeek, holidayOfWeek } from "@greed/core";
import { holidayTrophies } from "./accounts.js";
import { query } from "./db.js";
import { refreshCareerChallengeWins } from "./leaderboards.js";
import { WEEKLY_ORDER } from "./ranking.js";

/**
 * Decide every banked holiday week not yet decided. Safe to run repeatedly and
 * concurrently: the ledger's primary key lets exactly one caller decide a week.
 */
export async function settleHolidayRunnersUp(): Promise<void> {
  const { rows: weeks } = await query<{ week: string; winner: string }>(
    `SELECT w.period::text AS week, w.user_id AS winner
       FROM challenge_wins w
      WHERE w.kind = 'weekly'
        AND NOT EXISTS (SELECT 1 FROM holiday_runner_ups h WHERE h.week = w.period)`,
  );
  const holidayWeeks = weeks.filter((w) => holidayOfWeek(w.week));
  if (holidayWeeks.length === 0) return;
  // The holiday's Daily always closes before its week does; bank it first, so
  // "nobody won it" is never mistaken for "not counted yet".
  await refreshCareerChallengeWins("daily");
  for (const { week, winner } of holidayWeeks) {
    const holiday = holidayOfWeek(week)!;
    const day = holidayDailyOfWeek(week);
    const { rows: daily } = await query<{ user_id: string }>(
      `SELECT user_id FROM challenge_wins WHERE kind = 'daily' AND period = $1::date`,
      [day],
    );
    const swept = daily[0]?.user_id === winner;
    const second = swept
      ? ((
          await query<{ user_id: string }>(
            `SELECT user_id FROM weekly_runs
              WHERE week = $1::date AND score > 0 AND user_id <> $2
              ORDER BY ${WEEKLY_ORDER} LIMIT 1`,
            [week, winner],
          )
        ).rows[0]?.user_id ?? null)
      : null;
    const { rows: decided } = await query(
      `INSERT INTO holiday_runner_ups (week, holiday, user_id) VALUES ($1::date, $2, $3)
       ON CONFLICT (week) DO NOTHING RETURNING week`,
      [week, holiday, second],
    );
    // Another caller decided it first, or there is nobody to give it to.
    if (decided.length === 0 || !second) continue;
    // A player who has won this holiday before already has its gold dice.
    if ((await holidayTrophies(second)).includes(`${holiday}-champion`)) continue;
    await query(
      `INSERT INTO cosmetic_gifts (user_id, cosmetic) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [second, HOLIDAY_GOLD_DICE[holiday]],
    );
  }
}
