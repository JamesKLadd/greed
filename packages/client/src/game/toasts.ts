import type { GameEvent, GameState } from "@greed/core";
import type { MsgKey, Params } from "../i18n/i18n.js";

/**
 * A passing message about something that just happened at the table.
 *
 * Carries a catalog KEY rather than a finished sentence. These used to be
 * template literals built here — "Hot dice! Roll all 5 again.", "{name}
 * busted!" — which meant the one part of the game that talks to you while you
 * are playing was English regardless of the language you chose. The i18n
 * contract test could not see it either: it checks that every key exists in
 * every catalog, and a string that never became a key is invisible to it.
 */
export type ToastMessage = {
  id: number;
  tone: "good" | "bad" | "info";
} & (
  | { key: MsgKey; params?: Params; text?: never }
  | {
      /**
       * A ready-made sentence, for text this client did not author — the one
       * case is an error relayed from the server, which arrives as prose and
       * has no key to look up.
       */
      text: string;
      key?: never;
      params?: never;
    }
);

/** Turn a notable game event into a toast (or null to ignore it). */
export function toastFor(event: GameEvent, state: GameState): ToastMessage | null {
  const name = (id: string) => state.players.find((p) => p.id === id)?.name ?? id;
  const id = Math.random();
  switch (event.type) {
    case "bust":
      return event.lostPoints
        ? {
            id,
            key: "toast.bustLost",
            params: { name: name(event.playerId), points: event.lostPoints },
            tone: "bad",
          }
        : { id, key: "toast.bust", params: { name: name(event.playerId) }, tone: "bad" };
    case "skip":
      return { id, key: "toast.skipped", params: { name: name(event.playerId) }, tone: "bad" };
    case "hot-dice":
      return { id, key: "toast.hotDice", tone: "good" };
    case "endgame-triggered":
      return { id, key: "toast.finalRound", params: { name: name(event.playerId) }, tone: "info" };
    case "auto-win":
      return { id, key: "toast.autoWin", params: { name: name(event.playerId) }, tone: "good" };
    case "sudden-death":
      return { id, key: "toast.suddenDeath", tone: "info" };
    default:
      return null;
  }
}
