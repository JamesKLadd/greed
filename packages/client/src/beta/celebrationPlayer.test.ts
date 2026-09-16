import { afterEach, describe, expect, it, vi } from "vitest";
import { createCelebrationPlayer } from "./celebrationPlayer.js";
import { CELEBRATION_MS } from "./celebrations.js";
import { INTER_TURN_MS } from "../game/pacing.js";

/** Every cue the player was shown, in order, with nulls meaning "cleared". */
function record() {
  const seen: (string | null)[] = [];
  const player = createCelebrationPlayer((cue) => seen.push(cue ? cue.kind : null));
  return { seen, player };
}

describe("readable result banners", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps a bust readable through chatter, and clears before the next turn", () => {
    vi.useFakeTimers();
    const { seen, player } = record();
    player.push({ kind: "bust", player: "Alice" });
    vi.advanceTimersByTime(600);
    player.push({ kind: "score" }); // routine, never erases a result
    expect(seen).toEqual(["bust"]);

    // Gone with time to spare before the next player starts rolling, which is
    // the whole complaint: a result sitting over the wrong player.
    vi.advanceTimersByTime(INTER_TURN_MS - 600);
    expect(seen).toEqual(["bust", null]);
  });

  it("lets the end of a turn take over from a moment inside it", () => {
    vi.useFakeTimers();
    const { seen, player } = record();
    // A triple, and then the same player banks on it. Queued, the two ran back
    // to back and the second was still up during somebody else's turn.
    player.push({ kind: "triple" });
    vi.advanceTimersByTime(400);
    player.push({ kind: "bank", player: "Alice" });
    expect(seen).toEqual(["triple", "bank"]);

    vi.advanceTimersByTime(CELEBRATION_MS.bank);
    expect(seen).toEqual(["triple", "bank", null]);
    // Start to finish, inside one turn's worth of time.
    expect(400 + CELEBRATION_MS.bank).toBeLessThan(INTER_TURN_MS);
  });

  it("still queues two results, because they belong to two different turns", () => {
    vi.useFakeTimers();
    const { seen, player } = record();
    player.push({ kind: "bust", player: "Alice" });
    player.push({ kind: "bank", player: "Bob" });
    expect(seen).toEqual(["bust"]);
    vi.advanceTimersByTime(CELEBRATION_MS.bust);
    expect(seen).toEqual(["bust", "bank"]);
  });

  it("prioritises victory over anything waiting", () => {
    vi.useFakeTimers();
    const { seen, player } = record();
    player.push({ kind: "hot" });
    player.push({ kind: "bank" });
    player.push({ kind: "bust" });
    player.push({ kind: "win" });
    expect(seen.at(-1)).toBe("win");
  });

  it("keeps at most one event waiting, however fast they arrive", () => {
    vi.useFakeTimers();
    const { seen, player } = record();
    player.push({ kind: "bust" });
    for (let i = 0; i < 20; i++) player.push({ kind: "bank" });
    vi.runAllTimers();
    // The bust, one bank, and the clear — not twenty banks.
    expect(seen).toEqual(["bust", "bank", null]);
  });

  it("clears on a rematch and stops on unmount", () => {
    vi.useFakeTimers();
    const { seen, player } = record();
    player.push({ kind: "hot" });
    player.reset();
    expect(seen).toEqual(["hot", null]);
    vi.runAllTimers();
    expect(seen).toEqual(["hot", null]);

    player.push({ kind: "hot" });
    player.dispose();
    vi.runAllTimers();
    expect(seen).toEqual(["hot", null, "hot"]);
  });
});
