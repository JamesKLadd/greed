import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  applyAction,
  diceToRoll,
  getLegalActions,
  type DieValue,
  type GameAction,
} from "@greed/core";
import { BetaActiveContext } from "../../beta/BetaContext.js";
import { LocalTableGame, type SceneOverlay } from "../../beta/LocalTableGame.js";
import { CELEBRATION_MS } from "../../beta/celebrations.js";
import { useAppearance } from "../../beta/AppearanceContext.js";
import { appearanceVars } from "../../beta/appearance.js";
import { SCENE_COUNTS, type SceneCount } from "../../beta/tableSceneGeometry.js";
import { createRollPlayback } from "../../game/rollPlayback.js";
import { DevFrameMeter } from "./DevFrameMeter.js";
import {
  createTableEventFixture,
  TABLE_EVENTS,
  type TableEventFixture,
  type TableEventId,
} from "./tableEventFixtures.js";
import "./tablePrototype.css";

const ROLL_MS = 650;
const START_MS = 450;
const SIZES = [
  { label: "Phone", width: 390, height: 844 },
  { label: "Small phone", width: 360, height: 640 },
  { label: "Narrow phone", width: 320, height: 568 },
  { label: "Landscape", width: 844, height: 390 },
  { label: "Desktop", width: 1280, height: 800 },
];

function sceneUrl(
  count: number,
  event: TableEventId,
  loop: boolean,
  reduced: boolean,
  measure: boolean,
): string {
  return `?table-events&scene&players=${count}&event=${event}${loop ? "&loop" : ""}${reduced ? "&reduced" : ""}${measure ? "&measure" : ""}`;
}

/** A fixture enters the ordinary scene as a state transition, never as fake text. */
function FixturePlayback({
  fixture,
  onReplay,
}: {
  fixture: TableEventFixture;
  onReplay: () => void;
}) {
  const [state, setState] = useState(fixture.before);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [flight, setFlight] = useState<{ indices: number[]; dice: DieValue[] } | null>(null);
  const [rollPlayback] = useState(createRollPlayback);
  const [overlay, setOverlay] = useState<SceneOverlay>(null);
  const { appearance } = useAppearance();

  const act = useCallback(
    (action: GameAction) => {
      if (rollPlayback.active) return;
      const current = stateRef.current;
      const next = applyAction(current, action);
      if (action.type !== "ROLL" || !getLegalActions(current).canRoll) {
        stateRef.current = next;
        setState(next);
        return;
      }
      // Match the local controller's landing contract: cubes know their final
      // faces while the authoritative result stays withheld until the landing.
      setFlight({ indices: diceToRoll(current.turn), dice: next.turn.dice });
      rollPlayback.start(() => {
        setFlight(null);
        stateRef.current = next;
        setState(next);
      }, ROLL_MS);
    },
    [rollPlayback],
  );

  useEffect(() => {
    const start = window.setTimeout(() => act(fixture.action), START_MS);
    return () => {
      window.clearTimeout(start);
      rollPlayback.cancel();
    };
  }, [fixture, act, rollPlayback]);

  return (
    <LocalTableGame
      state={state}
      legal={getLegalActions(state)}
      isRolling={flight !== null}
      rollingIndices={flight?.indices ?? []}
      rollingDice={flight?.dice ?? null}
      canAct={state.phase !== "game-over"}
      onRoll={() => act({ type: "ROLL" })}
      onBank={() => act({ type: "BANK" })}
      onToggleDie={(index) => act({ type: "TOGGLE_LOCK", index })}
      toast={null}
      cosmetics={appearanceVars(appearance)}
      seasonalDefaultTable={appearance.table === "club"}
      perspectiveId={state.players[state.order[0]].id}
      sceneOverlay={overlay}
      onSceneOverlay={setOverlay}
      barTitle={<>GREED</>}
      barLeft={
        <button
          type="button"
          className="tp-icon"
          aria-label="Replay event fixture"
          onClick={onReplay}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 10a8 8 0 1 1 1 8M4 4v6h6" />
          </svg>
        </button>
      }
      barRight={
        <>
          <p>
            <strong>{fixture.title}</strong> · {CELEBRATION_MS[fixture.expected] / 1000} seconds
          </p>
          <p>{fixture.description}</p>
          <button className="tp-close" onClick={onReplay}>
            Replay event
          </button>
          <a className="tp-review-link" href="?table-events" target="_top">
            Change event or screen size
          </a>
        </>
      }
    />
  );
}

