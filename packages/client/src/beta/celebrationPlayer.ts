import { CELEBRATION_MS, type Celebration } from "./celebrations.js";

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
      if (active.kind === "score" || cue.kind === "win") {
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
