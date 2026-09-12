/**
 * Game-level state machine for Greed.
 *
 * Pure and reducer-shaped: `applyAction(state, action) -> state`. Nothing here
 * mutates the input (each call works on a structured clone), so the same engine
 * safely drives the local UI, the bots, and a future authoritative server.
 *
 * Endgame rules (confirmed with the designer):
 *  - Banking a total >= goal triggers the endgame.
 *  - The last seat in the turn order (the highest opening roll) is the anchor and
 *    always takes the final turn of the round.
 *  - If the last seat is the first of all to reach the goal, it wins immediately
 *    (nobody acts after it anyway).
 *  - Otherwise the round plays out through the last seat, so every remaining
 *    player gets one final turn; the game ends after the last seat. Highest
 *    banked total wins.
 *  - A tie for the lead is broken by a sudden-death round among the tied players.
 */

import { rollDice, nextInt } from "./rng.js";
import { scoreRoll } from "./scoring.js";
import {
  canToggleLock,
  createTurn,
  diceToRoll,
  heldScore,
  refreshTurn,
  throwCompletesHand,
  turnLegalActions,
} from "./turn.js";
import { GOAL_DEFAULT, TEAM_TABLE_SIZES } from "./types.js";
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
  assertTeamsAreValid(playerConfigs);
  return buildGame(playerConfigs, config);
}

/**
 * Teams are all-or-nothing and always two equal sides, at a table of 4 or 6.
 * Rejecting anything else here — rather than coping with it downstream — keeps
 * every score comparison in the engine to two cases (a side, or a player)
 * instead of an open-ended partition of the table.
 */
function assertTeamsAreValid(configs: PlayerConfig[]): void {
  const withTeam = configs.filter((p) => p.team !== undefined);
  if (withTeam.length === 0) return;
  if (withTeam.length !== configs.length) {
    throw new Error("Team games need every seat on a side.");
  }
  if (!(TEAM_TABLE_SIZES as readonly number[]).includes(configs.length)) {
    throw new Error(`Team games need ${TEAM_TABLE_SIZES.join(" or ")} players.`);
  }
  const sides = new Set(configs.map((p) => p.team));
  if (sides.size !== 2 || !sides.has(0) || !sides.has(1)) {
    throw new Error("Team games need exactly two sides, 0 and 1.");
  }
  const sizeOf = (t: number) => configs.filter((p) => p.team === t).length;
  if (sizeOf(0) !== sizeOf(1)) {
    throw new Error("Team games need both sides the same size.");
  }
}

/**
 * A one-player game, for score-attack modes like the daily challenge where you
 * play against the dice rather than an opponent.
 *
 * Separate from createGame so the 2–8 guard keeps protecting real matches: a
 * one-seat multiplayer room is a bug, a one-seat solo run is the whole point.
 * Callers are responsible for deciding when the run ends (e.g. after a fixed
 * number of turns); pass an unreachable goal to keep the endgame from firing,
 * since with a single seat that player is both first and last in the order and
 * would instantly win on reaching it.
 */
export function createSoloGame(player: PlayerConfig, config: GameConfig): GameState {
  return buildGame([player], config);
}

function buildGame(playerConfigs: PlayerConfig[], config: GameConfig): GameState {
  const n = playerConfigs.length;
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
  const teams = groupTeams(playerConfigs);
  if (teams) order = interleaveTeams(order, playerConfigs);

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
    teams,
    winnerId: null,
    winnerTeam: null,
    log: [{ type: "game-start", startPlayerId: players[order[0]].id }],
  };
}

/** Player indices per side, or null when this is a free-for-all. */
function groupTeams(configs: PlayerConfig[]): number[][] | null {
  if (configs.length === 0 || configs[0].team === undefined) return null;
  const sides: number[][] = [[], []];
  configs.forEach((p, i) => sides[p.team as number].push(i));
  return sides;
}

