import type { GameState } from "@greed/core";
import type { MsgKey } from "../i18n/i18n.js";

/**
 * Naming and colouring for the two sides of a team game.
 *
 * The sides are engine-level indices (0 and 1) everywhere else; this is the one
 * place that turns them into something a player reads. They are named by colour
 * rather than "A"/"B" because the pods, the scoreboard chips and the game-over
 * standings all tint by side — a name that matches what you can see beats a
 * letter you have to map onto it.
 */

/** i18n keys for each side's name, indexed by side. */
const TEAM_KEYS: MsgKey[] = ["team.0", "team.1"];

export function teamName(t: (key: MsgKey) => string, side: number): string {
  return t(TEAM_KEYS[side] ?? TEAM_KEYS[0]);
}

/** True when this game is being played as two sides. */
export function isTeamGame(state: GameState): boolean {
  return state.teams !== null;
}
