/** The pending result owns the input lock immediately, before React can repaint. */
export function createRollPlayback() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  return {
    get active() {
      return timer !== undefined;
    },
    start(land: () => void, duration: number): boolean {
      if (timer !== undefined) return false;
      const started = ++generation;
      timer = setTimeout(() => {
        // Cancelled matches cannot land even if their callback was already queued.
        if (started !== generation) return;
        timer = undefined;
        land();
      }, duration);
      return true;
    },
    cancel() {
      generation += 1;
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
