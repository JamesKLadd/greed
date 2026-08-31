/**
 * The wall clock the timed challenges run on.
 *
 * A ZONE, not a fixed offset. "CST" literally means UTC-6 all year, but US
 * Central observes daylight saving — so a hardcoded -6 would roll the period
 * over at 1am local for the eight months the zone is on CDT. Naming the zone
 * keeps every reset at local midnight in both halves of the year.
 *
 * Both the client and the server derive their period from this, so they must
 * agree: that needs an ICU-complete runtime, which Node 20+ and every browser
 * we target are.
 *
 * Lives apart from the challenges themselves because the daily and the weekly
 * both reset on this clock, and two copies of DST arithmetic is two chances to
 * disagree about which day it is.
 */

/** The zone every challenge period is measured in. */
export const CHALLENGE_ZONE = "America/Chicago";

const zoneFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: CHALLENGE_ZONE,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** An instant, read as a wall clock in the challenge zone. */
export function zonedParts(ts: number): ZonedParts {
  const found: Record<string, string> = {};
  for (const part of zoneFormat.formatToParts(new Date(ts))) {
    if (part.type !== "literal") found[part.type] = part.value;
  }
  return {
    year: Number(found.year),
    month: Number(found.month),
    day: Number(found.day),
    // Some engines render midnight as hour 24 under hour12:false.
    hour: Number(found.hour) % 24,
    minute: Number(found.minute),
    second: Number(found.second),
  };
}

/** How far the zone's wall clock is ahead of UTC at this instant, in ms. */
export function zoneOffsetMs(ts: number): number {
  const p = zonedParts(ts);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // formatToParts has no milliseconds, so compare on whole seconds. Offsets are
  // whole minutes, so nothing is lost.
  return asUtc - Math.floor(ts / 1000) * 1000;
}

/** The instant local midnight begins on a given local calendar date. */
export function zonedMidnight(year: number, month: number, day: number): number {
  const wall = Date.UTC(year, month - 1, day);
  // Correct by the offset in force at the guess, then re-check: near a DST
  // boundary the first correction can land on the other side of it.
  const first = wall - zoneOffsetMs(wall);
  const second = wall - zoneOffsetMs(first);
  return second;
}

/** A local calendar date as YYYY-MM-DD. */
export function dateKey(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}
