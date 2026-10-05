import { runPosition, type RunMove, type RunResult } from "@greed/core";
import type { RunView } from "./useChallengeRun.js";

export const PRACTICE_TURNS = 3;
const COMPLETED_KEY = "greed:challenge-practiced";

/** Entirely local: it cannot claim an attempt or award account progression. */
export function practiceChallenge(seed: number) {
  const moves: RunMove[] = [];
  const position = () => runPosition(seed, moves, PRACTICE_TURNS);
  const view = (): RunView => {
    const p = position();
    return {
      state: p.state,
      turns: p.turns,
      totalTurns: PRACTICE_TURNS,
      complete: p.result.complete,
    };
  };
  return {
    view,
    result: (): RunResult => position().result,
    play: async (move: RunMove): Promise<RunView> => {
      if (!position().result.complete) moves.push(move);
      return view();
    },
  };
}

export function hasPracticedChallenge(): boolean {
  try {
    return localStorage.getItem(COMPLETED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markChallengePracticed(): void {
  try {
    localStorage.setItem(COMPLETED_KEY, "1");
  } catch {
    /* Play still works with storage blocked. */
  }
}