function interleaveTeams(order: number[], configs: PlayerConfig[]): number[] {
  return teamSeatingOrder(
    order,
    configs.map((p) => p.team as number),
  );
}

/**
 * Re-seat a ranked turn order so the sides alternate. Partners acting back to
 * back would let one side bank twice while the other watched, which is the
 * whole game — so the order strictly alternates, each side keeps its internal
 * ranking from the roll-off, and the top roll still lands in the last seat
 * (the anchor that takes the final turn).
 *
 * Exported because the roll-off is REVEALED before the game is built: the
 * server has to show players the seats they will actually take, and computing
 * that twice in two places is how the reveal ends up contradicting the table.
 *
 * `teamByIndex[i]` is the side of player `i`.
 */
export function teamSeatingOrder(order: number[], teamByIndex: number[]): number[] {
  const queues: number[][] = [[], []];
  for (const playerIndex of order) queues[teamByIndex[playerIndex]].push(playerIndex);

  // Start with the side that does NOT hold the top roll, so that player ends last.
  const topTeam = teamByIndex[order[order.length - 1]];
  let side = topTeam === 0 ? 1 : 0;

  const out: number[] = [];
  while (out.length < order.length) {
    const q = queues[side];
    if (q.length > 0) out.push(q.shift()!);
    side = side === 0 ? 1 : 0;
  }
  return out;
}

export function currentPlayerIndex(state: GameState): number {
  return state.turn.playerIndex;
}

export function currentPlayer(state: GameState): PlayerState {
  return state.players[state.turn.playerIndex];
}

/** The side a seat plays for, or null in a free-for-all. */
export function teamOf(state: GameState, playerIndex: number): number | null {
  return state.players[playerIndex].team ?? null;
}

/** Banked total of one side — the shared score its members are all playing for. */
export function teamTotal(state: GameState, team: number): number {
  if (!state.teams) return 0;
  return state.teams[team].reduce((sum, i) => sum + state.players[i].total, 0);
}

/**
 * The score that decides this seat's game: their side's total in a team game,
 * their own otherwise. Everything that compares scores goes through here, which
 * is what makes teams a property of the table rather than a fork in the rules.
 */
export function scoreFor(state: GameState, playerIndex: number): number {
  const team = teamOf(state, playerIndex);
  return team === null ? state.players[playerIndex].total : teamTotal(state, team);
}

/** Best banked score among this seat's opponents — teammates never count. */
export function rivalBest(state: GameState, playerIndex: number): number {
  const team = teamOf(state, playerIndex);
  let max = 0;
  if (team === null) {
    state.players.forEach((p, i) => {
      if (i !== playerIndex && p.total > max) max = p.total;
    });
    return max;
  }
  state.teams!.forEach((_, t) => {
    if (t !== team) max = Math.max(max, teamTotal(state, t));
  });
  return max;
}

/**
 * Did this player win — outright, or as part of the winning side?
 *
 * Deliberately tolerant of a state that predates teams: an online client can be
 * handed a game from a server that has not been redeployed yet, where `teams`
 * and `winnerTeam` are absent rather than null. Anything short of a complete
 * team result falls back to the individual winner, so a missing field can never
 * promote the whole table to winners.
 */
export function isWinner(state: GameState, playerId: string): boolean {
  if (!state.winnerId) return false;
  const team = state.players.find((p) => p.id === playerId)?.team;
  if (!state.teams || typeof state.winnerTeam !== "number" || typeof team !== "number") {
    return state.winnerId === playerId;
  }
  return team === state.winnerTeam;
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
    case "SKIP":
      return doSkip(state);
    case "TOGGLE_LOCK":
      return doToggleLock(state, action.index);
    default:
      return state;
  }
}

