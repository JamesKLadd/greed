import { afterEach, describe, expect, it, vi } from "vitest";
import { createRollPlayback } from "./rollPlayback.js";

describe("local dice playback", () => {
  afterEach(() => vi.useRealTimers());

  it("blocks duplicate input synchronously until the dice land exactly once", () => {
    vi.useFakeTimers();
    const playback = createRollPlayback();
    const land = vi.fn();
    expect(playback.start(land, 650)).toBe(true);
    expect(playback.active).toBe(true);
    expect(playback.start(land, 650)).toBe(false);
    vi.advanceTimersByTime(649);
    expect(land).not.toHaveBeenCalled();
    expect(playback.active).toBe(true);
    vi.advanceTimersByTime(1);
    expect(land).toHaveBeenCalledTimes(1);
    expect(playback.active).toBe(false);
  });

  it("cancels an old match's pending result before a restarted match rolls", () => {
    vi.useFakeTimers();
    const playback = createRollPlayback();
    const oldResult = vi.fn();
    const newResult = vi.fn();
    playback.start(oldResult, 650);
    vi.advanceTimersByTime(300);
    playback.cancel();
    expect(playback.active).toBe(false);
    playback.start(newResult, 650);
    vi.advanceTimersByTime(350);
    expect(oldResult).not.toHaveBeenCalled();
    expect(newResult).not.toHaveBeenCalled();
    expect(playback.active).toBe(true);
    vi.advanceTimersByTime(300);
    expect(newResult).toHaveBeenCalledTimes(1);
  });

  it("leaves no result callback after unmount and can survive effect remount", () => {
    vi.useFakeTimers();
    const playback = createRollPlayback();
    const land = vi.fn();
    playback.start(land, 650);
    playback.cancel();
    playback.cancel();
    vi.runAllTimers();
    expect(land).not.toHaveBeenCalled();
    expect(playback.start(land, 650)).toBe(true);
    vi.runAllTimers();
    expect(land).toHaveBeenCalledTimes(1);
  });
});
