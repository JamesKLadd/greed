import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyAction, canToggleLock, runPosition, type RunMove } from "@greed/core";
import { ApiError } from "../net/auth.js";
import { useChallengeRun, type PlayMove, type ResumeRun, type RunView } from "./useChallengeRun.js";

// Vitest has no DOM here. Keep React's state/ref/effect storage, and exercise
// the real hook with controlled network replies rather than restating its loop.
const hooks = vi.hoisted(() => ({
  cursor: 0,
  slots: [] as unknown[],
  effects: [] as (() => void | (() => void))[],
  cleanup: [] as (() => void)[],
  updates: 0,
}));

vi.mock("react", () => ({
  useState(initial: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) {
      hooks.slots[index] = typeof initial === "function" ? initial() : initial;
    }
    return [
      hooks.slots[index],
      (next: unknown) => {
        hooks.updates++;
        hooks.slots[index] = typeof next === "function" ? next(hooks.slots[index]) : next;
      },
    ];
  },
  useRef(initial: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
    return hooks.slots[index];
  },
  useCallback: (fn: unknown) => fn,
  useEffect(effect: () => void | (() => void)) {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) {
      hooks.slots[index] = true;
      hooks.effects.push(effect);
      const cleanup = effect();
      if (cleanup) hooks.cleanup.push(cleanup);
    }
  },
}));

