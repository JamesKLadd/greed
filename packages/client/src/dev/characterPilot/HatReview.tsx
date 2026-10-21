import { HATS } from "@greed/protocol";
import { BetaActiveContext } from "../../beta/BetaContext.js";
import { CharacterSprite } from "../../beta/characters/CharacterSprite.js";
import { CHARACTER_KINDS } from "../../beta/characters/manifest.js";
import { Mascot } from "../../beta/Mascot.js";
import { DEFAULT_APPEARANCE } from "../../beta/appearance.js";

/**
 * Dev-only (?hat-review): every hat on every character, as a portrait and in
 * each seated view, so a hat's placement can be checked against all six heads
 * at once. The anchors live in Hats.tsx.
 */
export default function HatReview() {
  return (
    <BetaActiveContext.Provider value>
      <main style={{ padding: 16, background: "#0d1f1c", color: "#fff", fontFamily: "sans-serif" }}>
        <h1>Hats</h1>
        {HATS.map((hat) => (
          <section key={hat} style={{ marginBottom: 18 }}>
            <h2 style={{ fontSize: 14, margin: "8px 0" }}>{hat}</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end" }}>
              {CHARACTER_KINDS.map((kind) => (
                <div key={kind} style={{ display: "flex", gap: 2, alignItems: "end" }}>
                  <span style={{ display: "inline-block", width: 84, height: 84 }}>
                    <Mascot look={{ ...DEFAULT_APPEARANCE, mascot: kind, hat }} />
                  </span>
                  {(["front", "side", "back"] as const).map((view) => (
                    <CharacterSprite
                      key={view}
                      characterId={kind}
                      view={view}
                      hat={hat}
                      className="hat-review__sprite"
                    />
                  ))}
                </div>
              ))}
            </div>
          </section>
        ))}
        <style>{`.hat-review__sprite{width:72px;height:96px;overflow:visible}`}</style>
      </main>
    </BetaActiveContext.Provider>
  );
}
