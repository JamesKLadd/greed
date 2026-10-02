import { useEffect, useLayoutEffect, useState } from "react";
import { BetaActiveContext } from "../../beta/BetaContext.js";
import { CharacterSprite } from "../../beta/characters/CharacterSprite.js";
import {
  CHARACTER_KINDS,
  type CharacterKind,
  type CharacterView,
} from "../../beta/characters/manifest.js";
import { Mascot } from "../../beta/Mascot.js";
import { TableSurface } from "../../beta/TableSurface.js";
import {
  appearanceVars,
  DEFAULT_APPEARANCE,
  SAMPLE_DICE,
  SAMPLE_TABLES,
  type Appearance,
} from "../../beta/appearance.js";
import type { TableFeedback } from "../../beta/tableFeedback.js";
import { SCENE_COUNTS, type SceneCount } from "../../beta/tableSceneGeometry.js";
import { Die } from "../../components/Die.js";
import { DICE_SKINS, TABLE_THEMES } from "../../game/cosmetics.js";
import { Modal } from "../../ui/Modal.js";
import { Scene } from "../tablePrototype/TablePrototype.js";
import "./castReview.css";

const VIEWS: { view: CharacterView; mirrored?: boolean; label: string }[] = [
  { view: "front", label: "Front" },
  { view: "side", label: "Right side" },
  { view: "side", mirrored: true, label: "Left side" },
  { view: "back", label: "Back" },
];
const DICE = [...SAMPLE_DICE, ...DICE_SKINS.map((item) => item.id)];
const TABLES = [...SAMPLE_TABLES, ...TABLE_THEMES.map((item) => item.id)];
const TITLES: Record<CharacterKind, string> = {
  fox: "Emerald host",
  bear: "Warm-hearted regular",
  owl: "Watchful strategist",
  cat: "Confident high roller",
  frog: "Cheerful risk taker",
  panda: "Easygoing companion",
};

