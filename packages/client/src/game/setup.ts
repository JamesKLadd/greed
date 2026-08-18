import {
  createGame,
  determineOrder,
  makeSeed,
  cleanPlayerName,
  GOAL_DEFAULT,
  TEAM_TABLE_SIZES,
} from "@greed/core";
import type { BotPersonality, GameState, PlayerConfig } from "@greed/core";
import type { RollOffDisplayEntry } from "../components/RollOffView.js";

export interface SeatSetup {
  name: string;
  isBot: boolean;
  /** Bots all play at one standard level; this is what makes them differ. */
  personality: BotPersonality;
  /**
   * Side (0 or 1) this seat plays for. Always set so toggling teams off and on
   * again doesn't lose the pairing; only honoured when `MatchSetup.teams` is on.
   */
  team: number;
}

/** The temperaments a bot can be given, in order of nerve. */
export const PERSONALITIES: BotPersonality[] = ["cautious", "balanced", "reckless"];

/** A temperament picked at random, for the "add random bots" shortcut. */
export function randomPersonality(): BotPersonality {
  return PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)];
}

export interface MatchSetup {
  seats: SeatSetup[];
  goal: number;
  /** Play as two sides sharing a score. Only offered at a table of 4 or 6. */
  teams: boolean;
  /** Fixed starting seat (for debugging); omit for a random first player. */
  startIndex?: number;
  seed?: number;
}

/** Sides alternate down the seat list, so a fresh table is already balanced. */
export function defaultTeam(seatIndex: number): number {
  return seatIndex % 2;
}

/**
 * The table a local game opens on: you and one bot of each temperament.
 *
 * Three opponents rather than two, and one of each on purpose — the bots differ
 * only in how far they push a turn, so a table with all three is the shortest
 * way to see what that difference looks like. It is also a four-seat table,
 * which is one of the two sizes that can be split into sides.
 */
export function defaultSetup(): MatchSetup {
  return {
    goal: GOAL_DEFAULT,
    teams: false,
    seats: [
      { name: "You", isBot: false, personality: "balanced", team: 0 },
      { name: "Robo 1", isBot: true, personality: "cautious", team: 1 },
      { name: "Robo 2", isBot: true, personality: "balanced", team: 0 },
      { name: "Robo 3", isBot: true, personality: "reckless", team: 1 },
    ],
  };
}

/** A gentle first game: you vs one careful bot, to a shorter goal, for the tutorial. */
export function practiceSetup(): MatchSetup {
  return {
    goal: 1000,
    teams: false,
    seats: [
      { name: "You", isBot: false, personality: "balanced", team: 0 },
      { name: "Rookie", isBot: true, personality: "cautious", team: 1 },
    ],
  };
}

/** Can this table be split into two sides at all? */
export function teamsAvailable(seatCount: number): boolean {
  return (TEAM_TABLE_SIZES as readonly number[]).includes(seatCount);
}

/** Sides must be the same size before a team game can start. */
export function teamsBalanced(seats: SeatSetup[]): boolean {
  if (!teamsAvailable(seats.length)) return false;
  const a = seats.filter((s) => s.team === 0).length;
  return a === seats.length - a;
}

/** Re-balance the sides by alternating them down the list. */
export function rebalanceTeams(seats: SeatSetup[]): SeatSetup[] {
  return seats.map((s, i) => ({ ...s, team: defaultTeam(i) }));
}

export interface BuiltGame {
  state: GameState;
  /** The opening roll-off, in the resulting turn order (first … last). */
  rollOff: RollOffDisplayEntry[];
}

export function buildGame(setup: MatchSetup): BuiltGame {
  const seed =
    setup.seed ?? makeSeed((Date.now() & 0xffffffff) ^ Math.floor(Math.random() * 2 ** 31));
  const teamed = setup.teams && teamsBalanced(setup.seats);
  const configs: PlayerConfig[] = setup.seats.map((s, i) => ({
    id: `p${i}`,
    name: cleanPlayerName(s.name, `Player ${i + 1}`),
    isBot: s.isBot,
    botPersonality: s.isBot ? s.personality : undefined,
    team: teamed ? s.team : undefined,
  }));

  // Opening roll-off sets the turn order (highest pip total goes last).
  const { order, entries } = determineOrder(configs.length, makeSeed(seed ^ 0x9e3779b9));
  const state = createGame(configs, { goal: setup.goal, seed, order });
  // Read the order back off the state, not the roll-off: a team game re-seats
  // the table so the sides alternate, and the roll-off must show where players
  // will ACTUALLY sit.
  const rollOff: RollOffDisplayEntry[] = state.order.map((pi) => ({
    name: configs[pi].name,
    dice: entries[pi].dice,
    sum: entries[pi].sum,
    team: teamed ? configs[pi].team : undefined,
  }));

  return { state, rollOff };
}
