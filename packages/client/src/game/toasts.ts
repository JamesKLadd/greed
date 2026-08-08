import type { GameEvent, GameState } from "@greed/core";

export interface ToastMessage {
  id: number;
  text: string;
  tone: "good" | "bad" | "info";
}

/** Turn a notable game event into a toast (or null to ignore it). */
export function toastFor(event: GameEvent, state: GameState): ToastMessage | null {
  const name = (id: string) => state.players.find((p) => p.id === id)?.name ?? id;
  switch (event.type) {
    case "bust":
      return {
        id: Math.random(),
        text: `${name(event.playerId)} busted!${event.lostPoints ? ` Lost ${event.lostPoints}.` : ""}`,
        tone: "bad",
      };
    case "skip":
      return {
        id: Math.random(),
        text: `${name(event.playerId)} ran out of time — turn skipped.`,
        tone: "bad",
      };
    case "hot-dice":
      return { id: Math.random(), text: "Hot dice! Roll all 5 again.", tone: "good" };
    case "endgame-triggered":
      return {
        id: Math.random(),
        text: `${name(event.playerId)} reached the goal — final round!`,
        tone: "info",
      };
    case "auto-win":
      return { id: Math.random(), text: `${name(event.playerId)} wins outright!`, tone: "good" };
    case "sudden-death":
      return { id: Math.random(), text: "Sudden death!", tone: "info" };
    default:
      return null;
  }
}