function EventScene({ count, event, loop }: { count: number; event: TableEventId; loop: boolean }) {
  const fixture = useMemo(() => createTableEventFixture(event, count), [event, count]);
  const [replay, setReplay] = useState(0);
  useEffect(() => {
    if (!loop) return;
    // Leave a quiet gap after the production duration so visual inspection can
    // distinguish a replay from an announcement that failed to expire.
    const cycle = START_MS + ROLL_MS + CELEBRATION_MS[fixture.expected] + 900;
    const timer = window.setTimeout(() => setReplay((value) => value + 1), cycle);
    return () => window.clearTimeout(timer);
  }, [fixture, loop, replay]);
  return (
    <BetaActiveContext.Provider value={true}>
      <FixturePlayback
        key={replay}
        fixture={fixture}
        onReplay={() => setReplay((value) => value + 1)}
      />
      <DevFrameMeter />
    </BetaActiveContext.Provider>
  );
}

/** Development-only: no profile writes, bot loop, server or game recording. */
export default function TableEventReview() {
  const params = new URLSearchParams(window.location.search);
  const requestedCount = Number(params.get("players"));
  const [count, setCount] = useState<SceneCount>(
    SCENE_COUNTS.includes(requestedCount as SceneCount) ? (requestedCount as SceneCount) : 8,
  );
  const [event, setEvent] = useState<TableEventId>(
    TABLE_EVENTS.find((item) => item.id === params.get("event"))?.id ?? "triple",
  );
  const [loop, setLoop] = useState(params.has("loop"));
  const [reduced, setReduced] = useState(params.has("reduced"));
  const [size, setSize] = useState(0);
  const [replay, setReplay] = useState(0);
  const [space, setSpace] = useState({ width: 700, height: 900 });
  const stage = useRef<HTMLDivElement>(null);
  const sceneOnly = params.has("scene");

  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = { presentation: root.dataset.presentation, motion: root.dataset.motion };
    root.dataset.presentation = "beta";
    if (reduced) root.dataset.motion = "reduced";
    return () => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete root.dataset[key];
        else root.dataset[key] = value;
      }
    };
  }, [reduced]);

  useLayoutEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setSpace({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, [sceneOnly]);

  if (sceneOnly) return <EventScene count={count} event={event} loop={loop} />;
  const fixture = TABLE_EVENTS.find((item) => item.id === event)!;
  const preset = SIZES[size];
  const scale = Math.min(1, space.width / preset.width, space.height / preset.height);
  const url = sceneUrl(count, event, loop, reduced, params.has("measure"));
  return (
    <main className="tp-review">
      <aside className="tp-review__controls">
        <a className="tp-review__home" href="/">
          ← Back to Greed
        </a>
        <p className="tp-eyebrow">VISUAL BETA / TABLE D</p>
        <h1>
          Every big
          <br />
          moment.
        </h1>
        <p className="tp-review__intro">
          Seeded gameplay results through the real scene, dice landing and celebration queue.
        </p>
        <label className="tp-select-label">
          Event
          <select value={event} onChange={(e) => setEvent(e.target.value as TableEventId)}>
            {TABLE_EVENTS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>Players</legend>
          <div className="tp-segments">
            {SCENE_COUNTS.map((value) => (
              <button
                key={value}
                aria-label={`${value} players`}
                aria-pressed={count === value}
                onClick={() => setCount(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="tp-select-label">
          Screen size
          <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
            {SIZES.map((item, index) => (
              <option key={item.label} value={index}>
                {item.label} · {item.width} × {item.height}
              </option>
            ))}
          </select>
        </label>
        <label className="tp-check">
          <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
          Repeat after each full duration
        </label>
        <label className="tp-check">
          <input type="checkbox" checked={reduced} onChange={(e) => setReduced(e.target.checked)} />
          Reduced motion
        </label>
        <button className="tp-close" onClick={() => setReplay((value) => value + 1)}>
          Replay event
        </button>
        <a className="tp-review-link" href={url}>
          Open at this window’s full size ↗
        </a>
        <a className="tp-review-link" href={`?table-play&players=${count}`}>
          Play a local test match ↗
        </a>
        <div className="tp-review__note">
          <strong>{fixture.title}</strong>
          <p>{fixture.description}</p>
          <p>
            Roll, Bank and held dice remain interactive. Replay restores the exact starting state.
            No results are recorded.
          </p>
          <p>Sound follows the normal audio controls and browser gesture policy.</p>
        </div>
      </aside>
      <section className="tp-review__canvas" aria-label="Responsive event preview">
        <div className="tp-review__caption">
          <span>{fixture.title.toUpperCase()}</span>
          <span>
            {preset.width} × {preset.height}
          </span>
        </div>
        <div className="tp-review__stage" ref={stage}>
          <div
            className="tp-review__frame"
            style={{ width: preset.width * scale, height: preset.height * scale }}
          >
            <iframe
              key={`${url}-${replay}`}
              title={`${count}-player ${fixture.title} event`}
              src={url}
              style={{ width: preset.width, height: preset.height, transform: `scale(${scale})` }}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
