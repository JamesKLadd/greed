import { useId, type ReactNode } from "react";
import { HATS as HAT_LIST } from "@greed/protocol";
import type { CharacterKind, CharacterView } from "./manifest.js";

/**
 * Hats for the cast: each holiday's, and the advent calendar's.
 *
 * Every hat is drawn ONCE, in its own box — brim centre at the origin, 60 units
 * across, rising into negative y — and set on each character by an anchor: the
 * top of the skull, measured from the art itself (the lowest point between the
 * ears, in every view). Drawing a hat per character per view would be 66
 * drawings for eleven hats and would drift the moment a character was redrawn;
 * this is eleven drawings and one table of numbers.
 *
 * The anchors are in the seated 180 × 240 canvas, which is also the space each
 * head is drawn in. The portraits reuse those heads under a per-character
 * transform, so a portrait's hat is the front view's, under the same transform.
 */
export type HatId = Exclude<(typeof HAT_LIST)[number], "none">;
/** Every hat, without "none": the list lives in protocol, where identities are cleaned. */
export const HAT_IDS = HAT_LIST.filter((id): id is HatId => id !== "none");

export function isHatId(value: unknown): value is HatId {
  return HAT_IDS.some((id) => id === value);
}

interface Anchor {
  x: number;
  /** The top of the skull. */
  y: number;
  /** The room between the ears; the hat is drawn this wide. */
  width: number;
}

/** Back views share the front's: every head is symmetric seen from behind. */
const ANCHORS: Record<CharacterKind, { front: Anchor; side: Anchor }> = {
  fox: { front: { x: 90, y: 39, width: 52 }, side: { x: 85, y: 42, width: 42 } },
  bear: { front: { x: 90, y: 32, width: 58 }, side: { x: 81, y: 36, width: 44 } },
  owl: { front: { x: 89, y: 40, width: 54 }, side: { x: 79, y: 43, width: 42 } },
  cat: { front: { x: 91, y: 39, width: 50 }, side: { x: 84, y: 42, width: 40 } },
  frog: { front: { x: 91, y: 45, width: 40 }, side: { x: 83, y: 44, width: 34 } },
  panda: { front: { x: 91, y: 35, width: 46 }, side: { x: 85, y: 37, width: 40 } },
};

/** How a portrait reuses its head (see each *PortraitArtwork). */
const PORTRAIT: Record<CharacterKind, string> = {
  fox: "translate(-5 -4) scale(.61)",
  cat: "translate(-5 -4) scale(.61)",
  owl: "translate(-5 -4) scale(.61)",
  frog: "translate(-5 -4) scale(.61)",
  bear: "translate(-4 -4) scale(.6)",
  panda: "translate(-7 -6) scale(.63)",
};

/** How much wider than the gap between the ears a hat is drawn. */
const HAT_SCALE = 1.5;

/** A hat worn: sunk a little onto the head so it sits rather than floats. */
export function WornHat({
  hat,
  kind,
  view,
}: {
  hat: string | undefined;
  kind: CharacterKind;
  view: CharacterView;
}) {
  const uid = `hat${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  if (!isHatId(hat)) return null;
  const a = view === "side" ? ANCHORS[kind].side : ANCHORS[kind].front;
  // Wider than the gap between the ears: a hat that fitted inside it read as a
  // speck at seat size. Brims overlap the ears' inner edges, as a hat would.
  const scale = (a.width / 60) * HAT_SCALE;
  // In profile the hat leans back with the head.
  const tilt = view === "side" ? " rotate(8)" : "";
  return (
    <g
      className="worn-hat"
      data-hat={hat}
      transform={`translate(${a.x} ${a.y + 7}) scale(${scale.toFixed(3)})${tilt}`}
    >
      {HATS[hat](uid)}
    </g>
  );
}

/** The hat on a portrait: the front view's, under the portrait's own transform. */
export function PortraitHat({ hat, kind }: { hat: string | undefined; kind: CharacterKind }) {
  if (!isHatId(hat)) return null;
  return (
    <g transform={PORTRAIT[kind]}>
      <WornHat hat={hat} kind={kind} view="front" />
    </g>
  );
}

/** A hat on its own, for the locker's swatch: centred in a 100 × 100 box. */
export function HatSwatch({ hat }: { hat: HatId }) {
  const uid = `hs${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <g transform="translate(50 76) scale(1.15)">{HATS[hat](uid)}</g>
    </svg>
  );
}

const INK = "#1e1a24";
const line = { stroke: INK, strokeWidth: 2, strokeLinejoin: "round" as const };

