import { runMoveStart, runPosition, type RunMove, type RunResult } from "@greed/core";
import { rollCall } from "../../game/rollCall.js";
import type { PlayMove, RunView } from "../../game/useChallengeRun.js";

export const CHALLENGE_SCENARIOS = ["initial", "five", "straight", "hot", "bust", "final"] as const;
export type ChallengeScenario = (typeof CHALLENGE_SCENARIOS)[number];
export type ReplyFailure = "none" | "before" | "lost";

export interface ChallengeFixture {
  initial: RunView;
  playMove: PlayMove;
  resumeRun: () => Promise<RunView | null>;
  delay: number;
  failNext: ReplyFailure;
  failNextRead: boolean;
  readonly moves: readonly RunMove[];
  readonly result: RunResult;
}

const TOTAL_TURNS = 10;

/** Find real engine rolls rather than constructing faces or score awards. */
function openingSeed(scenario: ChallengeScenario): number {
  if (scenario === "initial" || scenario === "final") return 2525;
  for (let seed = 1; seed < 100_000; seed++) {
    const { turn } = runPosition(seed, ["ROLL"], TOTAL_TURNS).state;
    const call = rollCall(turn);
    if (
      (scenario === "five" && call === "five") ||
      (scenario === "straight" && call === "straight") ||
      (scenario === "hot" && turn.hotDice && call !== "five" && call !== "straight") ||
      (scenario === "bust" && turn.outcome === "busted")
    ) {
      return seed;
    }
  }
  throw new Error(`No seeded challenge fixture for ${scenario}`);
}

/**
 * A development-only stand-in for the authoritative challenge endpoints.
 * Nothing calls the API or records a result; every move uses the real replay.
 */
export function createChallengeFixture(scenario: ChallengeScenario): ChallengeFixture {
  const seed = openingSeed(scenario);
  const moves: RunMove[] = [];
  if (scenario !== "initial" && scenario !== "final") moves.push("ROLL");
  if (scenario === "final") {
    // Bank every scoring opener and accept every bust until the tenth turn.
    while (runPosition(seed, moves, TOTAL_TURNS).turns < TOTAL_TURNS - 1) {
      moves.push("ROLL");
      const position = runPosition(seed, moves, TOTAL_TURNS);
      if (!position.state.turn.outcome) moves.push("BANK");
    }
  }
  const view = (): RunView => {
    const position = runPosition(seed, moves, TOTAL_TURNS);
    return {
      state: position.state,
      turns: position.turns,
      totalTurns: TOTAL_TURNS,
      complete: position.result.complete,
    };
  };
  const first = view();
  const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  const fixture: ChallengeFixture = {
    initial: scenario === "final" ? { ...first, state: runMoveStart(first.state) } : first,
    delay: 0,
    failNext: "none",
    failNextRead: false,
    get moves() {
      return [...moves];
    },
    get result() {
      return runPosition(seed, moves, TOTAL_TURNS).result;
    },
    playMove: async (move) => {
      const failure = fixture.failNext;
      fixture.failNext = "none";
      await wait(fixture.delay);
      if (failure === "before") throw new Error("Fixture: request did not reach the server.");
      moves.push(move);
      const next = view();
      if (failure === "lost") throw new Error("Fixture: server accepted the move, response lost.");
      return next;
    },
    resumeRun: async () => {
      await wait(fixture.delay);
      if (fixture.failNextRead) {
        fixture.failNextRead = false;
        throw new Error("Fixture: reconnect failed. Try checking the run again.");
      }
      const current = view();
      return current.complete ? null : current;
    },
  };
  return fixture;
}
