/**
 * A plain calendar date, rendered in the reader's own timezone.
 *
 * Built from the parts rather than `new Date("2026-08-12")`, which JavaScript
 * reads as UTC midnight — and anywhere west of London that prints as the day
 * before, which would put every daily run and every release on the wrong date.
 *
 * Shared because both boards that carry a date — the all-time daily leaderboard
 * and the daily screen's roll of past champions — read the same YYYY-MM-DD the
 * server sends, and a second copy of this is a second chance to bring that bug
 * back. (The update log formats its own dates: it spells the month out.)
 */
export function formatDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
