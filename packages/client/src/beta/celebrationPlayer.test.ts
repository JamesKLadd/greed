import { afterEach, describe, expect, it, vi } from "vitest";
import { createCelebrationPlayer } from "./celebrationPlayer.js";
describe("readable result banners", () => {
  afterEach(() => vi.useRealTimers());
  it("keeps a bust readable through subsequent scores and a quick bot bank", () => {
    vi.useFakeTimers();
    const show = vi.fn();
    const p = createCelebrationPlayer(show);
    p.push({ kind: "bust", player: "Alice" });
    vi.advanceTimersByTime(600);
    p.push({ kind: "score" });
    p.push({ kind: "bank", player: "Bob" });
    vi.advanceTimersByTime(2200);
    expect(show).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(200);
    expect(show).toHaveBeenLastCalledWith({ kind: "bank", player: "Bob" });
    vi.advanceTimersByTime(2600);
    expect(show).toHaveBeenLastCalledWith(null);
  });
  it("prioritizes victory, bounds pending events and clears on rematch/unmount", () => {
    vi.useFakeTimers();
    const show = vi.fn();
    const p = createCelebrationPlayer(show);
    p.push({ kind: "hot" });
    p.push({ kind: "bank" });
    p.push({ kind: "bust" });
    p.push({ kind: "win" });
    expect(show).toHaveBeenLastCalledWith({ kind: "win" });
    p.reset();
    vi.runAllTimers();
    expect(show).toHaveBeenCalledTimes(3);
    p.push({ kind: "hot" });
    p.dispose();
    vi.runAllTimers();
    expect(show).toHaveBeenCalledTimes(4);
  });
});
