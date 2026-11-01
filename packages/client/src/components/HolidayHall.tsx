import { holidayOfChallenge, type Holiday } from "@greed/core";
import { useT, type MsgKey } from "../i18n/i18n.js";

/** Each holiday's mark in the record of past winners. */
const MARKS: Record<Holiday, string> = {
  newyear: "🎆",
  valentines: "💝",
  stpatricks: "☘️",
  summer: "🎇",
  halloween: "🎃",
  thanksgiving: "🦃",
  christmas: "🎄",
};

/*
 * Past winners, dressed for the holidays: the Daily played on a holiday and
 * the Weekly around it are the ones that hand out holiday trophies, so their
 * rows in the record say so — in the holiday's colours, with its name. Read
 * from holidayOfChallenge (core/holidays.ts), the same rule the server uses to
 * grant the trophy, so the row and the trophy can never disagree.
 */

export function hallRowClass(kind: "daily" | "weekly", period: string): string {
  const holiday = holidayOfChallenge(kind, period);
  return holiday
    ? `daily-hall__row daily-hall__row--holiday daily-hall__row--${holiday}`
    : "daily-hall__row";
}

export function HolidayHallTag({ kind, period }: { kind: "daily" | "weekly"; period: string }) {
  const t = useT();
  const holiday = holidayOfChallenge(kind, period);
  if (!holiday) return null;
  const event = t(`holiday.event.${holiday}` as MsgKey);
  return (
    <span className="daily-hall__holiday">
      <span aria-hidden="true">{MARKS[holiday]}</span>{" "}
      {t(kind === "daily" ? "hall.holidayDaily" : "hall.holidayWeekly", { event })}
    </span>
  );
}
