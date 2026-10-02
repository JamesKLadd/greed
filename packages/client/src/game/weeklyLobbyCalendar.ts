import { dailyKey, weekKey, type AttemptPeriod } from "@greed/core";

/** A daily allowance must refill even when the competition's week stays put.
 * Active runs keep their mounted controller until it finishes or reconciles. */
export function weeklyLobbyNeedsRefresh(
  current: { week: string; day: string; period: AttemptPeriod | null },
  runOpen: boolean,
  now: Date = new Date(),
): boolean {
  return (
    !runOpen &&
    (weekKey(now) !== current.week || (current.period === "day" && dailyKey(now) !== current.day))
  );
}
