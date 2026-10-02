import { CharacterSprite } from "../../beta/characters/CharacterSprite.js";
import { CharacterPlaceholder } from "../../beta/characters/CharacterPlaceholder.js";
import { Mascot } from "../../beta/Mascot.js";
import { DEFAULT_APPEARANCE } from "../../beta/appearance.js";
import type { CharacterView } from "../../beta/characters/manifest.js";
import "./characterPilotReview.css";

const VIEWS: { view: CharacterView; mirrored?: boolean; label: string }[] = [
  { view: "front", label: "Far seat: front" },
  { view: "side", label: "Right seat: side" },
  { view: "side", mirrored: true, label: "Left seat: mirrored side" },
  { view: "back", label: "Your seat: back" },
];

function LegacyFox({ view, mirrored }: { view: CharacterView; mirrored?: boolean }) {
  return (
    <svg viewBox="0 0 180 240" fill="none" aria-hidden="true" focusable="false">
      <g transform={mirrored ? "translate(180 0) scale(-1 1)" : undefined}>
        <CharacterPlaceholder kind="fox" view={view} />
      </g>
    </svg>
  );
}

/** DEV art review only; reads no account data and does not save an appearance. */
export default function CharacterPilotReview() {
  return (
    <main className="character-pilot-review">
      <a href="?polish-review">Back to polish review</a>
      <h1>Fox character pilot</h1>
      <p>
        A friendly game-night host: sharp ears, a cream muzzle and tail tip, an emerald jacket and
        gold trim. This pilot preserves the seated canvas and table positions. The other five
        characters now follow the approved pilot in the full cast review.
      </p>
      <p>
        <a href="?cast-review">Review the complete cast and materials</a>
        <a href="?table-preview&scene&players=8">Review on the eight-player table</a>
        <a href="?table-preview&scene&players=4">Review on the four-player table</a>
        <a href="?table-preview&art-review">Image replacement and fallback review</a>
      </p>
      <div className="character-pilot-review__portrait">
        <Mascot look={{ ...DEFAULT_APPEARANCE, mascot: "fox" }} name="Fox pilot portrait" />
        <div>
          <h2>Matching profile portrait</h2>
          <p>The profile and table use the same face drawing and palette.</p>
        </div>
      </div>
      <section className="character-pilot-review__grid" aria-label="Seated fox views">
        {VIEWS.map(({ view, mirrored, label }) => (
          <article key={label}>
            <h2>{label}</h2>
            <div className="character-pilot-review__comparison">
              <figure>
                <LegacyFox view={view} mirrored={mirrored} />
                <figcaption>Previous</figcaption>
              </figure>
              <figure>
                <CharacterSprite characterId="fox" view={view} mirrored={mirrored} />
                <figcaption>Pilot</figcaption>
              </figure>
            </div>
            <h3>Small seat sizes</h3>
            <div className="character-pilot-review__sizes">
              {[55, 72, 108].map((width) => (
                <figure key={width} style={{ width }}>
                  <CharacterSprite characterId="fox" view={view} mirrored={mirrored} />
                  <figcaption>{width}px</figcaption>
                </figure>
              ))}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
