import { useId, type ReactNode } from "react";
import type { DieShape } from "../game/cosmetics.js";

/**
 * The bodies of the holiday dice: a jack-o'-lantern, a glass tree ornament and
 * a beach ball, each drawn in a 100 × 100 box that maps onto the square a cube
 * die occupies. Nothing reaches outside it except the scoring ring, which is a
 * few units wide and paints without taking up space, so a shaped die sits in
 * exactly the room a cube does — the tray, the table's dice corridor and the
 * challenge panel are laid out once, for squares, and stay that way.
 *
 * Each body is three layers of the same silhouette:
 *
 *   ring  — a thick gold outline, shown only while the die is held. The cube
 *           strikes its whole face gold; a pumpkin struck gold would stop being
 *           a pumpkin, so the shape is traced instead and the die keeps its
 *           identity while still reading as held at a glance.
 *   edge  — a dark outline under the art, so the body holds its edge on every
 *           mat, and the flat fill that forced-colours mode draws instead.
 *   art   — the body itself. Its main colours come from the skin's `--die-c*`
 *           variables, so the art and a cube fallback can never disagree.
 *
 * The pips are not drawn here; Die.tsx lays them over the body with the same
 * 3 × 3 grid every die uses, in an area holiday-dice.css fits to each shape.
 */
export function DieShell({ shape }: { shape: Exclude<DieShape, "cube"> }) {
  // Gradients are referenced by id, and five dice share a page.
  const uid = `ds${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const { silhouette, art } = SHELLS[shape](uid);
  return (
    <svg className="die__shell" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <g className="die__shell-ring">{silhouette}</g>
      <g className="die__shell-edge">{silhouette}</g>
      <g className="die__shell-art">{art}</g>
    </svg>
  );
}

type Shell = (uid: string) => { silhouette: ReactNode; art: ReactNode };

/** Gradient stops painted from the skin's own colours. */
function SkinStops() {
  return (
    <>
      <stop offset="0" style={{ stopColor: "var(--die-c1)" }} />
      <stop offset="0.55" style={{ stopColor: "var(--die-c2)" }} />
      <stop offset="1" style={{ stopColor: "var(--die-c3)" }} />
    </>
  );
}

// ---------------------------------------------------------------- pumpkin
// Five overlapping lobes, drawn back to front: where a lobe overlaps the one
// behind it is a rib. Wide and squat, so the face has the most room across,
// which is where a 3 × 3 grid of pips wants it.

const LOBES = {
  outer: [
    { cx: 26, cy: 61, rx: 22, ry: 31 },
    { cx: 74, cy: 61, rx: 22, ry: 31 },
  ],
  inner: [
    { cx: 37, cy: 60, rx: 21, ry: 35 },
    { cx: 63, cy: 60, rx: 21, ry: 35 },
  ],
  centre: { cx: 50, cy: 59, rx: 18, ry: 37 },
};
const ALL_LOBES = [...LOBES.outer, ...LOBES.inner, LOBES.centre];
const STEM = "M45.5 25 C45 18 46.5 11 50.5 5.5 C52 4 55 4.6 56.5 6.2 C55 11 54.6 17 55.5 25 Z";

const pumpkin: Shell = (uid) => ({
  silhouette: (
    <>
      {ALL_LOBES.map((l, i) => (
        <ellipse key={i} {...l} />
      ))}
      <path d={STEM} />
    </>
  ),
  art: (
    <>
      <defs>
        <radialGradient id={`${uid}-lobe`} cx="0.36" cy="0.3" r="0.8">
          <SkinStops />
        </radialGradient>
        <linearGradient id={`${uid}-stem`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8aa83a" />
          <stop offset="0.55" stopColor="#56731f" />
          <stop offset="1" stopColor="#33480f" />
        </linearGradient>
      </defs>
      {LOBES.outer.map((l, i) => (
        <ellipse key={`o${i}`} {...l} fill={`url(#${uid}-lobe)`} />
      ))}
      {/* The outer lobes turn away from the light. */}
      {LOBES.outer.map((l, i) => (
        <ellipse key={`os${i}`} {...l} fill="#4a1802" opacity="0.2" />
      ))}
      {LOBES.inner.map((l, i) => (
        <ellipse
          key={`i${i}`}
          {...l}
          fill={`url(#${uid}-lobe)`}
          stroke="#7a2c05"
          strokeOpacity="0.5"
          strokeWidth="1.3"
        />
      ))}
      <ellipse
        {...LOBES.centre}
        fill={`url(#${uid}-lobe)`}
        stroke="#7a2c05"
        strokeOpacity="0.5"
        strokeWidth="1.3"
      />
      {/* Soft shine on the front lobe, kept above the face. */}
      <ellipse cx="42" cy="31" rx="3.2" ry="5.5" fill="#fff" opacity="0.38" />
      <path d={STEM} fill={`url(#${uid}-stem)`} stroke="#26360a" strokeWidth="1" />
      <path d="M49 9 C48.2 14 48.4 19 49.4 24" stroke="#2c3d0b" strokeOpacity="0.5" fill="none" />
      {/* A curl of vine and a leaf off the stem. */}
      <path
        d="M55.5 17 C61 12 69 13 68.5 19 C68.2 22.5 64 22.5 64.6 19.6"
        fill="none"
        stroke="#4b6b16"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M44.5 19 C38 16 33 18 31 22.5 C37.5 24.5 42 23.5 44.5 19 Z" fill="#5d8222" />
      <path d="M44 19.4 C39.5 20 35.5 21.3 32.2 22.4" stroke="#39540e" strokeWidth="0.7" />
    </>
  ),
});

