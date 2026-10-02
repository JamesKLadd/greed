import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { DieValue } from "@greed/core";
import { Die } from "../../components/Die.js";
import { Modal } from "../../ui/Modal.js";
import { TableScene, type ScenePlayer } from "../../beta/TableScene.js";
import { SCENE_COUNTS, type SceneCount } from "../../beta/tableSceneGeometry.js";
import "./tablePrototype.css";
import CharacterArtReview from "./CharacterArtReview.js";
import { appearanceVars, type Appearance } from "../../beta/appearance.js";
import type { TableFeedback } from "../../beta/tableFeedback.js";
import type { CharacterKind } from "../../beta/characters/manifest.js";

type Count = SceneCount;
type EventSample = "hot" | "triple" | "none";
type Seat = ScenePlayer;
const PEOPLE = [
  { name: "James", characterId: "fox", score: 1200 },
  { name: "Bear", characterId: "bear", score: 430 },
  { name: "Cleo", characterId: "cat", score: 1500 },
  { name: "Pip", characterId: "panda", score: 2000 },
  { name: "Oliver", characterId: "owl", score: 0 },
  { name: "Frankie", characterId: "frog", score: 400 },
  { name: "Violet", characterId: "cat", score: 120 },
  { name: "Rusty", characterId: "fox", score: 950 },
];
const SIZES = [
  { label: "Phone", width: 390, height: 844 },
  { label: "Small phone", width: 360, height: 640 },
  { label: "Narrow phone", width: 320, height: 568 },
  { label: "Landscape", width: 844, height: 390 },
  { label: "Desktop", width: 1280, height: 800 },
];

function sceneUrl(
  count: Count,
  event: EventSample,
  held: boolean,
  anchor: number,
  stress: boolean,
  spectator: boolean,
) {
  return `?table-preview&scene&players=${count}&event=${event}${held ? "&held" : ""}&anchor=${anchor}${stress ? "&stress" : ""}${spectator ? "&spectator" : ""}`;
}

