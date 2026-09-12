import { applyAction, createGame, type GameAction, type GameState } from "@greed/core";
import type { CelebrationKind } from "../../beta/celebrations.js";

const NAMES = ["James", "Bear", "Cleo", "Pip", "Oliver", "Frankie", "Violet", "Rusty"];

export const TABLE_EVENTS = [
  {
    id: "score",
    title: "Nice roll",
    description: "One scoring 1, with four dice still available.",
  },
  {
    id: "triple",
    title: "Three of a kind",
    description: "Three 2s in the current throw, plus a scoring 1.",
  },
  {
    id: "ones",
    title: "Three 1s",
    description: "Three 1s pay 300 as individual dice and still deserve the triple callout.",
  },
  {
    id: "straight",
    title: "Straight + hot dice",
    description: "A five-die straight clears the mat; the straight is the main announcement.",
  },
  {
    id: "fiveAcross",
    title: "Five across throws",
    description:
      "Four held 2s gain their fifth across throws. Its individual roll pays zero; the completed hand pays 1,000.",
  },
  {
    id: "hot",
    title: "Repeated hot dice",
    description:
      "A second full clear immediately follows the first. The new hand must celebrate again.",
  },
  {
    id: "bust",
    title: "Bust",
    description: "A real losing second throw removes only this turn’s unbanked points.",
  },
  {
    id: "bank",
    title: "Bank",
    description: "A 100-point bank moves toward the active player’s felt total.",
  },
  {
    id: "bigBank",
    title: "Big bank",
    description: "A 1,000-point bank keeps its major title while the total updates immediately.",
  },
  {
    id: "victory",
    title: "Victory",
    description:
      "The actual last seat banks to the goal. Victory supersedes bank and auto-win events.",
  },
] as const;

export type TableEventId = (typeof TABLE_EVENTS)[number]["id"];

interface FixtureScript {
  seed: number;
  setup: GameAction[];
  action: GameAction;
  expected: CelebrationKind;
}

const ROLL: GameAction = { type: "ROLL" };
const BANK: GameAction = { type: "BANK" };

// Fixed seeds were found once with core.rollDice. The fixtures themselves use
// the engine for every score, lock and log entry; stale seeds fail the tests.
const SCRIPTS: Record<TableEventId, FixtureScript> = {
  score: { seed: 1, setup: [], action: ROLL, expected: "score" },
  triple: { seed: 4, setup: [], action: ROLL, expected: "triple" },
  ones: { seed: 13, setup: [], action: ROLL, expected: "triple" },
  straight: { seed: 32, setup: [], action: ROLL, expected: "straight" },
  fiveAcross: {
    seed: 482,
    setup: [ROLL, { type: "TOGGLE_LOCK", index: 4 }, { type: "TOGGLE_LOCK", index: 1 }],
    action: ROLL,
    expected: "five",
  },
  hot: { seed: 646, setup: [ROLL], action: ROLL, expected: "hot" },
  bust: { seed: 3, setup: [ROLL], action: ROLL, expected: "bust" },
  bank: { seed: 1, setup: [ROLL], action: BANK, expected: "bank" },
  bigBank: { seed: 253, setup: [ROLL], action: BANK, expected: "bigBank" },
  victory: { seed: 253, setup: [ROLL], action: BANK, expected: "win" },
};

export interface TableEventFixture {
  id: TableEventId;
  title: string;
  description: string;
  initial: GameState;
  setupActions: GameAction[];
  before: GameState;
  action: GameAction;
  after: GameState;
  expected: CelebrationKind;
}

/** Real, replayable core transitions, with a stable first-seat camera anchor. */
export function createTableEventFixture(id: TableEventId, count = 8): TableEventFixture {
  if (!Number.isInteger(count) || count < 2 || count > 8) {
    throw new Error("Table event fixtures support 2–8 players.");
  }
  const script = SCRIPTS[id];
  const metadata = TABLE_EVENTS.find((event) => event.id === id)!;
  const initial = createGame(
    NAMES.slice(0, count).map((name, i) => ({ id: `event-${i}`, name, isBot: false })),
    {
      seed: script.seed,
      goal: id === "victory" ? 1000 : 3000,
      order: Array.from({ length: count }, (_, i) => i),
    },
  );
  // SKIP/ADVANCE reaches the true anchor without inventing a turn pointer or
  // winner. No RNG is consumed, so the same script works for every seat count.
  const skipToLast: GameAction[] =
    id === "victory"
      ? Array.from(
          { length: count - 1 },
          () => [{ type: "SKIP" }, { type: "ADVANCE" }] as GameAction[],
        ).flat()
      : [];
  const setupActions = [...skipToLast, ...script.setup];
  const before = setupActions.reduce(applyAction, initial);
  return {
    ...metadata,
    initial,
    setupActions,
    before,
    action: script.action,
    after: applyAction(before, script.action),
    expected: script.expected,
  };
}
