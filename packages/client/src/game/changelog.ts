/**
 * What changed, release by release.
 *
 * Kept as data rather than prose so the screen can list the versions down one
 * side and the notes down the other. Newest first: RELEASES[0] is what the game
 * is running, and what the Update Log opens on.
 *
 * The notes are deliberately NOT in the translation catalog. Release notes are a
 * record of what was done on a date — they are written once, in the language
 * they were written in, and a half-translated history is worse than an honest
 * untranslated one. The screen's own furniture (its title, the back button) is
 * translated as usual.
 */

import { loadProfile } from "./profile.js";

export interface Release {
  /** Matches the version in package.json, which is what the home screen shows. */
  version: string;
  /** Release date as YYYY-MM-DD; rendered in the reader's own timezone. */
  date: string;
  notes: string[];
}

export const RELEASES: Release[] = [
  {
    version: "0.6.2",
    date: "2026-08-28",
    notes: [
      "By default, a local game will start with 3 bots now, with each different variant",
      "Fixed some grammatical errors in the local game menu",
      'Daily Challenge turns can now count toward the "Best Turn" leaderboard',
      'Fixed the "Top 10 Daily Challenge" achievement to only award if you are in the top 10 at the end of the day',
      "You can now click/tap on players on the Daily Challenge leaderboard to see information about their run",
      "Added some new achievements regarding Daily Challenge streaks",
      "Added a new stat that will track how many 1st place finishes you have in the Daily Challenge",
      "Added an announcement when entering the Daily Challenge congratulating who won the previous day",
      "Added a crown on the daily challenge leaderboard to who won the previous day",
      "The Update Log button now lights up once when there's a new version you haven't read",
    ],
  },
  {
    version: "0.6.1",
    date: "2026-08-18",
    notes: [
      "NEW RULE: Rolling a 5-of-a-kind of any number will give you 1000 points",
      "Added the ability to lock & unlock dice by clicking/tapping on an individual die",
      "Fixed a bug where you could create multiple accounts on the same device and copy over save data",
    ],
  },
  {
    version: "0.6.0",
    date: "2026-08-18",
    notes: [
      "Fixed Daily Challenge dice to have a smooth rolling animation",
      "Fixed Daily Challenge Bank button not resetting the dice image",
      "Fixed Daily Challenge Roll button taking multiple presses on a new turn",
      "Fixed an issue in Online games where the game would freeze for a player",
      "Fixed an issue with Online games where a player would see different dice rolled than everyone else",
      "Added an option in the Online menu to turn off the turn timer",
      "Changed the display angle of the 3-D dice so that the other visible side is less visible",
      "Improved the glow on dice that add to your score so that it stands out more",
      "Added indicators whenever you roll a 3-of-a-kind or a Straight",
      "The Daily Challenge leaderboard is now hidden until you finish your daily run",
      "The Friends menu will automatically refresh every 5 seconds when you're sitting in it",
      "Improved login memory so that you don't have to sign back into your account every time you open the game",
      "Added all-time Daily Challenge high scores to the Leaderboards",
      "Added an Update Log (hi!)",
    ],
  },
];

// ---------------------------------------------------------------------------
// "There's something new here"
// ---------------------------------------------------------------------------

/** The version the log opens on — what the game is running. */
export const LATEST_VERSION = RELEASES[0]?.version ?? "";

/** The newest release this device has actually opened the log for. */
const SEEN_KEY = "greed:seenVersion";

function readSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Remember that the log has been read up to `version`.
 *
 * Called when the Update Log is opened, which is what makes the highlight fire
 * once per release rather than every time the home screen is drawn.
 */
export function markReleaseSeen(version = LATEST_VERSION): void {
  try {
    localStorage.setItem(SEEN_KEY, version);
  } catch {
    /* ignore storage failures */
  }
}

/**
 * Is there a release this device hasn't read the notes for?
 *
 * NOT a pure read: with no record at all it decides which kind of player this
 * is and may write one. A brand-new install has not MISSED anything — nothing
 * about the game is old news to someone seeing it for the first time — so its
 * record is seeded quietly and the highlight stays off. A device that has
 * played before genuinely hasn't seen this release, so it lights up, and
 * nothing is written until they open the log: bouncing off the home screen
 * must not count as having read it.
 *
 * The distinction matters exactly once, on the release that introduces this,
 * where NOBODY has a record yet. Without it the choice is between every
 * existing player missing the first notice and every new player getting a
 * false one.
 */
export function hasUnreadRelease(): boolean {
  if (!LATEST_VERSION) return false;
  const seen = readSeen();
  if (seen === null) {
    if (loadProfile().gamesPlayed > 0) return true;
    markReleaseSeen();
    return false;
  }
  return seen !== LATEST_VERSION;
}