export function Scene({
  count,
  event,
  held,
  anchor,
  stress,
  spectator,
  look,
  characters,
  feedback,
  onMenu,
  backHref = "?table-preview",
}: {
  count: Count;
  event: EventSample;
  held: boolean;
  anchor: number;
  stress: boolean;
  spectator: boolean;
  look?: Appearance;
  characters?: readonly CharacterKind[];
  feedback?: TableFeedback;
  onMenu?: () => void;
  backHref?: string;
}) {
  const [detail, setDetail] = useState<Seat | "menu" | null>(null);
  const seats: ScenePlayer[] = PEOPLE.slice(0, count).map((p, i) => ({
    ...p,
    characterId: characters?.[i % characters.length] ?? p.characterId,
    id: String(i),
    name: stress ? p.name + " the Magnificent" : p.name,
    score: stress ? 123450 + i * 50 : p.score,
  }));
  const sampleDice: DieValue[] = event === "triple" ? [3, 3, 3, 2, 4] : [1, 2, 3, 4, 5];
  const atStake = event === "triple" ? 300 : 500;
  return (
    <main
      className={`tp-screen tp-count-${count}${look ? " scene-game" : ""}`}
      style={look ? appearanceVars(look) : undefined}
    >
      <header className="tp-header">
        <a href={backHref} target="_top" aria-label="Back to table review" className="tp-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m14 5-7 7 7 7M7 12h14" />
          </svg>
        </a>
        <span className="tp-wordmark">
          GREED<span>THE EMERALD TABLE</span>
        </span>
        <button
          type="button"
          aria-label="Open table menu preview"
          className="tp-icon"
          onClick={() => (onMenu ? onMenu() : setDetail("menu"))}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </header>
      <TableScene
        players={seats}
        order={seats.map((p) => p.id)}
        perspectiveId={seats[anchor]?.id}
        viewerId={spectator ? undefined : seats[anchor]?.id}
        onPlayerDetails={setDetail}
        {...feedback}
      >
        <div
          className={`tp-event tp-event--${event}`}
          aria-label={
            event === "hot" ? "Hot dice" : event === "triple" ? "Three of a kind" : undefined
          }
        >
          {event !== "none" && (
            <>
              <span className="tp-spark tp-spark--one" aria-hidden="true">
                ✦
              </span>
              <span className="tp-spark tp-spark--two" aria-hidden="true">
                ✧
              </span>
              <span className="tp-event__kicker">
                {event === "hot" ? "ALL FIVE. ALL YOURS." : "THAT’S A KEEPER."}
              </span>
              <strong>
                {event === "hot" ? (
                  <>
                    HOT
                    <br />
                    DICE!
                  </>
                ) : (
                  <>
                    THREE
                    <br />
                    OF A KIND!
                  </>
                )}
              </strong>
              <span className="tp-event__tail">
                {event === "hot" ? "LET ’EM ROLL AGAIN" : "MAKE YOUR NEXT MOVE"}
              </span>
            </>
          )}
        </div>
        <div className="tp-dice" aria-label="Five sample dice">
          {sampleDice.map((value, index) => (
            <div className="tp-die-cell" key={index}>
              <Die
                value={value}
                dimensional
                locked={held && (event === "triple" ? index < 3 : value === 1 || value === 5)}
              />
            </div>
          ))}
        </div>
        <div className="tp-turn-label">
          {spectator ? "WATCHING" : anchor === 0 ? "YOUR TURN" : "JAMES’ TURN"} <span>•</span>{" "}
          {atStake} POINTS AT STAKE
        </div>
        <button
          className="tp-action tp-action--roll"
          type="button"
          disabled
          title="Composition preview — gameplay comes in Table C"
        >
          <strong>ROLL</strong>
          <span>{event === "triple" ? 2 : 5} DICE</span>
        </button>
        <button
          className="tp-action tp-action--bank"
          type="button"
          disabled
          title="Composition preview — gameplay comes in Table C"
        >
          <strong>BANK</strong>
          <span>{atStake} POINTS</span>
        </button>
      </TableScene>
      <div className="tp-empty" aria-hidden="true" />
      {detail && (
        <Modal
          title={detail === "menu" ? "Table preview" : detail.name}
          onClose={() => setDetail(null)}
        >
          {detail === "menu" ? (
            <>
              <p>
                This is a static composition study. Roll, Bank and the sample scores do not change a
                game.
              </p>
              <p>
                Volume, history, rules and standings move into this menu when gameplay is connected
                in Table C.
              </p>
              <a className="tp-review-link" href="?table-preview" target="_top">
                Change players or screen size →
              </a>
            </>
          ) : (
            <>
              <p>{detail.score} points · Placeholder character</p>
              <p>Character art and names are sample data for this layout review.</p>
            </>
          )}
          <button className="tp-close" onClick={() => setDetail(null)}>
            Close
          </button>
        </Modal>
      )}
    </main>
  );
}

