import { createGame, determineOrder, makeSeed, cleanPlayerName, GOAL_DEFAULT } from "@greed/core";
import type { BotPersonality, GameState, PlayerConfig } from "@greed/core";
import type { RollOffDisplayEntry } from "../components/RollOffView.js";

export interface SeatSetup {
  name: string;
  isBot: boolean;
  /** Bots all play at one standard level; this is what makes them differ. */
  personality: BotPersonality;
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
  /** Fixed starting seat (for debugging); omit for a random first player. */
  startIndex?: number;
  seed?: number;
}

export function defaultSetup(): MatchSetup {
  return {
    goal: GOAL_DEFAULT,
    seats: [
      { name: "You", isBot: false, personality: "balanced" },
      { name: "Robo 1", isBot: true, personality: "cautious" },
      { name: "Robo 2", isBot: true, personality: "reckless" },
    ],
  };
}

/** A gentle first game: you vs one careful bot, to a shorter goal, for the tutorial. */
export function practiceSetup(): MatchSetup {
  return {
    goal: 1000,
    seats: [
      { name: "You", isBot: false, personality: "balanced" },
      { name: "Rookie", isBot: true, personality: "cautious" },
    ],
  };
}

export interface BuiltGame {
  state: GameState;
  /** The opening roll-off, in the resulting turn order (first … last). */
  rollOff: RollOffDisplayEntry[];
}

export function buildGame(setup: MatchSetup): BuiltGame {
  const seed =
    setup.seed ?? makeSeed((Date.now() & 0xffffffff) ^ Math.floor(Math.random() * 2 ** 31));
  const configs: PlayerConfig[] = setup.seats.map((s, i) => ({
    id: `p${i}`,
    name: cleanPlayerName(s.name, `Player ${i + 1}`),
    isBot: s.isBot,
    botPersonality: s.isBot ? s.personality : undefined,
  }));

  // Opening roll-off sets the turn order (highest pip total goes last).
  const { order, entries } = determineOrder(configs.length, makeSeed(seed ^ 0x9e3779b9));
  const state = createGame(configs, { goal: setup.goal, seed, order });
  const rollOff: RollOffDisplayEntry[] = order.map((pi) => ({
    name: configs[pi].name,
    dice: entries[pi].dice,
    sum: entries[pi].sum,
  }));

  return { state, rollOff };
}
