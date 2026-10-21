import { challengeDate } from "@greed/core";
import { ADVENT_DOOR_COUNT } from "@greed/protocol";
import type { Profile } from "./profile.js";

/**
 * The advent calendar: December 1st to the 24th, a door a day, something
 * behind every door.
 *
 * A door opens when a game or challenge run finishes — one door per finish,
 * but never past today's date. So a player who starts on the 10th can catch
 * up on doors 1–10 that day by playing ten games, and from then on it is a
 * door a day, the way an advent calendar goes. Door 24 opens on Christmas Eve
 * at the earliest, whoever you are.
 *
 * What a player has opened is kept per year (`profile.advent`, year → doors),
 * and the account keeps the higher of two devices' counts per year, so a
 * second phone never closes a door. The items are kept for good: a door opened
 * in any year unlocks its item, and next December the calendar starts again
 * from door 1 with nothing to lose.
 */
export type AdventKind = "dice" | "table" | "avatar" | "hat";

export interface AdventDoor {
  /** 1-24. */
  door: number;
  kind: AdventKind;
  id: string;
}

const ITEMS: [AdventKind, string][] = [
  ["dice", "candy-cane"],
  ["avatar", "snowman"],
  ["table", "peppermint-felt"],
  ["hat", "elf-hat"],
  ["dice", "gingerbread"],
  ["avatar", "present"],
  ["table", "snowfall-felt"],
  ["dice", "mistletoe"],
  ["avatar", "elf"],
  ["hat", "antlers"],
  ["dice", "silver-bells"],
  ["table", "fireside-felt"],
  ["avatar", "cookie"],
  ["dice", "frosted-glass"],
  ["table", "gift-wrap-felt"],
  ["hat", "holly-crown"],
  ["dice", "cranberry"],
  ["avatar", "teddy"],
  ["table", "aurora-felt"],
  ["dice", "evergreen"],
  ["avatar", "shooting-star"],
  ["hat", "bobble-hat"],
  ["dice", "snowdrift"],
  // Christmas Eve: the one shaped die in the calendar.
  ["dice", "gift-box"],
];

export const ADVENT_DOORS: readonly AdventDoor[] = ITEMS.map(([kind, id], i) => ({
  door: i + 1,
  kind,
  id,
}));

export const ADVENT_LAST_DOOR = ADVENT_DOOR_COUNT;

/** The door an item is behind, if it is an advent item. */
export function adventDoorFor(id: string): number | undefined {
  return ADVENT_DOORS.find((d) => d.id === id)?.door;
}

/** The most doors this player has opened in any one year. */
export function adventDoorsOpened(profile: Pick<Profile, "advent">): number {
  const years = Object.values(profile.advent ?? {});
  return Math.max(0, ...years.map((n) => (Number.isFinite(n) ? n : 0)));
}

/** True when the advent item has been found behind its door, in any year. */
export function adventUnlocked(id: string, profile: Pick<Profile, "advent">): boolean {
  const door = adventDoorFor(id);
  return door !== undefined && adventDoorsOpened(profile) >= door;
}

/**
 * Advent today: the year and the furthest door that may be open by now, or
 * null outside December 1–24 (Chicago calendar).
 */
export function adventToday(date: Date = new Date()): { year: number; day: number } | null {
  const today = challengeDate(date);
  if (!today || today.month !== 12 || today.day > ADVENT_LAST_DOOR) return null;
  return { year: today.year, day: today.day };
}

/** Whether the calendar is worth showing: December, through the 31st. */
export function adventSeason(date: Date = new Date()): number | null {
  const today = challengeDate(date);
  return today && today.month === 12 ? today.year : null;
}

/**
 * The profile after a finished game or run: the next door opened, if today's
 * date allows it. Returns the door opened, or null when there was none to open.
 */
export function openNextDoor(
  profile: Profile,
  date: Date = new Date(),
): { profile: Profile; door: AdventDoor } | null {
  const today = adventToday(date);
  if (!today) return null;
  const key = String(today.year);
  const opened = profile.advent?.[key] ?? 0;
  if (opened >= today.day || opened >= ADVENT_LAST_DOOR) return null;
  const next = opened + 1;
  return {
    profile: { ...profile, advent: { ...profile.advent, [key]: next } },
    door: ADVENT_DOORS[next - 1],
  };
}

/** Doors opened this December, for the calendar screen. */
export function adventOpenedIn(profile: Pick<Profile, "advent">, year: number): number {
  return profile.advent?.[String(year)] ?? 0;
}

/** Window event announcing a newly opened door; `detail` is the door number. */
export const ADVENT_DOOR_EVENT = "greed:advent-door";
