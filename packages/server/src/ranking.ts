/**
 * How the weekly's standings are ordered, written once.
 *
 * Six queries rank weekly runs — this week's board, the player's own rank on
 * it, the closed-week win and podium counts, the champion of each week, the
 * career wins tally, and the all-time board. They have to give the same answer:
 * a tally that disagrees with the board credits a win to somebody the board
 * does not show in first place, which is a bug this module exists to make
 * impossible rather than to keep catching.
 */

/**
 * Score first, then the best single turn of the run, then who got there first.
 *
 * The middle term is the one that was missing. Two players finishing a week on
 * the same total is common — the scores are round numbers built out of round
 * numbers — and it was settled purely on who reached it earlier, which rewards
 * playing at the right hour rather than playing well. The biggest turn of the
 * run is the better answer to "who played this week harder", and it is already
 * on the row.
 *
 * `best_at` stays as the final term so a tie is still broken, always, by
 * something: two players on the same score AND the same best turn is rare, and
 * a board with two firsts would leave the week with two winners and the crown
 * with two owners.
 */
export const WEEKLY_ORDER = "score DESC, best_turn DESC, best_at ASC";

/** The same, qualified, for the queries that alias `weekly_runs` as `r`. */
export const WEEKLY_ORDER_R = "r.score DESC, r.best_turn DESC, r.best_at ASC";

/**
 * The all-time board, which ranks runs from DIFFERENT weeks against each other.
 *
 * Same rule as far as it goes; the last term is the week rather than the
 * instant, because across weeks "“who got there first" means the earlier week.
 */
export const WEEKLY_ALLTIME_ORDER_R = "r.score DESC, r.best_turn DESC, r.week ASC";