/** DEV only: all cosmetics can be inspected without equipping or changing progression. */
export default function CastReview() {
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const sceneOnly = params.has("scene");
  const [kind, setKind] = useState<CharacterKind>(
    () => CHARACTER_KINDS.find((id) => id === params.get("mascot")) ?? "fox",
  );
  const [count, setCount] = useState<SceneCount>(
    () => SCENE_COUNTS.find((n) => n === Number(params.get("players"))) ?? 8,
  );
  const [anchor, setAnchor] = useState(() =>
    Math.max(0, Math.min(count - 1, Math.trunc(Number(params.get("anchor")) || 0))),
  );
  const [look, setLook] = useState<Appearance>(() => ({
    ...DEFAULT_APPEARANCE,
    dice: DICE.find((id) => id === params.get("dice")) ?? "house",
    table: TABLES.find((id) => id === params.get("table")) ?? "club",
  }));
  const [motion, setMotion] = useState("stored");
  const [menu, setMenu] = useState(false);
  const [feedback, setFeedback] = useState<TableFeedback>({});
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = { presentation: root.dataset.presentation, motion: root.dataset.motion };
    root.dataset.presentation = "beta";
    if (motion !== "stored") root.dataset.motion = motion;
    return () => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete root.dataset[key];
        else root.dataset[key] = value;
      }
    };
  }, [motion]);
  useEffect(() => {
    if (!feedback.banked && !feedback.bustedId) return;
    const timer = setTimeout(() => setFeedback({}), 950);
    return () => clearTimeout(timer);
  }, [feedback]);
  const controls = (
    <div className="cast-review__controls">
      <p>Sample art and scores only. These controls never equip cosmetics or save preferences.</p>
      <label>
        Players
        <select
          value={count}
          onChange={(e) => {
            const next = Number(e.target.value) as SceneCount;
            setCount(next);
            setAnchor((a) => Math.min(a, next - 1));
            setFeedback({});
          }}
        >
          {SCENE_COUNTS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <label>
        Camera behind
        <select
          value={anchor}
          onChange={(e) => {
            setAnchor(Number(e.target.value));
            setFeedback({});
          }}
        >
          {Array.from({ length: count }, (_, i) => (
            <option key={i} value={i}>
              Seat {i + 1} · {CHARACTER_KINDS[i % CHARACTER_KINDS.length]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Dice material
        <select
          value={look.dice}
          onChange={(e) => setLook((l) => ({ ...l, dice: e.target.value }))}
        >
          {DICE.map((id) => (
            <option key={id}>{id}</option>
          ))}
        </select>
      </label>
      <label>
        Table material
        <select
          value={look.table}
          onChange={(e) => setLook((l) => ({ ...l, table: e.target.value }))}
        >
          {TABLES.map((id) => (
            <option key={id}>{id}</option>
          ))}
        </select>
      </label>
      <label>
        Motion in this preview
        <select value={motion} onChange={(e) => setMotion(e.target.value)}>
          <option value="stored">Use saved preference</option>
          <option value="full">Full motion</option>
          <option value="reduced">Reduced motion</option>
        </select>
      </label>
      <button
        className="btn"
        onClick={() => {
          setMenu(false);
          setFeedback({ banked: { playerId: String(anchor), points: 500, sequence: Date.now() } });
        }}
      >
        Preview bank reaction
      </button>
      <button
        className="btn"
        onClick={() => {
          setMenu(false);
          setFeedback({ bustedId: String(anchor) });
        }}
      >
        Preview bust reaction
      </button>
    </div>
  );
  return (
    <BetaActiveContext.Provider value={true}>
      {sceneOnly ? (
        <>
          <Scene
            count={count}
            event="none"
            held
            anchor={anchor}
            stress={false}
            spectator={false}
            look={look}
            characters={CHARACTER_KINDS}
            feedback={feedback}
            onMenu={() => setMenu(true)}
            backHref="?cast-review"
          />
          {menu && (
            <Modal title="Cast and material review" onClose={() => setMenu(false)} scroll>
              {controls}
              <button className="btn" onClick={() => setMenu(false)}>
                Back to table
              </button>
            </Modal>
          )}
        </>
      ) : (
        <main className="cast-review">
          <a href="/">Back to Greed</a>
          <h1>The Greed cast</h1>
          <p>
            Six friendly game-night personalities. Matching portraits and seated art; the existing
            table layout is preserved.
          </p>
          <p>
            <a href="?cast-review&scene&players=8">Review on the table</a>
            <a href="?character-pilot">Fox comparison</a>
            <a href="?support-review&screen=locker">Locker sample</a>
          </p>
          <section className="cast-review__lineup" aria-label="Cast lineup">
            {CHARACTER_KINDS.map((id) => (
              <article key={id}>
                <Mascot look={{ ...DEFAULT_APPEARANCE, mascot: id }} name={`${id} portrait`} />
                <CharacterSprite characterId={id} view="front" />
                <h2>{id}</h2>
                <p>{TITLES[id]}</p>
              </article>
            ))}
          </section>
          <label className="cast-review__select">
            Inspect seated views
            <select value={kind} onChange={(e) => setKind(e.target.value as CharacterKind)}>
              {CHARACTER_KINDS.map((id) => (
                <option key={id}>{id}</option>
              ))}
            </select>
          </label>
          <section className="cast-review__views" aria-label={`${kind} seated views`}>
            {VIEWS.map(({ view, mirrored, label }) => (
              <article key={label}>
                <h2>{label}</h2>
                <CharacterSprite characterId={kind} view={view} mirrored={mirrored} />
                <div className="cast-review__sizes">
                  {[55, 72, 108].map((width) => (
                    <figure key={width} style={{ width }}>
                      <CharacterSprite characterId={kind} view={view} mirrored={mirrored} />
                      <figcaption>{width}px</figcaption>
                    </figure>
                  ))}
                </div>
              </article>
            ))}
          </section>
          <h2>Dice materials</h2>
          <p>
            Ordinary, scoring/held and flat five-pip faces. All samples are previews, including
            earned cosmetics.
          </p>
          <section className="cast-review__materials" aria-label="Dice materials">
            {DICE.map((id) => (
              <article key={id} style={appearanceVars({ ...DEFAULT_APPEARANCE, dice: id })}>
                <h3>{id}</h3>
                <div className="cast-review__dice">
                  <Die value={5} dimensional size={44} />
                  <Die value={5} locked dimensional size={44} />
                  <Die value={5} size={32} />
                </div>
              </article>
            ))}
          </section>
          <h2>Table materials</h2>
          <section className="cast-review__materials" aria-label="Table materials">
            {TABLES.map((id) => (
              <article key={id} style={appearanceVars({ ...DEFAULT_APPEARANCE, table: id })}>
                <h3>{id}</h3>
                <div className="cast-review__surface">
                  <TableSurface />
                </div>
              </article>
            ))}
          </section>
        </main>
      )}
    </BetaActiveContext.Provider>
  );
}
