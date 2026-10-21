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
    version: "0.8.5",
    date: "2026-10-15",
    notes: [
      "Added seasonal themes to the menus & game for Halloween, Christmas, and Summer",
      "Local and online bots now aim for larger turns when far behind, with stronger catch-up play as the leader approaches the goal while keeping their different temperaments",
      "Bots now account for straights and five of a kind built from held dice, and make better final-round and sudden-death decisions about ties and opponents still to play",
      "Added holiday dice you can only earn by playing on the holiday: pumpkin dice on Halloween, tree ornament dice on Christmas Day, and beach ball dice any day of summer. Signing in on the day unlocks them with a popup",
      "Added statistical data for every throw: compare your busts, three of a kind, straights, five of a kind and hot dice against the exact odds, see your score over time, and export it all as a CSV. Find it under View Statistical Data in the Daily Challenge, Weekly Challenge and Stats screens",
      "Statistical data now also counts games left unfinished, and adds your decisions against the best play for points, your banking habits, where your points come from, your luck over time and how it compares with other players, a 7, 30 or 100 day view, and a decisions CSV",
    ],
  },
  {
    version: "0.8.4",
    date: "2026-10-08",
    notes: [
      "Investigated dice fairness across all roll outcomes and large simulations. Opening rolls and rolls after hot dice use the same odds; the dice generator and probabilities have not changed",
      "Removed internal dice prediction information from challenge and online game responses",
      "Fixed overlapping challenge requests losing progress or saving incomplete results, including requests waiting across a daily or weekly reset",
      "Releasing dice from a rolled straight or five of a kind now preserves the remaining dice's ordinary points",
      "Fixed rapid online inputs submitting extra rolls, and rematches showing animations from the previous game",
      "Fixed consecutive hot dice being undercounted and career-best turns being missed in lower-scoring weekly attempts",
      "Banking 2500+ in one turn now earns the Tidal Wave achievement in Daily and Weekly Challenges, including attempts that do not beat your standing score",
      "Fixed Daily Challenge streaks stopping at 31 days when older run records were cleared. Completed challenge dates are now preserved so streaks can keep growing",
      "Fixed past Weekly Challenge winners disappearing after 31 days. Winners and scores are now preserved for the previous 52 completed weeks (one year), with older recorded winners restored where available",
      "Daily and Weekly Challenge all-time leaderboards now preserve scores permanently, including personal bests and rankings, while old replay data is cleared",
      "Daily and Weekly all-time leaderboards now show equipped Locker portraits beside scores and personal bests",
      "Equipped Locker portraits now also appear on Wins, Best Turn, Best Streak, Best Total, Daily Wins and Weekly Wins leaderboards, including your personal standing outside the top 25",
      "Weekly results now show how much your best improved or confirm that your standing best remains. Daily and Weekly runs subtly highlight new all-time personal bests without opening a popup",
      "Locker previews now show unlock requirements with progress from your saved stats, and explain when an item is only a preview sample",
      "Added clearer pending-button feedback, keyboard activation sounds and focus indicators, plus fixes for long names on narrow phones and landscape screens",
    ],
  },
  {
    version: "0.8.3",
    date: "2026-10-05",
    notes: [
      "Local and online games now show the goal score in the header and progress bars beside each player's banked score. Player details also show how many points are still needed",
      "Team games now show shared progress toward the goal while keeping each player's personal contribution visible. Reaching the goal fills the bar without hiding higher scores during the final round",
      "Made the dice larger on the illustrated table and adjusted Classic dice sizing where space permits, keeping all five dice visible on small screens",
      "Improved Classic score cards and team totals on narrow phones and short landscape screens so goal bars remain visible during thinking, disconnected play, and the final round",
      "Added accessible goal descriptions, reduced-motion and high-contrast support, and English, Spanish, and French translations for the new indicators",
      "Practice completion and Daily entry now offer direct account creation, with sign-in for returning players. Signed-in players can go straight from practice to today's challenge",
      "Daily and Weekly challenge links now keep your destination through refreshes and account sign-in. Ranked attempts still begin only when you choose Start",
      "Practice scores are now clearly marked as unranked, and banking tips confirm when your points are safe",
      "Expanded the owner's growth report with ordered paths through practice, daily play, and room invitations, including drop-off counts, campaign completion rates, and clearer return-visit information",
      "Improved welcome-page campaign tracking and measurement delivery during quick navigation, while preserving browser privacy signals and opt-out settings",
      "Added English, Spanish, and French translations for the new onboarding and report text, plus updated privacy information and mobile launch materials",
    ],
  },
  {
    version: "0.8.2",
    date: "2026-10-05",
    notes: [
      "Learn to play now opens a three-turn practice challenge with tips for rolling, banking, busts, and hot dice. Practice works offline and never uses a ranked attempt",
      "The main menu now shows whether your Daily Challenge is ready to start, waiting to resume, or finished and ready to share",
      "Daily results now include a shareable score card with your equipped portrait, score, best turn, and current place. Share a message and link, or save a score image",
      "Daily and Weekly Challenges now have a Friends leaderboard alongside Everyone. Only accepted friends appear, and daily standings still unlock after you finish your run",
      "Private online rooms now have shareable invitation links that keep your room saved through sign-in and lobby reloads",
      "Added a mobile welcome page with an instant practice link, plus privacy information and a Settings switch for optional usage measurements",
      "Improved challenge and sharing layouts on small screens, including large text, high contrast, and English, Spanish, and French translations",
    ],
  },
  {
    version: "0.8.1",
    date: "2026-10-03",
    notes: [
      "The Weekly Challenge leaderboard now stays visible during a run",
      "Daily and Weekly Challenges now show the profile pictures from the Locker beside player names",
    ],
  },
  {
    version: "0.8.0",
    date: "2026-10-02",
    notes: [
      "Greed's new visual design is now the default: a memorable logo, casino-inspired colors, larger menu buttons, and illustrated characters around the table. Return to Classic is still available from the main menu, and switching back no longer needs a password",
      "Redesigned Daily and Weekly Challenge screens with clearer start and resume actions, turn and score displays, attempt allowances, results, and leaderboard details. Celebration popups stay out of challenge play",
      "Improved the existing table layout with clearer active turns, banked and at-risk scores, held-dice markers, final-round flags, online connection notices, and player details",
      "Added distinct fox, bear, panda, cat, owl, and frog artwork with matching profile portraits, brief character reactions, and refined felt, rails, and dice materials",
      "The Locker now previews complete looks with portraits, frames, backgrounds, nameplates, badges, and cosmetic effects. Equipped earned dice, tables, and portrait styles save to your profile; former temporary beta samples remain preview-only",
      "Polished local setup, results, accounts, settings, friends, stats, and the Locker for phones, including large text, high contrast, reduced motion, and translated screens",
      "Improved game-menu sound controls and short-screen dialogs. Backgrounding the game now stops old sound effects from replaying when you return, and failed music loading no longer retries continuously while offline",
      "Reduced the main JavaScript entry by about 35 percent, added screen-loading recovery, and improved offline caching and updates so installed games include screens you haven't opened yet. Existing open games finish before an update takes over",
    ],
  },
  {
    version: "0.7.3",
    date: "2026-09-21",
    notes: [
      "Your equipped dice skin now shows in the Daily and Weekly Challenges, instead of the plain ivory dice you got whatever you had on",
      "Daily and Weekly Challenge places are now decided by your best single turn when two runs finish on the same score, and only then by who got there first",
      "Fixed the Weekly wins leaderboard handing out a win for the week still being played. A week only counts once it has finished, and the wins credited early have been taken back",
      "Fixed your Daily wins reading one number on your profile and a different one on the leaderboard. Every screen now shows the same count, worked out by the server",
      "Fixed Daily and Weekly wins no longer going up once your earliest wins were more than 30 days old. Every day and week you win is now recorded for good and added to your total",
      "Visual Beta: players sitting down the sides of the table no longer have their feet drawn on top of it, and your own character no longer covers the label under your score",
      "Visual Beta: the banner after a roll, a bank or a bust no longer stays up into the next player's turn",
    ],
  },
  {
    version: "0.7.2",
    date: "2026-09-14",
    notes: [
      "The Weekly Challenge now gives you 10 attempts every day instead of 50 for the whole week, starting with the week of September 21st. A week's worth of tries can no longer be spent on Monday, and this week still runs on the 50 you were promised",
      "Leaderboards has two new categories: Daily wins and Weekly wins, counting the days and weeks you finished top of the board. Worked out by the server from the runs themselves, and only counted once that day or week has closed",
    ],
  },
  {
    version: "0.7.1",
    date: "2026-09-12",
    notes: [
      "Fixed a bug where finishing a straight across several rolls didn't count as one — holding 2, 3, 4, 5 and rolling the last die paid only what that die was worth, and busted you outright when it was a 2, 3, 4 or 6 instead of scoring 500",
      "How to play now says that a straight, like 5-of-a-kind, can be built up over several rolls",
      "The 3 of a kind / straight / 5 of a kind banner in Daily and Weekly Challenges no longer gets covered by the dice, and no longer shifts the screen when it appears",
      "Daily and Weekly Challenge results now show Super busts: how many turns you lost on a full throw of all five dice, either opening the turn or rolling a fresh five after hot dice. It appears on your own run and on any player you tap on the leaderboard, and runs you had already played are counted too",
    ],
  },
  {
    version: "0.7.0",
    date: "2026-09-09",
    notes: [
      "The Wins, Best Turn, Best Streak and Best Total leaderboards are now worked out by the server from games you actually played online, so they can't be faked. Games against bots still count toward your own stats, and the Daily and Weekly boards are unchanged",
      "Online games now use about half as much data, and the background music download is about half the size",
      "Fixed online play not working at all in browsers with cookies or site data blocked",
      "You can now hold and release dice with the keyboard — press 1 to 5, or tab to a die and press Enter. Pressing Enter on a die used to bank your turn instead",
      "In-game messages and error messages are now translated — they were English no matter which language you had chosen",
      "Players whose names aren't written in the Latin alphabet can now use their real names",
      "Changing your password now signs you out on every other device",
      "The last 5 seconds of your turn in an online game now show a countdown and play a sound",
      "Missed turns in an online game now wear off as you keep playing, instead of counting against you for the whole game",
      "The 3 of a kind / straight / 5 of a kind banner now appears in Daily and Weekly Challenges, not just at the table",
      "A die you're not allowed to unhold now tells you why",
      "Fixed a phantom dice roll that played when you reconnected to an online game or started watching one",
      "Fixed the setup screen moving your cursor to the wrong player after removing a seat",
      "Private room codes are now much harder to guess, and abandoned rooms are cleaned up properly",
      "Very common passwords are now refused when you sign up, and signing up no longer reveals whether an email address already has an account",
      "Match history and old Daily and Weekly runs are now cleared out after 30 days",
    ],
  },
  {
    version: "0.6.4",
    date: "2026-09-09",
    notes: [
      "The Weekly Challenge now gives you 50 attempts per week instead of unlimited attempts, starting with the week of September 14th. You can still use them whenever you like during the week",
      "Fixed a bug where building a 5-of-a-kind across several rolls would bust you instead of scoring 1000, when the number wasn't a 1 or a 5",
      "Fixed a pause before the dice rolled on the last turn of a Daily or Weekly Challenge that gave away that you had busted",
      "The roll that ends a Daily or Weekly Challenge now stays on screen as long as every other roll instead of disappearing straight away",
      "Players in Online games now get 30 seconds to take their turn instead of 10, so briefly switching apps won't cost you your seat",
      "Fixed emotes in Online games being cut off on mobile",
      "Your equipped table style is now shown to you for the whole of an Online game, instead of changing to whoever's turn it is",
      "Added 🥹 as an emote in Online games",
      "How to play now covers holding dice, including the rule that you must keep at least one die held after your first roll",
    ],
  },
  {
    version: "0.6.3",
    date: "2026-08-31",
    notes: [
      "Added a new gamemode called Weekly Challenge which works similarly to the Daily Challenge however you can attempt the challenge as many times as you'd like throughout the week",
      "Added new Achievements, Stats, and Locker items associated with the Weekly Challenge",
      "NEW RULE: After your first roll you must keep at least one die held, so you can no longer unhold every die and reroll all 5",
      "Fixed the game forgetting your language setting if you had it set to French",
    ],
  },
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
      "Moved the flag indicator on a player's card from the bottom left to the top left",
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
