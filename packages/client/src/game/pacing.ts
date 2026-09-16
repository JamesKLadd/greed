/**
 * How long each beat of a turn lasts.
 *
 * Its own module because two things need to agree about it and they live on
 * opposite sides of the app: the local controller, which decides when the next
 * player starts, and the visual beta's result banners, which decide how long a
 * moment stays on screen. They disagreed — banners outlived the turns they
 * belonged to and were still up while the next player was rolling — and two
 * sets of numbers in two files is how that happens.
 */

/** The dice tumble, from leaving the cup to settling. */
export const ROLL_ANIM_MS = 650;

/**
 * A bot's pause before it acts. Long enough that a run of bot rolls reads as a
 * turn being played rather than a flicker of dice.
 */
export const BOT_THINK_MS = 1300;

/**
 * How long a finished turn (bust or bank) stays on screen before play moves on.
 * Deliberately unhurried: a bust in particular needs a beat to land, and being
 * swept straight into the next turn reads as the game skipping past it.
 */
export const INTER_TURN_MS = 2100;

/**
 * One action inside a turn: the wait, then the throw it produces.
 *
 * What a mid-turn banner has to fit inside — past this, the next roll is
 * already landing underneath it.
 */
export const TURN_ACTION_MS = BOT_THINK_MS + ROLL_ANIM_MS;

/**
 * Clear air left at the end of a beat, so a banner has visibly gone before the
 * thing it was covering happens. Small enough to feel continuous; large enough
 * that a fade-out is not still running.
 */
export const BEAT_GAP_MS = 300;
