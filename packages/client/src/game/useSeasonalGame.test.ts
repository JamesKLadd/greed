import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyAction, createGame } from "@greed/core";
import { buildGame, defaultSetup } from "./setup.js";
import { useSeasonalGame } from "./useSeasonalGame.js";
import { applySeasonalPreference, currentSeasonalTheme, refreshSeasonalTheme } from "./seasonal.js";

// Exercise the hook's actual effect dependencies/cleanups in the repo's node
// runner. Browser tests separately exercise the real React mount and table.
const hooks = vi.hoisted(() => ({
  cursor: 0,
  refs: [] as { current: unknown }[],
  effects: [] as {
    dependencies: unknown[];
    cleanup?: void | (() => void);
  }[],
}));
vi.mock("react", () => ({
  useRef(initial: unknown) {
    const index = hooks.cursor++;
    return (hooks.refs[index] ??= { current: initial });
  },
  useLayoutEffect(effect: () => void | (() => void), dependencies: unknown[]) {
    const index = hooks.cursor++;
    const previous = hooks.effects[index];
    if (
      previous &&
      dependencies.length === previous.dependencies.length &&
      dependencies.every((value, i) => Object.is(value, previous.dependencies[i]))
    )
      return;
    previous?.cleanup?.();
    hooks.effects[index] = { dependencies, cleanup: effect() };
  },
}));

function render(...args: Parameters<typeof useSeasonalGame>) {
  hooks.cursor = 0;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useSeasonalGame(...args);
}
function unmount() {
  for (const effect of hooks.effects) effect?.cleanup?.();
  hooks.refs = [];
  hooks.effects = [];
}
function online() {
  const state = createGame(
    [
      { id: "you", name: "You", isBot: false },
      { id: "friend", name: "Friend", isBot: false },
    ],
    { seed: 123, goal: 3000 },
  );
  // The real online server hides every seed. It cannot identify a rematch.
  state.config.seed = 0;
  return state;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-01T04:59:00Z"));
  vi.stubGlobal("document", { documentElement: { dataset: {} } });
  applySeasonalPreference("automatic");
});
afterEach(() => {
  unmount();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("actual game appearance ownership", () => {
  it("renews local appearance when a fixed-seed restart supplies its new roll-off", () => {
    const setup = { ...defaultSetup(), seed: 7 };
    const first = buildGame(setup);
    render(first.rollOff);
    vi.setSystemTime(new Date("2026-11-01T05:01:00Z"));
    render(first.rollOff);
    expect(refreshSeasonalTheme()).toBe("halloween");
    const restarted = buildGame(setup);
    expect(restarted.state.config.seed).toBe(first.state.config.seed);
    render(restarted.rollOff);
    expect(currentSeasonalTheme()).toBe("thanksgiving");
  });

  it("keeps ordinary online reconnect snapshots pinned, but refreshes a sanitized-seed rematch", () => {
    const first = applyAction(online(), { type: "ROLL" });
    render(undefined, first);
    vi.setSystemTime(new Date("2026-11-01T05:01:00Z"));
    // Reconnects can replace every object and change presentationEpoch while
    // showing the same match. Neither event should repaint its table.
    render(undefined, structuredClone(first));
    expect(refreshSeasonalTheme()).toBe("halloween");
    const continued = applyAction(
      first.turn.outcome ? applyAction(first, { type: "ADVANCE" }) : first,
      { type: "ROLL" },
    );
    expect(continued.log.length).toBeGreaterThan(first.log.length);
    render(undefined, continued);
    expect(currentSeasonalTheme()).toBe("halloween");
    const rematch = online();
    expect(rematch.config.seed).toBe(first.config.seed);
    render(undefined, rematch);
    expect(currentSeasonalTheme()).toBe("thanksgiving");
  });

  it("recognizes leaving a completed online game even if reconnect catch-up has a longer log", () => {
    const finished = online();
    finished.phase = "game-over";
    render(undefined, finished);
    vi.setSystemTime(new Date("2026-11-01T05:01:00Z"));
    const next = applyAction(online(), { type: "ROLL" });
    expect(next.log.length).toBeGreaterThan(finished.log.length);
    render(undefined, next);
    expect(currentSeasonalTheme()).toBe("thanksgiving");
  });

  it("releases completed challenge runs so lobbies and new attempts use the current season", () => {
    render();
    vi.setSystemTime(new Date("2026-11-01T05:01:00Z"));
    expect(refreshSeasonalTheme()).toBe("halloween");
    unmount();
    expect(currentSeasonalTheme()).toBe("thanksgiving");
    vi.setSystemTime(new Date("2026-12-01T06:01:00Z"));
    expect(refreshSeasonalTheme()).toBe("christmas");
    render();
    expect(currentSeasonalTheme()).toBe("christmas");
  });
});
