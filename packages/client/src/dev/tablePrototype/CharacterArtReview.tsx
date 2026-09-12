import {
  CharacterSprite,
  DEFAULT_CHARACTER_ART,
  type CharacterArt,
} from "../../beta/characters/index.js";

// Visible pixels occupy (180, 240)–(540, 720) inside a deliberately padded 600 × 800 file.
const PADDED_ART: CharacterArt = {
  src: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
    <path d="M240 440H480L540 600H420V720H300V600H180Z" fill="#53b69a"/>
    <circle cx="360" cy="340" r="100" fill="#e9ca85"/>
    <path d="M430 330L510 350L430 370Z" fill="#eb945b"/>
    <circle cx="392" cy="320" r="15" fill="#122c29"/>
    <path d="M320 470L360 510L400 470" fill="none" stroke="#122c29" stroke-width="14"/>
    <circle cx="360" cy="560" r="12" fill="#e9ca85"/>
  </svg>`)}`,
  anchor: { x: 0.6, y: 0.6 },
  visibleBounds: { x: 0.3, y: 0.3, width: 0.6, height: 0.6 },
};

const MISSING_ART: CharacterArt = {
  ...DEFAULT_CHARACTER_ART,
  src: "/__character-art-review-missing__.png",
};

const EXAMPLES = [
  {
    id: "padded",
    title: "Padded image",
    description: "Transparent padding removed; anchor stays at the canvas center.",
    characterId: "fox",
    art: PADDED_ART,
    mirrored: false,
  },
  {
    id: "mirrored",
    title: "Mirrored image",
    description: "The same image faces the other way; its label stays readable.",
    characterId: "fox",
    art: PADDED_ART,
    mirrored: true,
  },
  {
    id: "missing",
    title: "Missing image fallback",
    description: 'Fox placeholder; original character ID remains "future-mascot-demo".',
    characterId: "future-mascot-demo",
    art: MISSING_ART,
    mirrored: false,
  },
] as const;

export default function CharacterArtReview() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        padding: "32px 24px",
        boxSizing: "border-box",
        color: "#fff1d2",
        background: "#10231f",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <style>{`.character-art-review__sprite { display: block; width: 180px; height: 240px; }`}</style>
      <a href="?table-preview" target="_top" style={{ color: "#83e5be" }}>
        Back to Table B
      </a>
      <h1 style={{ margin: "28px 0 12px", fontSize: 28 }}>Character art review</h1>
      <p style={{ maxWidth: 720, lineHeight: 1.6, color: "#c1d1c5" }}>
        These examples use the reusable character sprite. The first two load a local SVG image with
        deliberate transparent padding and normalized bounds. The third requests a missing image to
        demonstrate the placeholder fallback without changing character identity.
      </p>
      <div
        style={{ display: "flex", flexWrap: "wrap", alignItems: "stretch", gap: 20, marginTop: 28 }}
      >
        {EXAMPLES.map((example) => (
          <figure
            key={example.id}
            data-art-example={example.id}
            style={{
              margin: 0,
              width: 240,
              padding: 20,
              boxSizing: "border-box",
              background: "#19362d",
              border: "1px solid #526b5d",
              borderRadius: 12,
            }}
          >
            <div style={{ width: 180, margin: "0 auto 20px", outline: "1px dashed #789b8d" }}>
              <CharacterSprite
                characterId={example.characterId}
                view="front"
                art={example.art}
                mirrored={example.mirrored}
                className="character-art-review__sprite"
              />
            </div>
            <figcaption>
              <strong>{example.title}</strong>
              <p style={{ fontSize: 13, lineHeight: 1.5, color: "#c1d1c5" }}>
                {example.description}
              </p>
            </figcaption>
          </figure>
        ))}
      </div>
    </main>
  );
}
