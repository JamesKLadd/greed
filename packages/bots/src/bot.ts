/**
 * Thin convenience wrapper around `decide` for callers that prefer an object
 * bound to a difficulty (e.g. the client's per-seat bot).
 */

import type { BotDifficulty, GameAction, GameState } from "@greed/core";
import { decide, type BotContext } from "./strategies.js";

export interface Bot {
  readonly difficulty: BotDifficulty;
  act(state: GameState): GameAction;
}

export function createBot(difficulty: BotDifficulty, ctx: BotContext = {}): Bot {
  return {
    difficulty,
    act: (state) => decide(state, difficulty, ctx),
  };
}
