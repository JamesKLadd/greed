/**
 * Game-level state machine for Greed.
 *
 * Pure and reducer-shaped: `applyAction(state, action) -> state`. Nothing here
 * mutates the input (each call works on a structured clone), so the same engine
 * safely drives the local UI, the bots, and a future authoritative server.
 *
 * Endgame rules (confirmed with the designer):
 *  - Banking a total >= goal triggers the endgame.
 *  - If the starting player (P1) is the first of all to reach the goal, P1 wins
 *    immediately.
 *  - Otherwise every player through P1 gets one final turn; the game ends right
 *    after P1's turn. Highest banked total wins.
 *  - A tie for the lead is broken by a sudden-death round among the tied players.
 */

import { rollDice, nextInt } from "./rng.js";
import { scoreRoll } from "./scoring.js";
import { createTurn, diceToRoll, turnLegalActions } from "./turn.js";
import { GOAL_DEFAULT } from "./types.js";
import { clone } from "./util.js";
import type {
  GameAction,
  GameConfig,
  GameState,
  LegalActions,
  PlayerConfig,
  PlayerState,
} from "./types.js";

export function createGame(playerConfigs: PlayerConfig[], config: GameConfig): GameState {
  const n = playerConfigs.length;
  if (n < 2 || n > 8) {
    throw new Error(`Greed supports 2-8 players (got ${n}).`);
  }

  let rng = config.seed >>> 0;

  let order: number[];
  let startIndex: number | undefined = config.startIndex;

  if (config.order && config.order.length === n) {
    // Explicit turn order (e.g. from the opening roll-off).
    order = [...config.order];
    startIndex = order[0];
  } else {
    if (startIndex === undefined) {
      const r = nextInt(rng, n);
      startIndex = r.value;
      rng = r.state;
    }
    order = [];
    for (let i = 0; i < n; i++) order.push((startIndex + i) % n);
  }

  const players: PlayerState[] = playerConfigs.map((p) => ({ ...p, total: 0 }));

  return {
    config: { ...config, goal: config.goal ?? GOAL_DEFAULT, startIndex },
    players,
    order,
    turnPointer: 0,
    rng,
    turn: createTurn(order[0]),
    phase: "playing",
    endgame: { triggered: false, triggerPlayerId: null },
    suddenDeath: null,
    winnerId: null,
    log: [{ type: "game-start", startPlayerId: players[order[0]].id }],
  };
}

export function currentPlayerIndex(state: GameState): number {
  return state.turn.playerIndex;
}

export function currentPlayer(state: GameState): PlayerState {
  return state.players[state.turn.playerIndex];
}

export function getLegalActions(state: GameState): LegalActions {
  if (state.phase === "game-over") return { canRoll: false, canBank: false, canAdvance: false };
  return turnLegalActions(state.turn);
}

export function applyAction(prev: GameState, action: GameAction): GameState {
  const state: GameState = clone(prev);
  if (state.phase === "game-over") return state;
  switch (action.type) {
    case "ROLL":
      return doRoll(state);
    case "BANK":
      return doBank(state);
    case "ADVANCE":
      return doAdvance(state);
    default:
      return state;
  }
}

function doRoll(state: GameState): GameState {
  const turn = state.turn;
  if (!turnLegalActions(turn).canRoll) return state;

  // Hot dice: the previous throw cleared all 5, so throw a fresh 5.
  let indices: number[];
  if (turn.hotDice) {
    turn.locked = turn.locked.map(() => false);
    turn.hotDice = false;
    indices = turn.dice.map((_, i) => i);
  } else {
    indices = diceToRoll(turn);
  }

  const { dice: rolled, state: rng } = rollDice(state.rng, indices.length);
  state.rng = rng;
  indices.forEach((diceIndex, k) => {
    turn.dice[diceIndex] = rolled[k];
  });

  const thrown = indices.map((i) => turn.dice[i]);
  const result = scoreRoll(thrown);
  turn.lastRoll = result;
  turn.rollCount += 1;

  const player = state.players[turn.playerIndex];
  state.log.push({ type: "roll", playerId: player.id, dice: thrown, result });

  if (result.points === 0) {
    // Bust: forfeit everything accumulated this turn. The turn stays visible
    // (outcome set) so players can see the losing roll before ADVANCE.
    const lost = turn.turnScore;
    turn.busted = true;
    turn.awaitingDecision = false;
    turn.turnScore = 0;
    turn.outcome = "busted";
    state.log.push({ type: "bust", playerId: player.id, lostPoints: lost });
    return state;
  }

  turn.turnScore += result.points;
  indices.forEach((diceIndex, k) => {
    if (result.scoringMask[k]) turn.locked[diceIndex] = true;
  });

  if (turn.locked.every(Boolean)) {
    turn.hotDice = true;
    state.log.push({ type: "hot-dice", playerId: player.id });
  }
  turn.awaitingDecision = true;
  return state;
}

