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

export interface Release {
  /** Matches the version in package.json, which is what the home screen shows. */
  version: string;
  /** Release date as YYYY-MM-DD; rendered in the reader's own timezone. */
  date: string;
  notes: string[];
}

export const RELEASES: Release[] = [
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
