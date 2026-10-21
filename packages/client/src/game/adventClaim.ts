import { ADVENT_DOOR_EVENT, openNextDoor, type AdventDoor } from "./advent.js";
import { loadProfile, replaceProfile } from "./profile.js";

/**
 * A game or challenge run just finished: open the next advent door, if the
 * date allows one (advent.ts has the rule). Returns the door opened, or null.
 *
 * Called beside `claimHolidayDice`, where every game and run is recorded, and
 * never at sign-in — the calendar opens for playing, not for showing up. The
 * door is announced app-wide so the popup can say what was behind it; the
 * caller syncs the profile up, as it already does for everything else a game
 * changes.
 */
export function claimAdventDoor(date: Date = new Date()): AdventDoor | null {
  const opened = openNextDoor(loadProfile(), date);
  if (!opened) return null;
  replaceProfile(opened.profile);
  if (typeof window !== "undefined" && typeof CustomEvent !== "undefined") {
    window.dispatchEvent(new CustomEvent(ADVENT_DOOR_EVENT, { detail: opened.door.door }));
  }
  return opened.door;
}