vi.mock("../i18n/i18n.js", () => ({ useT: () => (key: string) => key }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function position(seed: number, moves: RunMove[] = [], totalTurns = 10): RunView {
  const run = runPosition(seed, moves, totalTurns);
  return { state: run.state, turns: run.turns, totalTurns, complete: run.result.complete };
}

const scoringSeed = Array.from({ length: 100 }, (_, i) => i + 1).find(
  (seed) => !position(seed, ["ROLL"]).state.turn.outcome,
)!;
const bustSeed = Array.from({ length: 100 }, (_, i) => i + 1).find(
  (seed) => position(seed, ["ROLL"]).state.turn.outcome === "busted",
)!;

function render(initial: RunView, play: PlayMove, resume?: ResumeRun) {
  hooks.cursor = 0;
  // This node-only harness supplies React's hook storage instead of a renderer.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useChallengeRun(initial, play, resume);
}

async function settle() {
  // Both the POST rejection and subsequent GET response may settle here.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function unmount() {
  for (const cleanup of hooks.cleanup.splice(0)) cleanup();
}

beforeEach(() => {
  hooks.cursor = 0;
  hooks.slots = [];
  hooks.effects = [];
  hooks.cleanup = [];
  hooks.updates = 0;
  vi.useFakeTimers();
  vi.stubGlobal("window", { setTimeout: globalThis.setTimeout });
});

afterEach(() => {
  unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("challenge move presentation and synchronization", () => {
  it("responds to a hold instantly and prevents another move overtaking it", async () => {
    const initial = position(scoringSeed, ["ROLL"]);
    const index = initial.state.turn.dice.findIndex((_, i) => canToggleLock(initial.state.turn, i));
    const reply = deferred<RunView>();
    const play = vi.fn(() => reply.promise);
    let run = render(initial, play);

    run.toggleDie(index);
    // Same-render calls also share the request guard.
    run.roll();
    run.bank();
    run.toggleDie(index);
    run = render(initial, play);
    expect(play).toHaveBeenCalledOnce();
    expect(play).toHaveBeenCalledWith(`H${index}`);
    expect(run.state).toEqual(applyAction(initial.state, { type: "TOGGLE_LOCK", index }));
    expect(run.pendingMove).toBe(`H${index}`);
    expect(run.isPending).toBe(true);
    expect(run.canToggleDice).toBe(false);
    expect(run.canRoll).toBe(false);
    expect(run.canBank).toBe(false);

    const next = position(scoringSeed, ["ROLL", `H${index}` as RunMove]);
    reply.resolve(next);
    await settle();
    run = render(initial, play);
    expect(run.state).toBe(next.state);
    expect(run.isPending).toBe(false);
    expect(run.canToggleDice).toBe(true);
  });

  it("does not submit the last-held refusal or an invalid die index", () => {
    const initial = position(scoringSeed, ["ROLL"]);
    // Reduce a legal mat to one held die using engine actions.
    for (let index = 0; index < initial.state.turn.dice.length; index++) {
      if (initial.state.turn.locked[index] && canToggleLock(initial.state.turn, index)) {
        initial.state = applyAction(initial.state, { type: "TOGGLE_LOCK", index });
      }
    }
    const last = initial.state.turn.locked.findIndex(Boolean);
    const play = vi.fn();
    const run = render(initial, play);
    run.toggleDie(last);
    run.toggleDie(-1);
    run.toggleDie(5);
    expect(play).not.toHaveBeenCalled();
    expect(render(initial, play).state).toBe(initial.state);
  });

  it("keeps double rolls and held taps blocked through the single landing animation", async () => {
    const initial = position(scoringSeed);
    const reply = deferred<RunView>();
    const play = vi.fn(() => reply.promise);
    let run = render(initial, play);
    run.roll();
    run.roll();
    expect(play).toHaveBeenCalledOnce();
    expect(play).toHaveBeenCalledWith("ROLL");
    run = render(initial, play);
    expect(run.pendingMove).toBe("ROLL");
    expect(run.isRolling).toBe(false);

    const next = position(scoringSeed, ["ROLL"]);
    reply.resolve(next);
    await settle();
    run = render(initial, play);
    expect(run.isRolling).toBe(true);
    expect(run.state).toBe(initial.state);
    expect(run.rollingDice).toEqual(next.state.turn.dice);
    run.roll();
    run.toggleDie(0);
    vi.advanceTimersByTime(650);
    run = render(initial, play);
    expect(run.isRolling).toBe(false);
    expect(run.state).toBe(next.state);
    expect(play).toHaveBeenCalledOnce();
  });

  it("reconciles a lost hold reply without toggling or rolling a second time", async () => {
    const initial = position(scoringSeed, ["ROLL"]);
    const index = initial.state.turn.dice.findIndex((_, i) => canToggleLock(initial.state.turn, i));
    const reply = deferred<RunView>();
    const read = deferred<RunView | null>();
    const play = vi.fn(() => reply.promise);
    const resume = vi.fn(() => read.promise);
    let run = render(initial, play, resume);
    run.toggleDie(index);
    reply.reject(new ApiError(0, "English network message"));
    await settle();
    run = render(initial, play, resume);
    expect(run.state).toBe(initial.state);
    expect(run.needsSync).toBe(true);
    expect(run.isPending).toBe(true);
    expect(run.error).toBe("run.moveFailed");
    run.roll();
    run.toggleDie(index);

    const accepted = position(scoringSeed, ["ROLL", `H${index}` as RunMove]);
    read.resolve(accepted);
    await settle();
    run = render(initial, play, resume);
    expect(run.state).toBe(accepted.state);
    expect(run.needsSync).toBe(false);
    expect(run.error).toBeNull();
    expect(play).toHaveBeenCalledOnce();
    expect(resume).toHaveBeenCalledOnce();
  });

  it("keeps an unresolved request blocked and retries only the recovery read", async () => {
    const initial = position(scoringSeed);
    const read = deferred<RunView | null>();
    const play = vi.fn().mockRejectedValue(new Error("Lost reply"));
    const resume = vi
      .fn()
      .mockRejectedValueOnce(new Error("Offline"))
      .mockReturnValue(read.promise);
    let run = render(initial, play, resume);
    run.roll();
    await settle();
    run = render(initial, play, resume);
    expect(run.needsSync).toBe(true);
    expect(run.isPending).toBe(false);
    expect(run.error).toBe("run.syncFailed");
    expect(run.canRoll).toBe(false);
    run.roll();
    run.bank();
    run.retrySync();
    run.retrySync();
    expect(resume).toHaveBeenCalledTimes(2);
    expect(play).toHaveBeenCalledOnce();

    read.resolve(position(scoringSeed, ["ROLL"]));
    await settle();
    run = render(initial, play, resume);
    expect(run.needsSync).toBe(false);
    expect(run.canBank).toBe(true);
  });

  it("refreshes the parent when recovery finds no open run, without inventing a score", async () => {
    const initial = position(scoringSeed);
    const play = vi.fn().mockRejectedValue(new Error("Lost reply"));
    const resume = vi.fn().mockResolvedValue(null);
    const run = render(initial, play, resume);
    run.roll();
    await settle();
    const recovered = render(initial, play, resume);
    expect(recovered.finished).toBe(true);
    expect(recovered.completedView).toBeNull();
    expect(recovered.state.players[0].total).toBe(initial.state.players[0].total);
    expect(play).toHaveBeenCalledOnce();
  });

  it("lets the final bank read before switching to results", async () => {
    const initial = position(scoringSeed, ["ROLL"], 1);
    const next = position(scoringSeed, ["ROLL", "BANK"], 1);
    const play = vi.fn().mockResolvedValue(next);
    render(initial, play).bank();
    await settle();
    expect(render(initial, play).finished).toBe(false);
    expect(render(initial, play).state.turn.outcome).toBe("banked");
    vi.advanceTimersByTime(899);
    expect(render(initial, play).finished).toBe(false);
    vi.advanceTimersByTime(1);
    expect(render(initial, play).finished).toBe(true);
    expect(render(initial, play).completedView).toBe(next);
  });

  it("keeps an ordinary bank immediate and clears the previous turn's dice", async () => {
    const initial = position(scoringSeed, ["ROLL"]);
    const next = position(scoringSeed, ["ROLL", "BANK"]);
    const play = vi.fn().mockResolvedValue(next);
    render(initial, play).bank();
    await settle();
    const run = render(initial, play);
    expect(run.finished).toBe(false);
    expect(run.turn).toBe(1);
    expect(run.state.players[0].total).toBe(next.state.players[0].total);
    expect(run.state.turn.outcome).toBeNull();
    expect(run.state.turn.lastRoll).toBeNull();
    expect(run.canRoll).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("gives the final bust its complete landing and readable resolve beat", async () => {
    const initial = position(bustSeed, [], 1);
    const next = position(bustSeed, ["ROLL"], 1);
    const play = vi.fn().mockResolvedValue(next);
    render(initial, play).roll();
    await settle();
    vi.advanceTimersByTime(650);
    expect(render(initial, play).state.turn.outcome).toBe("busted");
    expect(render(initial, play).finished).toBe(false);
    vi.advanceTimersByTime(1900);
    expect(render(initial, play).finished).toBe(true);
  });

  it("ignores a move reply after leaving, even if effects reactivate in StrictMode", async () => {
    const initial = position(scoringSeed);
    const reply = deferred<RunView>();
    const play = vi.fn(() => reply.promise);
    render(initial, play).roll();
    unmount();
    for (const effect of hooks.effects) effect();
    const before = hooks.updates;
    reply.resolve(position(scoringSeed, ["ROLL"]));
    await settle();
    expect(hooks.updates).toBe(before);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels a landing timer when leaving", async () => {
    const initial = position(scoringSeed);
    const play = vi.fn().mockResolvedValue(position(scoringSeed, ["ROLL"]));
    render(initial, play).roll();
    await settle();
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    const before = hooks.updates;
    vi.advanceTimersByTime(5000);
    expect(hooks.updates).toBe(before);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores an authoritative recovery read that arrives after leaving", async () => {
    const initial = position(scoringSeed);
    const read = deferred<RunView | null>();
    const play = vi.fn().mockRejectedValue(new Error("Lost reply"));
    const resume = vi.fn(() => read.promise);
    render(initial, play, resume).roll();
    await settle();
    expect(resume).toHaveBeenCalledOnce();
    unmount();
    const before = hooks.updates;
    read.resolve(position(scoringSeed, ["ROLL"]));
    await settle();
    expect(hooks.updates).toBe(before);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not allow continuation when no recovery reader was supplied", async () => {
    const initial = position(scoringSeed);
    const play = vi.fn().mockRejectedValue(new Error("Lost reply"));
    const run = render(initial, play);
    run.roll();
    await settle();
    const unresolved = render(initial, play);
    expect(unresolved.needsSync).toBe(true);
    expect(unresolved.error).toBe("run.syncFailed");
    unresolved.roll();
    expect(play).toHaveBeenCalledOnce();
  });
});
