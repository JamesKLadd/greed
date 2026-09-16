import { CELEBRATION_MS, TURN_ENDING, type Celebration } from "./celebrations.js";

/** One pending major event; routine scores never erase a readable result.
 * Fast bots cannot build an unbounded backlog. Game timing stays independent. */
export function createCelebrationPlayer(show: (cue: Celebration | null) => void) {
  let active: Celebration | null = null;
  let pending: Celebration | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const display = (cue: Celebration) => {
    active = cue;
    show(cue);
    timer = setTimeout(() => {
      const next = pending;
      pending = null;
      if (next) display(next);
      else {
        active = null;
        show(null);
      }
    }, CELEBRATION_MS[cue.kind]);
  };
  return {
    push(cue: Celebration) {
      if (!active) {
        display(cue);
        return;
      }
      if (cue.kind === "score") return;
      // The end of a turn takes over from anything still up from INSIDE that
      // turn, rather than queueing behind it. Queueing was how a banner outlived
      // its turn even with the durations bounded: a triple and then a bank
      // played one after the other, and the two budgets ran back to back into
      // the next player's turn. The triple describes a moment that has just
      // ended, so it gives way to the one that ended it.
      //
      // Two turn-ending cues still queue. They belong to different turns, which
      // are two seconds apart, so in play the first has finished long before the
      // second arrives — and where they do arrive together, showing both beats
      // dropping one.
      const endsTurn = TURN_ENDING.includes(cue.kind);
      if (
        active.kind === "score" ||
        cue.kind === "win" ||
        (endsTurn && !TURN_ENDING.includes(active.kind))
      ) {
        clearTimeout(timer);
        pending = null;
        display(cue);
        return;
      }
      pending = cue;
    },
    reset() {
      clearTimeout(timer);
      active = null;
      pending = null;
      show(null);
    },
    dispose() {
      clearTimeout(timer);
    },
  };
}
