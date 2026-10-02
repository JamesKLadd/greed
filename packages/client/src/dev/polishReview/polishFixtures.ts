import { applyAction, createGame, getLegalActions, type GameState } from "@greed/core";
import { buildGame, PERSONALITIES, teamsAvailable, type MatchSetup } from "../../game/setup.js";
import {
  createTableEventFixture,
  type TableEventId,
} from "../tablePrototype/tableEventFixtures.js";

const NAMES = ["James", "Bear", "Cleo", "Pip", "Oliver", "Frankie", "Violet", "Rusty"];
const LONG_NAMES = [
  "Alexandria Vale",
  "Christopher Moss",
  "Wellington Rowan",
  "Penelope Winters",
  "Montgomery Finch",
  "Maximilian Banks",
  "AnastasiaWillowXX",
  "Theodore Sterling",
];

/** Only builds inputs to the real local engine; no profile, auth or server calls. */
export function createPolishSetup(
  count: number,
  teams = false,
  stress = false,
  online = false,
): MatchSetup {
  if (!Number.isInteger(count) || count < 2 || count > 8) {
    throw new Error("Polish fixtures support 2–8 players.");
  }
  if (teams && !teamsAvailable(count)) throw new Error("Team fixtures need 4 or 6 players.");
  const names = stress ? LONG_NAMES : NAMES;
  return {
    seed: 2525,
    goal: 3000,
    teams,
    seats: names.slice(0, count).map((name, i) => ({
      id: `polish-${i}`,
      name,
      isBot: !online && i !== 0,
      personality: PERSONALITIES[i % PERSONALITIES.length],
      team: i % 2,
    })),
  };
}

export interface PolishMatch {
  initial: GameState;
  finalRound: GameState | null;
  completed: GameState;
}

/**
 * All totals, winners, team scores and summaries come from legal core actions.
 * A short deterministic policy completes the sample; editing display fixtures
 * must never require inventing a winner or hand-writing a banked total.
 */
export function createPolishMatch(setup: MatchSetup): PolishMatch {
  const { state: initial } = buildGame(setup);
  let state = initial;
  let finalRound: GameState | null = null;
  for (let step = 0; step < 20000 && state.phase !== "game-over"; step++) {
    const legal = getLegalActions(state);
    if (legal.canAdvance) {
      state = applyAction(state, { type: "ADVANCE" });
    } else if (
      legal.canBank &&
      (state.turn.rollCount >= 2 || state.turn.turnScore >= 250 + state.turn.playerIndex * 50)
    ) {
      state = applyAction(state, { type: "BANK" });
    } else if (legal.canRoll) {
      state = applyAction(state, { type: "ROLL" });
    } else {
      throw new Error("The polish sample reached an unplayable state.");
    }
    if (!finalRound && state.endgame.triggered && state.phase === "playing") finalRound = state;
  }
  if (state.phase !== "game-over") throw new Error("The polish sample did not finish.");
  return { initial, finalRound, completed: state };
}

/** Reuse tested event scripts with this sample's names, sides and identity. */
export function createPolishTableEvent(id: TableEventId, setup: MatchSetup): GameState {
  const fixture = createTableEventFixture(id, setup.seats.length);
  const initial = createGame(
    setup.seats.map((seat, i) => ({
      id: `p${i}`,
      name: seat.name,
      isBot: seat.isBot,
      botPersonality: seat.isBot ? seat.personality : undefined,
      team: setup.teams ? seat.team : undefined,
    })),
    fixture.initial.config,
  );
  const before = fixture.setupActions.reduce(applyAction, initial);
  return applyAction(before, fixture.action);
}
