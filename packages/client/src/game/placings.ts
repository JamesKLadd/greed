import type { GameState } from "@greed/core";
import { teamTotal } from "@greed/core";

/**
 * The running order of a game in progress — who is winning, by how much.
 *
 * Kept apart from the component that draws it because the ranking is the part
 * that can be wrong: ties, and whose score a line is actually placed on. The
 * pods around the table show a seat's own banked total, which in a team game is
 * only that player's CONTRIBUTION — the game is decided by the side's shared
 * score. So a team game is placed by side, exactly as `scoreFor` in the engine
 * decides everything else, and the seats become members underneath.
 *
 * Banked points only. The turn in play is a maybe until it is banked, and the
 * table already shows it riding on the dice.
 */

/** One seat inside a side's line. */
export interface PlacingMember {
  id: string;
  name: string;
  /** This player's contribution to the side's total. */
  total: number;
  isYou: boolean;
}

/** One line of the placement board: a player, or a whole side. */
export interface Placing {
  /** Stable React key — the player's id, or `team:N` for a side. */
  key: string;
  /**
   * Position, 1-based. Level scores SHARE a place, so four players on 0 at the
   * start of a game are four firsts rather than an arbitrary 1-2-3-4 that
   * reshuffles itself on the first bank.
   */
  place: number;
  name: string;
  /** The score this line is placed on: a side's total, or a player's own. */
  score: number;
  /** Points behind the leading score; 0 for whoever holds it. */
  behind: number;
  /** Side index for a team line; null for a player line. */
  side: number | null;
  /** Player-list index for a player line (drives the seat colour); else null. */
  seat: number | null;
  /** True when the viewer is on this line — their seat, or their side. */
  isYou: boolean;
  isBot: boolean;
  /** A side's members, biggest contribution first. Empty on a player line. */
  members: PlacingMember[];
}

/** Rank a game in progress. `teamLabel` names a side (the only i18n involved). */
export function placings(
  state: GameState,
  youId: string | null | undefined,
  teamLabel: (side: number) => string,
): Placing[] {
  const rows = state.teams ? sideRows(state, youId, teamLabel) : seatRows(state, youId);

  // Sort is stable, so lines that are level stay in seat order rather than
  // swapping places every time an unrelated score moves.
  rows.sort((a, b) => b.score - a.score);

  const lead = rows.length > 0 ? rows[0].score : 0;
  let place = 0;
  let previous: number | null = null;
  rows.forEach((row, i) => {
    // Standard competition ranking: a tie takes the higher place and the next
    // line down skips the places the tie used up (1, 1, 3).
    if (previous === null || row.score !== previous) place = i + 1;
    previous = row.score;
    row.place = place;
    row.behind = lead - row.score;
  });
  return rows;
}

function seatRows(state: GameState, youId: string | null | undefined): Placing[] {
  return state.players.map((p, seat) => ({
    key: p.id,
    place: 0,
    name: p.name,
    score: p.total,
    behind: 0,
    side: null,
    seat,
    isYou: p.id === youId,
    isBot: p.isBot,
    members: [],
  }));
}

function sideRows(
  state: GameState,
  youId: string | null | undefined,
  teamLabel: (side: number) => string,
): Placing[] {
  return state.teams!.map((seats, side) => {
    const members = seats
      .map((i) => state.players[i])
      .map((p) => ({ id: p.id, name: p.name, total: p.total, isYou: p.id === youId }))
      .sort((a, b) => b.total - a.total);
    return {
      key: `team:${side}`,
      place: 0,
      name: teamLabel(side),
      score: teamTotal(state, side),
      behind: 0,
      side,
      seat: null,
      // Your side's line is yours, whoever on it is holding the dice.
      isYou: members.some((m) => m.isYou),
      isBot: false,
      members,
    };
  });
}