const HATS: Record<HatId, (uid: string) => ReactNode> = {
  // New Year's: a striped cone with a pompom.
  "party-hat": (uid) => (
    <>
      <defs>
        <clipPath id={`${uid}-cone`}>
          <path d="M-17 0 L0 -44 L17 0 Z" />
        </clipPath>
      </defs>
      <path d="M-17 0 L0 -44 L17 0 Z" fill="#7b4dff" {...line} />
      <g clipPath={`url(#${uid}-cone)`}>
        {[-34, -22, -10].map((y) => (
          <path
            key={y}
            d={`M-20 ${y + 8} L20 ${y - 4} L20 ${y + 2} L-20 ${y + 14} Z`}
            fill="#ffd23f"
          />
        ))}
      </g>
      <path d="M-17 0 L0 -44 L17 0 Z" fill="none" {...line} />
      <circle cx="0" cy="-46" r="6" fill="#ff5fa2" {...line} />
      <path d="M-17 0 Q0 4 17 0" fill="none" {...line} />
    </>
  ),
  // Valentine's: a headband with two hearts on springs.
  "heart-boppers": () => (
    <>
      <path
        d="M-28 4 Q0 -14 28 4"
        fill="none"
        stroke="#e8336a"
        strokeWidth="5"
        strokeLinecap="round"
      />
      {/* Coiled springs, thick enough to read at seat size. */}
      {[-1, 1].map((side) => (
        <path
          key={side}
          transform={`scale(${side} 1)`}
          d="M10 -6 q6 -5 0 -10 q-6 -5 0 -10 q4 -3 1 -6"
          fill="none"
          stroke="#b0254f"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      ))}
      {[-11, 11].map((x) => (
        <path
          key={x}
          transform={`translate(${x} -38)`}
          d="M0 4 C-2 0 -9 -1 -9 -6 C-9 -10 -4 -12 0 -7 C4 -12 9 -10 9 -6 C9 -1 2 0 0 4 Z"
          fill="#ff3d6e"
          {...line}
        />
      ))}
    </>
  ),
  // St. Patrick's: a green top hat with a gold buckle and a shamrock.
  "leprechaun-hat": () => (
    <>
      <ellipse cx="0" cy="-2" rx="31" ry="6" fill="#1f7a3c" {...line} />
      <path d="M-18 -4 L-15 -40 L15 -40 L18 -4 Z" fill="#2a9a4c" {...line} />
      <ellipse cx="0" cy="-40" rx="15" ry="3" fill="#36b25a" {...line} />
      <path d="M-17.4 -8 L-16.6 -17 L16.6 -17 L17.4 -8 Z" fill="#1e1a24" />
      <rect x="-6" y="-17" width="12" height="9" fill="none" stroke="#f2c94c" strokeWidth="2.6" />
      <g transform="translate(10 -30)" fill="#7ee08a" stroke={INK} strokeWidth="1">
        <circle cx="-2.5" cy="-2" r="2.6" />
        <circle cx="2.5" cy="-2" r="2.6" />
        <circle cx="0" cy="2" r="2.6" />
      </g>
    </>
  ),
  // Summer: a wide straw sun hat with a ribbon and a flower.
  "sun-hat": (uid) => (
    <>
      <defs>
        <radialGradient id={`${uid}-straw`} cx="0.4" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fbe6a8" />
          <stop offset="1" stopColor="#d6aa5c" />
        </radialGradient>
      </defs>
      <ellipse cx="0" cy="-3" rx="34" ry="8" fill={`url(#${uid}-straw)`} {...line} />
      <path d="M-17 -5 Q-17 -27 0 -27 Q17 -27 17 -5 Z" fill={`url(#${uid}-straw)`} {...line} />
      <path
        d="M-17 -6 Q0 -2 17 -6 L17 -11 Q0 -7 -17 -11 Z"
        fill="#ff7a59"
        stroke={INK}
        strokeWidth="1.4"
      />
      <g transform="translate(12 -10)">
        {[0, 72, 144, 216, 288].map((r) => (
          <ellipse
            key={r}
            cx="0"
            cy="-3.6"
            rx="2.6"
            ry="3.6"
            fill="#fff"
            transform={`rotate(${r})`}
            stroke={INK}
            strokeWidth="0.8"
          />
        ))}
        <circle r="2.2" fill="#ffc52e" />
      </g>
    </>
  ),
  // Halloween: a bent witch's hat with a buckled band.
  "witch-hat": () => (
    <>
      <ellipse cx="0" cy="-2" rx="33" ry="6" fill="#3a2350" {...line} />
      <path
        d="M-17 -4 Q-8 -30 2 -44 Q8 -52 18 -50 Q8 -44 10 -28 L17 -4 Z"
        fill="#4b2d68"
        {...line}
      />
      <path
        d="M-16.4 -7 Q0 -3 16.4 -7 L15.4 -13 Q0 -9 -15.4 -13 Z"
        fill="#ff8a1f"
        stroke={INK}
        strokeWidth="1.4"
      />
      <rect
        x="-4.5"
        y="-13.5"
        width="9"
        height="7.5"
        fill="none"
        stroke="#ffd23f"
        strokeWidth="2"
      />
    </>
  ),
  // Thanksgiving: a pilgrim's black hat, square buckle front and centre.
  "pilgrim-hat": () => (
    <>
      <ellipse cx="0" cy="-2" rx="30" ry="6" fill="#26222a" {...line} />
      <path d="M-17 -4 L-13 -36 L13 -36 L17 -4 Z" fill="#332e38" {...line} />
      <ellipse cx="0" cy="-36" rx="13" ry="3" fill="#3f3945" {...line} />
      <path d="M-16.6 -7 L-15.8 -15 L15.8 -15 L16.6 -7 Z" fill="#8a6a3c" />
      <rect
        x="-6.5"
        y="-17"
        width="13"
        height="12"
        rx="1"
        fill="none"
        stroke="#f2c94c"
        strokeWidth="3"
      />
    </>
  ),
  // Christmas: Santa's hat, flopping over to one side.
  "santa-hat": () => (
    <>
      <path
        d="M-22 -8 C-20 -30 -2 -44 14 -40 C24 -37 30 -28 30 -16 L23 -14 C22 -22 18 -27 12 -26 C4 -24 18 -14 22 -8 Z"
        fill="#d7263d"
        {...line}
      />
      <rect x="-27" y="-12" width="52" height="12" rx="6" fill="#fffaf2" {...line} />
      <circle cx="28" cy="-12" r="6" fill="#fffaf2" {...line} />
    </>
  ),
  // Advent: an elf's pointed hat with a striped band and a bell.
  "elf-hat": () => (
    <>
      <path d="M-20 -6 C-12 -26 0 -46 20 -52 C14 -44 10 -30 20 -6 Z" fill="#2f9a4e" {...line} />
      <rect x="-23" y="-10" width="46" height="10" rx="3" fill="#fffaf2" {...line} />
      {[-17, -7, 3, 13].map((x) => (
        <rect key={x} x={x} y="-9" width="5" height="8" fill="#d7263d" />
      ))}
      <rect x="-23" y="-10" width="46" height="10" rx="3" fill="none" {...line} />
      <circle cx="21" cy="-52" r="4.5" fill="#f2c94c" {...line} />
    </>
  ),
  // Advent: reindeer antlers on a band.
  antlers: () => (
    <>
      <path
        d="M-28 4 Q0 -12 28 4"
        fill="none"
        stroke="#6b4423"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {[-1, 1].map((side) => (
        <g key={side} transform={`scale(${side} 1)`}>
          <path
            d="M12 -5 C14 -18 12 -28 6 -38 M13 -18 C19 -22 22 -28 22 -34 M12 -28 C16 -32 17 -38 15 -43"
            fill="none"
            stroke="#8a5a2e"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <circle cx="22" cy="-8" r="3.4" fill="#f2c94c" {...line} strokeWidth="1.4" />
        </g>
      ))}
    </>
  ),
  // Advent: a crown of holly, leaves round the head and berries at the front.
  "holly-crown": () => (
    <>
      <ellipse cx="0" cy="-4" rx="25" ry="7" fill="none" stroke="#3d6b2a" strokeWidth="3" />
      {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150, 180].map((deg) => {
        const a = (deg * Math.PI) / 180;
        const x = Math.cos(a) * 25;
        const y = -4 + Math.sin(a) * 7;
        return (
          <path
            key={deg}
            transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${deg + 90})`}
            d="M0-7 2.6-4.4 4-5 3.4-2 5 0 3.4 2 4 5 2.6 4.4 0 7-2.6 4.4-4 5-3.4 2-5 0-3.4-2-4-5-2.6-4.4Z"
            fill={deg > 0 && deg < 180 ? "#2f8f4e" : "#25713e"}
            stroke={INK}
            strokeWidth="0.8"
          />
        );
      })}
      {[-4, 0, 4].map((x, i) => (
        <circle
          key={x}
          cx={x}
          cy={i === 1 ? 1 : 3}
          r="3.2"
          fill="#d7263d"
          {...line}
          strokeWidth="1"
        />
      ))}
    </>
  ),
  // Advent: a knitted bobble hat.
  "bobble-hat": (uid) => (
    <>
      <defs>
        <clipPath id={`${uid}-dome`}>
          <path d="M-24 0 Q-24 -32 0 -32 Q24 -32 24 0 Z" />
        </clipPath>
      </defs>
      <path d="M-24 0 Q-24 -32 0 -32 Q24 -32 24 0 Z" fill="#2f6fd6" {...line} />
      <g clipPath={`url(#${uid}-dome)`}>
        <rect x="-26" y="-22" width="52" height="5" fill="#fffaf2" />
        <rect x="-26" y="-13" width="52" height="3" fill="#ffd23f" />
      </g>
      <path d="M-24 0 Q-24 -32 0 -32 Q24 -32 24 0 Z" fill="none" {...line} />
      <rect x="-26" y="-8" width="52" height="10" rx="4" fill="#2457a8" {...line} />
      {[-18, -10, -2, 6, 14].map((x) => (
        <path key={x} d={`M${x + 2} -6 v6`} stroke="#1a3f80" strokeWidth="1.6" />
      ))}
      <circle cx="0" cy="-34" r="7" fill="#fffaf2" {...line} />
    </>
  ),
};
