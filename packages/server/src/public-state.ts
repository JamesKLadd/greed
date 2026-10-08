import type { GameState } from "@greed/core";

/**
 * The UI needs the position, not the PRNG's state or initial seed. Preserve the
 * GameState shape for existing clients, but replace both prediction inputs with
 * inert placeholders. Never change the authoritative state used for replay.
 */
export function publicGameState(state: GameState, publicSeed = 0): GameState {
  return { ...state, config: { ...state.config, seed: publicSeed }, rng: 0 };
}
