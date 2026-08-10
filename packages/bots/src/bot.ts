/**
 * Thin convenience wrapper around `decide` for callers that prefer an object
 * bound to a personality (e.g. the client's per-seat bot).
 */

import type { BotPersonality, GameAction, GameState } from "@greed/core";
import { decide } from "./strategies.js";

export interface Bot {
  readonly personality: BotPersonality;
  act(state: GameState): GameAction;
}

export function createBot(personality: BotPersonality = "balanced"): Bot {
  return {
    personality,
    act: (state) => decide(state, { personality }),
  };
}
