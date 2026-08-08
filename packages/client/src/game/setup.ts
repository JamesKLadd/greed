import { createGame, determineOrder, makeSeed, GOAL_DEFAULT } from "@greed/core";
import type { BotDifficulty, BotPersonality, GameState, PlayerConfig } from "@greed/core";
import type { RollOffDisplayEntry } from "../components/RollOffView.js";

export interface SeatSetup {
  name: string;
  isBot: boolean;
  difficulty: BotDifficulty;
  personality: BotPersonality;
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
      { name: "You", isBot: false, difficulty: "medium", personality: "balanced" },
      { name: "Robo 1", isBot: true, difficulty: "medium", personality: "balanced" },
      { name: "Robo 2", isBot: true, difficulty: "hard", personality: "balanced" },
    ],
  };
}

/** A gentle first game: you vs one easy bot, to a shorter goal, for the tutorial. */
export function practiceSetup(): MatchSetup {
  return {
    goal: 1000,
    seats: [
      { name: "You", isBot: false, difficulty: "medium", personality: "balanced" },
      { name: "Rookie", isBot: true, difficulty: "easy", personality: "balanced" },
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
    name: s.name.trim() || `Player ${i + 1}`,
    isBot: s.isBot,
    botDifficulty: s.isBot ? s.difficulty : undefined,
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