function doBank(state: GameState): GameState {
  const turn = state.turn;
  if (!turnLegalActions(turn).canBank) return state;

  const player = state.players[turn.playerIndex];
  const gained = turn.turnScore;
  player.total += gained;
  turn.outcome = "banked";
  turn.awaitingDecision = false;
  state.log.push({ type: "bank", playerId: player.id, gained, total: player.total });

  // May end the game outright (P1 auto-win) or arm the endgame. Either way the
  // banked turn stays on screen until ADVANCE.
  handleBankGoal(state, turn.playerIndex);
  return state;
}

/** Start the next turn after a finished one (bust or bank). */
function doAdvance(state: GameState): GameState {
  if (state.phase === "game-over") return state;
  if (!state.turn.outcome) return state; // turn is not finished yet
  return endTurn(state);
}

/** After a bank, apply the goal / auto-win logic (playing phase only). */
function handleBankGoal(state: GameState, playerIndex: number): void {
  if (state.phase !== "playing") return;
  const player = state.players[playerIndex];
  if (player.total < state.config.goal) return;
  if (state.endgame.triggered) return; // endgame already armed this round

  const startIndex = state.order[0];
  if (playerIndex === startIndex) {
    // Starting player is first of all to reach the goal -> instant win.
    state.log.push({ type: "auto-win", playerId: player.id });
    endGame(state, player.id);
  } else {
    state.endgame.triggered = true;
    state.endgame.triggerPlayerId = player.id;
    state.log.push({ type: "endgame-triggered", playerId: player.id });
  }
}

/** Advance play after a turn ends (by bank or bust). */
function endTurn(state: GameState): GameState {
  if (state.phase === "sudden-death") return endSuddenDeathTurn(state);

  // The game ends when the round finishes: the last player in the turn order
  // (the seat to the starting player's right) takes the final turn. Once the
  // endgame is armed, play runs to the end of the current round and stops there
  // -- the starting player, who already opened the round, does not go again.
  const isLastSeat = state.turnPointer === state.order.length - 1;
  if (state.endgame.triggered && isLastSeat) {
    return endGameByScore(state);
  }

  state.turnPointer = (state.turnPointer + 1) % state.order.length;
  state.turn = createTurn(state.order[state.turnPointer]);
  return state;
}

function endGameByScore(state: GameState): GameState {
  const maxTotal = Math.max(...state.players.map((p) => p.total));
  const contenders = state.players
    .map((p, i) => ({ p, i }))
    .filter((x) => x.p.total === maxTotal)
    .map((x) => x.i);

  if (contenders.length === 1) {
    return endGame(state, state.players[contenders[0]].id);
  }
  return startSuddenDeath(state, contenders);
}

/** Contenders play one turn each; highest total wins; repeat if still tied. */
function startSuddenDeath(state: GameState, contenderIndices: number[]): GameState {
  const ordered = orderByTurnOrder(state, contenderIndices);
  state.phase = "sudden-death";
  state.suddenDeath = { contenders: ordered, pointer: 0 };
  state.turn = createTurn(ordered[0]);
  state.log.push({
    type: "sudden-death",
    contenderIds: ordered.map((i) => state.players[i].id),
  });
  return state;
}

function endSuddenDeathTurn(state: GameState): GameState {
  const sd = state.suddenDeath!;
  sd.pointer += 1;
  if (sd.pointer < sd.contenders.length) {
    state.turn = createTurn(sd.contenders[sd.pointer]);
    return state;
  }

  // Round complete: evaluate the contenders.
  const totals = sd.contenders.map((i) => state.players[i].total);
  const max = Math.max(...totals);
  const stillTied = sd.contenders.filter((i) => state.players[i].total === max);

  if (stillTied.length === 1) {
    return endGame(state, state.players[stillTied[0]].id);
  }

  sd.contenders = stillTied;
  sd.pointer = 0;
  state.turn = createTurn(stillTied[0]);
  state.log.push({
    type: "sudden-death",
    contenderIds: stillTied.map((i) => state.players[i].id),
  });
  return state;
}

function orderByTurnOrder(state: GameState, indices: number[]): number[] {
  const rank = new Map<number, number>();
  state.order.forEach((playerIndex, pos) => rank.set(playerIndex, pos));
  return [...indices].sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
}

function endGame(state: GameState, winnerId: string): GameState {
  state.phase = "game-over";
  state.winnerId = winnerId;
  state.log.push({ type: "game-over", winnerId });
  return state;
}