// --------------------------------------------------------------- ornament
// A glass bauble on a crimped gold cap and hanging loop. The sphere sits low
// in the box so the cap and loop fit above it without being clipped.

const BAUBLE = { cx: 50, cy: 58, r: 40 };
const CAP = "M40.5 21 L41.5 11.5 Q50 9.6 58.5 11.5 L59.5 21 Q50 23.4 40.5 21 Z";

const ornament: Shell = (uid) => ({
  silhouette: (
    <>
      <circle {...BAUBLE} />
      <path d={CAP} />
      <circle className="die__shell-loop" cx="50" cy="6.4" r="4.3" />
    </>
  ),
  art: (
    <>
      <defs>
        <radialGradient id={`${uid}-glass`} cx="0.36" cy="0.3" r="0.78">
          <SkinStops />
        </radialGradient>
        <linearGradient id={`${uid}-gold`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8a5a12" />
          <stop offset="0.3" stopColor="#f9dc86" />
          <stop offset="0.55" stopColor="#d6a33a" />
          <stop offset="1" stopColor="#7a4c0c" />
        </linearGradient>
      </defs>
      <circle {...BAUBLE} fill={`url(#${uid}-glass)`} />
      {/* Two gilded bands, kept clear of the pips' rows. */}
      <path
        d="M27 26.5 Q50 33 73 26.5"
        fill="none"
        stroke="#f2cf72"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M25 88.5 Q50 96.5 75 88.5"
        fill="none"
        stroke="#f2cf72"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.85"
      />
      {[30, 40, 50, 60, 70].map((x) => (
        <circle
          key={x}
          cx={x}
          cy={x === 50 ? 92.5 : x === 40 || x === 60 ? 91.7 : 90.2}
          r="0.9"
          fill="#ffe9a8"
        />
      ))}
      {/* Window light along the upper limb: glass, not paint. */}
      <path
        d="M17.1 47.2 A36.5 36.5 0 0 1 34.6 24.9"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.5"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <circle cx="39.5" cy="23.8" r="1.6" fill="#fff" opacity="0.7" />
      <path d={CAP} fill={`url(#${uid}-gold)`} stroke="#5e3a07" strokeWidth="0.8" />
      {[44, 47.3, 50.6, 53.9, 57.2].map((x) => (
        <line
          key={x}
          x1={x}
          y1="12.2"
          x2={x - 0.2}
          y2="20.6"
          stroke="#6b440a"
          strokeOpacity="0.55"
          strokeWidth="0.7"
        />
      ))}
      <circle cx="50" cy="6.4" r="4.3" fill="none" stroke={`url(#${uid}-gold)`} strokeWidth="2.2" />
    </>
  ),
});

// ------------------------------------------------------------- beach ball
// Six panels meeting at a white cap, seen from slightly above with the pole
// leaning left — the angle a beach ball is always drawn from, and the one
// that tells it apart from any other striped ball at a glance. The panels are
// projected from a real sphere rather than eyeballed, so their seams curve the
// way a ball's do. Computed once, at load.

const BALL = { cx: 50, cy: 50, r: 46 };
/** Pole tipped toward the viewer, and the whole ball leaned to the left. */
const TIP = (50 * Math.PI) / 180;
const LEAN = (28 * Math.PI) / 180;
/** Angular radius of the white cap at the pole. */
const CAP_ANGLE = (16 * Math.PI) / 180;
const PANEL_COLOURS = ["#e8392f", "#ffffff", "#2f7be0", "#ffffff", "#ffc52e", "#ffffff"];
/** Turns the panels so a seam doesn't run straight down the middle of the face. */
const PANEL_PHASE = (12 * Math.PI) / 180;

/** Sphere point (latitude, longitude) → screen coordinates in the 100 box. */
function project(lat: number, lon: number): [number, number] {
  const x = Math.cos(lat) * Math.sin(lon);
  const y = Math.sin(lat);
  const z = Math.cos(lat) * Math.cos(lon);
  // Tip the north pole toward the viewer (about the x axis)...
  const ty = y * Math.cos(TIP) - z * Math.sin(TIP);
  // ...then lean it left in the picture plane.
  const u = x * Math.cos(LEAN) - ty * Math.sin(LEAN);
  const v = x * Math.sin(LEAN) + ty * Math.cos(LEAN);
  return [BALL.cx + BALL.r * u, BALL.cy - BALL.r * v];
}

/**
 * Latitude at which a meridian, followed down from the visible north pole,
 * passes behind the ball: where its depth after the tip reaches zero.
 */
function limbLatitude(lon: number): number {
  return Math.atan((-Math.cos(lon) * Math.cos(TIP)) / Math.sin(TIP));
}

function meridian(lon: number, steps = 14): [number, number][] {
  const top = Math.PI / 2 - CAP_ANGLE;
  const bottom = limbLatitude(lon);
  return Array.from({ length: steps + 1 }, (_, i) =>
    project(top + ((bottom - top) * i) / steps, lon),
  );
}

const path = (points: [number, number][]) =>
  `M${points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L")}Z`;

const BEACH_PANELS = PANEL_COLOURS.map((fill, i) => {
  const from = PANEL_PHASE + (i * Math.PI) / 3;
  const to = from + Math.PI / 3;
  // Down one seam, round the limb where the panel goes out of sight, back up
  // the other seam. The limb is traced by following each in-between meridian
  // to its own vanishing point, so the panel's edge lands on the ball's.
  const limb = Array.from({ length: 9 }, (_, k) => {
    const lon = from + ((to - from) * k) / 8;
    return project(limbLatitude(lon), lon);
  });
  return { fill, d: path([...meridian(from), ...limb, ...meridian(to).reverse()]) };
});
const BEACH_CAP = path(
  Array.from({ length: 24 }, (_, k) => project(Math.PI / 2 - CAP_ANGLE, (k * Math.PI) / 12)),
);

const beachBall: Shell = (uid) => ({
  silhouette: <circle {...BALL} />,
  art: (
    <>
      <defs>
        <radialGradient id={`${uid}-shade`} cx="0.36" cy="0.28" r="0.78">
          <stop offset="0" stopColor="#fff" stopOpacity="0.42" />
          <stop offset="0.4" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.82" stopColor="#0b1d3a" stopOpacity="0.12" />
          <stop offset="1" stopColor="#0b1d3a" stopOpacity="0.32" />
        </radialGradient>
        <clipPath id={`${uid}-ball`}>
          <circle {...BALL} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${uid}-ball)`}>
        <circle {...BALL} fill="#fff" />
        {BEACH_PANELS.map((p, i) => (
          <path
            key={i}
            d={p.d}
            fill={p.fill}
            stroke="#0b1d3a"
            strokeOpacity="0.16"
            strokeWidth="0.8"
          />
        ))}
        <path d={BEACH_CAP} fill="#fff" stroke="#0b1d3a" strokeOpacity="0.2" strokeWidth="0.8" />
        <circle {...BALL} fill={`url(#${uid}-shade)`} />
      </g>
    </>
  ),
});

const SHELLS: Record<Exclude<DieShape, "cube">, Shell> = {
  pumpkin,
  ornament,
  "beach-ball": beachBall,
};

/**
 * What marks a holiday die as held, in place of the check mark every other die
 * wears: a wrapped sweet on the pumpkin, a Santa hat perched on the ornament,
 * a sun over the beach ball. Same slot, same job — a shape that says "held"
 * without relying on colour — but in the set's own costume.
 */
export function HeldCharm({ shape }: { shape: Exclude<DieShape, "cube"> }) {
  return (
    <svg className="die__charm" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {CHARMS[shape]}
    </svg>
  );
}

const CHARM_INK = "#2a1206";

const CHARMS: Record<Exclude<DieShape, "cube">, ReactNode> = {
  // A twist-wrapped sweet, tipped at an angle like one dropped in the bag.
  pumpkin: (
    <g transform="rotate(-24 12 12)" stroke={CHARM_INK} strokeWidth="1" strokeLinejoin="round">
      <path d="M7.2 12 L1.6 7.4 L2.8 12 L1.6 16.6 Z" fill="#9b5de5" />
      <path d="M16.8 12 L22.4 7.4 L21.2 12 L22.4 16.6 Z" fill="#9b5de5" />
      <ellipse cx="12" cy="12" rx="5.6" ry="4.9" fill="#ff8a1f" />
      <path
        d="M9 8.2 Q11 12 9 15.8 M12.4 7.2 Q14.4 12 12.4 16.8"
        fill="none"
        stroke="#fff4e0"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <ellipse cx="10" cy="9.6" rx="1.5" ry="0.8" fill="#fff" opacity="0.6" stroke="none" />
    </g>
  ),
  // Red felt flopping over to the right, white fur trim and pompom.
  ornament: (
    <g stroke={CHARM_INK} strokeWidth="1" strokeLinejoin="round">
      <path
        d="M4.2 17 C4.6 10.5 8.6 4.2 14.6 4.4 C17.8 4.6 19.9 7.4 20.3 11.2 L17.6 12 C17 9.6 15.6 8.6 14.2 9.2 C12.7 10.2 14.4 14 17.6 16.6 Z"
        fill="#d7263d"
      />
      <path
        d="M6.6 9.2 C8.6 6.4 11.4 5.2 14 5.6"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.45"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      <rect x="2.6" y="15.6" width="17" height="5" rx="2.5" fill="#fffaf2" />
      <circle cx="20.1" cy="12.6" r="2.7" fill="#fffaf2" />
    </g>
  ),
  // The summer sun: a warm disc in a ring of rays.
  "beach-ball": (
    <g stroke={CHARM_INK} strokeWidth="1" strokeLinejoin="round">
      {Array.from({ length: 8 }, (_, i) => (
        <path
          key={i}
          d="M12 1.2 L13.9 5.4 L10.1 5.4 Z"
          fill="#ff9f1a"
          transform={`rotate(${i * 45} 12 12)`}
        />
      ))}
      <circle cx="12" cy="12" r="5.6" fill="#ffd23f" />
      <ellipse cx="10.2" cy="10" rx="1.8" ry="1.1" fill="#fff" opacity="0.55" stroke="none" />
    </g>
  ),
};
