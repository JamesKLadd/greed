import type { GameState } from "@greed/core";
import type { MsgKey, Params } from "../i18n/i18n.js";

export interface CoachHint {
  /** Catalog key for the tip text; rendered through `t()` by the CoachBar. */
  key: MsgKey;
  params?: Params;
  tone: "info" | "good" | "bad" | "warn";
}

/**
 * A contextual coaching tip for the local human, derived purely from game state.
 * Returns null when there's nothing useful to say. Used by the practice/tutorial
 * hint bar so beginners learn the roll-vs-bank loop as they play. The message is
 * returned as a catalog key (+ params) so it stays translatable and testable.
 */
export function coachHint(state: GameState, canAct: boolean): CoachHint | null {
  const turn = state.turn;
  const current = state.players[turn.playerIndex];

  if (state.phase === "game-over") {
    const winner = state.players.find((p) => p.id === state.winnerId);
    return { key: "coach.gameOver", params: { name: winner?.name ?? "someone" }, tone: "info" };
  }

  // A just-finished turn stays on screen briefly; explain what happened.
  if (turn.outcome === "busted") {
    return { key: "coach.bust", tone: "bad" };
  }
  if (turn.outcome === "banked") {
    return {
      key: "coach.banked",
      params: { points: turn.turnScore, name: current.name },
      tone: "good",
    };
  }

  if (!canAct) {
    return { key: "coach.watching", params: { name: current.name }, tone: "info" };
  }

  // It's your live turn.
  if (state.phase === "sudden-death") {
    return { key: "coach.suddenDeath", tone: "warn" };
  }

  if (state.endgame.triggered) {
    return { key: "coach.finalRound", tone: "warn" };
  }

  if (turn.hotDice) {
    return { key: "coach.hotDice", params: { points: turn.turnScore }, tone: "good" };
  }

  if (turn.turnScore === 0 && turn.lastRoll === null) {
    return { key: "coach.rollToStart", tone: "info" };
  }

  if (turn.turnScore > 0) {
    return { key: "coach.rollOrBank", params: { points: turn.turnScore }, tone: "info" };
  }

  return null;
}
