# Table B character art

`packages/client/src/beta/characters/index.ts` exports `CharacterSprite`, the six-character `CHARACTER_ART_MANIFEST`, and their types. Fox, bear, owl, cat, frog, and panda each have `front`, `side`, and `back` entries. Each view can receive its own transparent image independently.

```tsx
import { CharacterSprite } from "../../beta/characters/index.js";

<CharacterSprite characterId="fox" view="side" mirrored className="seat-art" />;
```

The root is a decorative SVG with a `0 0 180 240` viewBox. Give it the seat's existing width and height. Its visual anchor is the center of that canvas. Mirroring affects only a group inside this SVG; names, scores, hit areas, and seat positions belong to the scene. The side placeholder faces left before mirroring. Front and back placeholders are separate views.

## Replace one view

1. Export the finished view as a transparent PNG or WebP. Include only character art and its intentional shadow. Keep text, scores, and gameplay UI out of the image. Store it under `packages/client/public/assets/characters/<kind>/<view>.webp` (or import an image from a source asset directory).
2. Measure the complete source dimensions and the rectangle around visible pixels, including any shadow you want to preserve. Pick the point in that image that should align with the seat's existing canvas center. This point must be inside the visible rectangle.
3. Divide horizontal measurements by the source width and vertical measurements by the source height. Record `anchor: { x, y }` and `visibleBounds: { x, y, width, height }` as fractions between 0 and 1. Bounds are relative to the entire source file, including transparent padding.
4. In `packages/client/src/beta/characters/manifest.ts`, replace just the relevant entry with the image URL and metadata. Leave the other entries on `DEFAULT_CHARACTER_ART` until their images are ready.

For example, a 600 × 800 file whose visible rectangle starts at (180, 240) and measures 360 × 480, with its anchor at (360, 480), becomes:

```ts
fox: {
  front: {
    src: "/assets/characters/fox/front.webp",
    anchor: { x: 0.6, y: 0.6 },
    visibleBounds: { x: 0.3, y: 0.3, width: 0.6, height: 0.6 },
  },
  side: DEFAULT_CHARACTER_ART,
  back: DEFAULT_CHARACTER_ART,
},
```

The sprite reads the actual image dimensions after loading. It scales uniformly to fit the visible rectangle into the 180 × 240 canvas while placing the specified anchor at (90, 120). Transparent padding can extend outside the canvas, but the declared visible rectangle stays inside. Off-center anchors can leave extra room on one side; this preserves the anchor and prevents clipping rather than stretching the drawing. Mirroring then happens around the canvas center, so the anchor does not move.

Default SVG metadata intentionally represents the full original 180 × 240 canvas with an anchor of (0.5, 0.5). This keeps the approved placeholder scale and center alignment unchanged. When replacing it, judge the visible silhouette against the placeholder and include intentional breathing room in your declared bounds if needed. Never retune seat positions just to compensate for image padding.

## Review without changing the manifest

The optional `art` prop replaces only the supplied sprite's selected view and supports a local image review:

```tsx
import { CharacterSprite, type CharacterArt } from "../../beta/characters/index.js";

const foxFrontReview: CharacterArt = {
  src: "/assets/characters/fox/front.webp",
  anchor: { x: 0.6, y: 0.6 },
  visibleBounds: { x: 0.3, y: 0.3, width: 0.6, height: 0.6 },
};

<CharacterSprite characterId="fox" view="front" art={foxFrontReview} />;
```

Review front, back, and side views at the scene's smallest and largest seats. Check side views in both mirror directions. To test failure behavior, supply an unavailable URL: the matching SVG remains visible during loading and after failure. Invalid metadata also uses that placeholder. Try an unknown ID to verify the fox artwork fallback; `data-character-id` retains the original ID, and the component never modifies player identity or appearance settings. Replacing or reviewing art requires no gameplay changes.

Run the focused metadata and placement checks with:

```sh
npx vitest run packages/client/src/beta/characters/manifest.test.ts
```