export default function TablePrototype() {
  const params = new URLSearchParams(window.location.search);
  const initialCount = Number(params.get("players"));
  const [count, setCount] = useState<Count>(
    SCENE_COUNTS.includes(initialCount as Count) ? (initialCount as Count) : 8,
  );
  const [event, setEvent] = useState<EventSample>(
    params.get("event") === "none" ? "none" : params.get("event") === "triple" ? "triple" : "hot",
  );
  const [held, setHeld] = useState(params.has("held"));
  const [size, setSize] = useState(0);
  const [anchor, setAnchor] = useState(
    Math.max(0, Math.min(count - 1, Math.trunc(Number(params.get("anchor")) || 0))),
  );
  const [stress, setStress] = useState(params.has("stress"));
  const [spectator, setSpectator] = useState(params.has("spectator"));
  const selectedAnchor = Math.min(anchor, count - 1);
  const [space, setSpace] = useState({ width: 700, height: 900 });
  const stage = useRef<HTMLDivElement>(null);
  const sceneOnly = params.has("scene");
  useLayoutEffect(() => {
    const previous = document.documentElement.dataset.presentation;
    document.documentElement.dataset.presentation = "beta";
    return () => {
      document.documentElement.dataset.presentation = previous;
    };
  }, []);
  useLayoutEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setSpace({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, [sceneOnly]);
  if (params.has("art-review")) return <CharacterArtReview />;
  if (sceneOnly)
    return (
      <Scene
        count={count}
        event={event}
        held={held}
        anchor={selectedAnchor}
        stress={stress}
        spectator={spectator}
      />
    );
  const preset = SIZES[size];
  const scale = Math.min(1, space.width / preset.width, space.height / preset.height);
  return (
    <main className="tp-review">
      <aside className="tp-review__controls">
        <a className="tp-review__home" href="/">
          ← Back to Greed
        </a>
        <p className="tp-eyebrow">VISUAL BETA / TABLE B</p>
        <h1>
          A seat at
          <br />
          the table.
        </h1>
        <p className="tp-review__intro">
          A first look at Greed’s new viewpoint. Try a quiet head-to-head or a full family table.
        </p>
        <fieldset>
          <legend>Players</legend>
          <div className="tp-segments">
            {SCENE_COUNTS.map((n) => (
              <button
                key={n}
                aria-label={`${n} players`}
                aria-pressed={count === n}
                onClick={() => setCount(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="tp-select-label">
          Screen size
          <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
            {SIZES.map((s, i) => (
              <option key={s.label} value={i}>
                {s.label} · {s.width} × {s.height}
              </option>
            ))}
          </select>
        </label>
        <label className="tp-select-label">
          View from seat
          <select value={selectedAnchor} onChange={(e) => setAnchor(Number(e.target.value))}>
            {PEOPLE.slice(0, count).map((p, i) => (
              <option key={i} value={i}>
                {i + 1} · {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="tp-check">
          <input type="checkbox" checked={stress} onChange={(e) => setStress(e.target.checked)} />
          Long names and large scores
        </label>
        <label className="tp-check">
          <input
            type="checkbox"
            checked={spectator}
            onChange={(e) => setSpectator(e.target.checked)}
          />
          Spectator labels
        </label>
        <label className="tp-select-label">
          Moment on the table
          <select value={event} onChange={(e) => setEvent(e.target.value as EventSample)}>
            <option value="hot">Hot Dice</option>
            <option value="triple">Three of a Kind</option>
            <option value="none">Clear table</option>
          </select>
        </label>
        <label className="tp-check">
          <input type="checkbox" checked={held} onChange={(e) => setHeld(e.target.checked)} />
          Show held-dice markers
        </label>
        <a
          className="tp-review-link"
          href={sceneUrl(count, event, held, selectedAnchor, stress, spectator)}
        >
          Open at this window’s full size ↗
        </a>
        <a className="tp-review-link" href={`?table-play&players=${count}`}>
          Play Table C · local test match ↗
        </a>
        <div className="tp-review__note">
          <strong>Composition review</strong>
          <p>Placeholder characters · Sample scores · Static effects</p>
          <p>
            Roll and Bank are display samples. The blank bottom strip is intentional. Nothing here
            changes your games or profile.
          </p>
        </div>
      </aside>
      <section className="tp-review__canvas" aria-label="Responsive table preview">
        <div className="tp-review__caption">
          <span>
            {count} PLAYERS / {preset.label.toUpperCase()}
          </span>
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
              title={`${count}-player ${preset.label} table preview`}
              src={sceneUrl(count, event, held, selectedAnchor, stress, spectator)}
              style={
                {
                  width: preset.width,
                  height: preset.height,
                  transform: `scale(${scale})`,
                } as CSSProperties
              }
            />
          </div>
        </div>
      </section>
    </main>
  );
}