function doRoll(state: GameState): GameState {
  const turn = state.turn;
  if (!turnLegalActions(turn).canRoll) return state;

  // Hot dice: the mat was cleared, so throw a fresh 5. What those dice earned
  // is carried, since it no longer belongs to any die about to be thrown.
  let indices: number[];
  if (turn.hotDice) {
    turn.carried += heldScore(turn);
    turn.awards = [];
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
  // Only what the log is read for — see LoggedRoll. The full result stays on
  // `turn.lastRoll`, which is where anything needing the breakdown looks.
  state.log.push({
    type: "roll",
    playerId: player.id,
    dice: thrown,
    result: { points: result.points, isHotDice: result.isHotDice },
  });

  // Five of a kind and a straight are built across several throws, and the die
  // that completes either is worth nothing by itself on a 2, 3, 4 or 6 — so the
  // throw scores zero and, read on its own, is indistinguishable from a bust.
  // A player who held a fourth 2 and threw for the fifth got it, and was busted
  // by the best hand in the game; a player holding 2,3,4,5 who threw the 6 was
  // busted the same way. The mat is what decides this, not the throw.
  const madeHand = throwCompletesHand(turn, indices);

  if (result.points === 0 && !madeHand) {
    // Bust: forfeit everything accumulated this turn. The turn stays visible
    // (outcome set) so players can see the losing roll before ADVANCE.
    const lost = turn.turnScore;
    turn.busted = true;
    turn.awaitingDecision = false;
    turn.turnScore = 0;
    turn.carried = 0;
    turn.awards = [];
    turn.outcome = "busted";
    state.log.push({ type: "bust", playerId: player.id, lostPoints: lost });
    return state;
  }

  // Dice that have just been thrown carry nothing over from before: any award
  // that used one of them describes a hand that no longer exists.
  const rethrown = new Set(indices);
  turn.awards = turn.awards.filter((a) => !a.dice.some((i) => rethrown.has(i)));
  // The throw's awards, moved from positions within the throw to seats on the
  // mat, so they can be checked against the locks later.
  for (const entry of result.breakdown) {
    turn.awards.push({
      kind: entry.kind,
      face: entry.face,
      dice: entry.indices.map((k) => indices[k]),
      points: entry.points,
    });
  }
  indices.forEach((diceIndex, k) => {
    if (result.scoringMask[k]) turn.locked[diceIndex] = true;
  });
  // The completing die IS a scoring die — the hand it makes pays 1000 or 500 —
  // even though its own face may pay nothing. Holding it is what lets
  // heldScore see the hand rather than four dice and a loose one.
  if (madeHand) indices.forEach((diceIndex) => (turn.locked[diceIndex] = true));

  const wasHot = turn.hotDice;
  refreshTurn(turn);
  if (turn.hotDice && !wasHot) {
    state.log.push({ type: "hot-dice", playerId: player.id });
  }
  turn.awaitingDecision = true;
  return state;
}

/**
 * Hold a die, or put it back.
 *
 * The engine still locks scoring dice on its own; this is the player overruling
 * it — which they need, because a five of a kind and a straight are both built
 * up over several throws, and building one means being able to reject the die
 * that isn't part of it. Unlocking takes back whatever that die was earning:
 * any award it belonged to stops counting (see heldScore), which can also mean
 * a mat that was clear no longer is.
 *
 * A tap that isn't allowed leaves the position exactly as it was — see
 * `canToggleLock` for which those are, and why releasing the last held die is
 * one of them.
 */
function doToggleLock(state: GameState, index: number): GameState {
  const turn = state.turn;
  if (!canToggleLock(turn, index)) return state;
  turn.locked[index] = !turn.locked[index];
  refreshTurn(turn);
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

  // May end the game outright (last-seat auto-win) or arm the endgame. Either way the
  // banked turn stays on screen until ADVANCE.
  handleBankGoal(state, turn.playerIndex);
  return state;
}

/**
 * Forfeit the current turn with no points (a time-out). Marks it finished so an
 * ADVANCE moves play on, exactly like a bank of zero. No-op if the turn already
 * ended (bust/bank) so a late time-out can't double-forfeit.
 */
function doSkip(state: GameState): GameState {
  const turn = state.turn;
  if (turn.outcome) return state;
  const player = state.players[turn.playerIndex];
  turn.turnScore = 0;
  turn.awaitingDecision = false;
  turn.busted = false;
  turn.outcome = "banked"; // finished, gained nothing
  state.log.push({ type: "skip", playerId: player.id });
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
  // In a team game the side's shared total is what reaches the goal.
  if (scoreFor(state, playerIndex) < state.config.goal) return;
  if (state.endgame.triggered) return; // endgame already armed this round

  const lastSeatIndex = state.order[state.order.length - 1];
  if (playerIndex === lastSeatIndex) {
    // The last seat acts last each round, so if it is first to the goal there is
    // nobody left to respond -> instant win.
    state.log.push({ type: "auto-win", playerId: player.id });
    endGame(state, player.id, teamOf(state, playerIndex));
  } else {
    // An earlier seat reached the goal: arm the endgame and let the round run to
    // the last seat, so everyone still gets one final turn.
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
  if (state.teams) {
    const totals = state.teams.map((_, t) => teamTotal(state, t));
    const best = Math.max(...totals);
    const tiedTeams = totals.map((total, t) => ({ total, t })).filter((x) => x.total === best);
    if (tiedTeams.length === 1) {
      return endGameForTeam(state, tiedTeams[0].t);
    }
    // Level sides: EVERY member of each tied side plays a sudden-death turn,
    // because the side's score is what has to be broken, not one player's.
    const contenders = tiedTeams.flatMap((x) => state.teams![x.t]);
    return startSuddenDeath(state, orderByTurnOrder(state, contenders));
  }

  const maxTotal = Math.max(...state.players.map((p) => p.total));
  const contenders = state.players
    .map((p, i) => ({ p, i }))
    .filter((x) => x.p.total === maxTotal)
    .map((x) => x.i);

  if (contenders.length === 1) {
    return endGame(state, state.players[contenders[0]].id, null);
  }
  return startSuddenDeath(state, contenders);
}

/** Close out a team game: the side wins, credited to its top scorer. */
function endGameForTeam(state: GameState, team: number): GameState {
  const members = orderByTurnOrder(state, state.teams![team]);
  let best = members[0];
  for (const i of members) {
    if (state.players[i].total > state.players[best].total) best = i;
  }
  return endGame(state, state.players[best].id, team);
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
  if (state.teams) {
    const sides = [...new Set(sd.contenders.map((i) => state.players[i].team as number))];
    const best = Math.max(...sides.map((t) => teamTotal(state, t)));
    const stillLevel = sides.filter((t) => teamTotal(state, t) === best);
    if (stillLevel.length === 1) {
      return endGameForTeam(state, stillLevel[0]);
    }
    sd.contenders = orderByTurnOrder(
      state,
      stillLevel.flatMap((t) => state.teams![t]),
    );
    sd.pointer = 0;
    state.turn = createTurn(sd.contenders[0]);
    state.log.push({
      type: "sudden-death",
      contenderIds: sd.contenders.map((i) => state.players[i].id),
    });
    return state;
  }

  const totals = sd.contenders.map((i) => state.players[i].total);
  const max = Math.max(...totals);
  const stillTied = sd.contenders.filter((i) => state.players[i].total === max);

  if (stillTied.length === 1) {
    return endGame(state, state.players[stillTied[0]].id, null);
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

function endGame(state: GameState, winnerId: string, winnerTeam: number | null): GameState {
  state.phase = "game-over";
  state.winnerId = winnerId;
  state.winnerTeam = winnerTeam;
  state.log.push(
    winnerTeam === null
      ? { type: "game-over", winnerId }
      : { type: "game-over", winnerId, winnerTeam },
  );
  return state;
}
