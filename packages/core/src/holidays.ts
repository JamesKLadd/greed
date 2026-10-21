/**
 * The holiday calendar, on the same Chicago clock as the challenges.
 *
 * Three questions are asked of it, and they have different answers on purpose:
 *
 *   - Whose decorations are up (`seasonOnDate`): a stretch of days leading to
 *     the holiday, so the menus can dress for it.
 *   - Whose gifts can be earned (`holidayOnDate`): the day itself — only Summer,
 *     a season rather than a day, is generous. That scarcity is what makes the
 *     holiday dice the rarest things in the Locker.
 *   - Which challenge is the holiday's (`trophyDay`, `holidayOfDaily`,
 *     `holidayOfWeek`): exactly one Daily a year, and the week it falls in.
 *     Summer, having no single day, plays for its trophy on the Fourth of July.
 *
 * Here in core rather than in the client because the server needs the third
 * answer: it is the one that reads the permanent wins ledger and hands out the
 * holiday trophies, and a client must never be the one to say who won.
 */
import { dateKey, zonedParts } from "./zone.js";

export type Holiday =
  "newyear" | "valentines" | "stpatricks" | "summer" | "halloween" | "thanksgiving" | "christmas";

/** In calendar order, from January. */
export const HOLIDAYS: readonly Holiday[] = [
  "newyear",
  "valentines",
  "stpatricks",
  "summer",
  "halloween",
  "thanksgiving",
  "christmas",
];

export function isHoliday(value: unknown): value is Holiday {
  return HOLIDAYS.some((h) => h === value);
}

export interface CalendarDate {
  year: number;
  /** 1-12. */
  month: number;
  day: number;
}

/** The Chicago calendar date of an instant, or null for an invalid date. */
export function challengeDate(date: Date): CalendarDate | null {
  const ts = date.getTime();
  if (!Number.isFinite(ts)) return null;
  const p = zonedParts(ts);
  return { year: p.year, month: p.month, day: p.day };
}

/** The fourth Thursday of November, as a day of the month. */
export function thanksgivingDay(year: number): number {
  // Calendar arithmetic on a UTC date: no zone, so no daylight saving to trip on.
  const firstWeekday = new Date(Date.UTC(year, 10, 1)).getUTCDay();
  const firstThursday = 1 + ((4 - firstWeekday + 7) % 7);
  return firstThursday + 21;
}

/**
 * The holiday whose gifts can be earned on a date: the day itself (New Year's
 * is both the Eve and the Day), or any day of summer.
 */
export function holidayOnDate({ year, month, day }: CalendarDate): Holiday | null {
  if ((month === 12 && day === 31) || (month === 1 && day === 1)) return "newyear";
  if (month === 2 && day === 14) return "valentines";
  if (month === 3 && day === 17) return "stpatricks";
  if (month >= 6 && month <= 8) return "summer";
  if (month === 10 && day === 31) return "halloween";
  if (month === 11 && day === thanksgivingDay(year)) return "thanksgiving";
  if (month === 12 && day === 25) return "christmas";
  return null;
}

/**
 * The holiday whose decorations are up on a date. New Year's takes the last
 * night of December and the first days of January — what used to be the tail
 * of the Christmas theme — so the two never show at once.
 */
export function seasonOnDate({ month, day }: CalendarDate): Holiday | null {
  if ((month === 12 && day === 31) || (month === 1 && day <= 5)) return "newyear";
  if (month === 2 && day <= 14) return "valentines";
  if (month === 3 && day <= 17) return "stpatricks";
  if (month >= 6 && month <= 8) return "summer";
  if (month === 10) return "halloween";
  if (month === 11) return "thanksgiving";
  if (month === 12) return "christmas";
  return null;
}

/**
 * The badge for winning a holiday's Daily or Weekly: "halloween-champion".
 * Named here so the server, which grants it, and the client, which shows it,
 * cannot spell it two ways.
 */
export function holidayTrophy(holiday: Holiday): string {
  return `${holiday}-champion`;
}

/** The holiday's challenge day in a given year, as YYYY-MM-DD. */
export function trophyDay(holiday: Holiday, year: number): string {
  switch (holiday) {
    case "newyear":
      return dateKey(year, 1, 1);
    case "valentines":
      return dateKey(year, 2, 14);
    case "stpatricks":
      return dateKey(year, 3, 17);
    case "summer":
      return dateKey(year, 7, 4);
    case "halloween":
      return dateKey(year, 10, 31);
    case "thanksgiving":
      return dateKey(year, 11, thanksgivingDay(year));
    case "christmas":
      return dateKey(year, 12, 25);
  }
}

function parseKey(key: string): CalendarDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  return m ? { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) } : null;
}

/** The holiday whose Daily this is, if any. */
export function holidayOfDaily(day: string): Holiday | null {
  const d = parseKey(day);
  if (!d) return null;
  return HOLIDAYS.find((h) => trophyDay(h, d.year) === day) ?? null;
}

/**
 * The holiday whose Weekly this is — the week (named by its Monday) that holds
 * the holiday's challenge day. Christmas and New Year's Day are a week apart,
 * so they always fall in different weeks.
 */
export function holidayOfWeek(week: string): Holiday | null {
  const d = parseKey(week);
  if (!d) return null;
  const monday = Date.UTC(d.year, d.month - 1, d.day);
  for (let i = 0; i < 7; i++) {
    const at = new Date(monday + i * 86_400_000);
    const key = dateKey(at.getUTCFullYear(), at.getUTCMonth() + 1, at.getUTCDate());
    const holiday = holidayOfDaily(key);
    if (holiday) return holiday;
  }
  return null;
}

/**
 * Whole Chicago days until a holiday's gifts can next be earned (0 while they
 * can be now). Counted on calendar dates, so it changes at midnight and a
 * daylight-saving change cannot skip a day.
 */
export function daysUntilHoliday(holiday: Holiday, date: Date = new Date()): number | null {
  const today = challengeDate(date);
  if (!today) return null;
  const start = Date.UTC(today.year, today.month - 1, today.day);
  // Thanksgiving moves, so walk the calendar rather than compute a fixed date.
  for (let i = 0; i <= 366; i++) {
    const at = new Date(start + i * 86_400_000);
    const d = { year: at.getUTCFullYear(), month: at.getUTCMonth() + 1, day: at.getUTCDate() };
    if (holidayOnDate(d) === holiday) return i;
  }
  return null;
}
