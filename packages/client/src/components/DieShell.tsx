import { useId, type ReactNode } from "react";
import type { DieShape } from "../game/cosmetics.js";

/**
 * The bodies of the holiday dice: a jack-o'-lantern, a glass tree ornament, a
 * beach ball, a mirror ball, a candy heart, a pot of gold, an acorn and the
 * advent calendar's gift box, each drawn in a 100 × 100 box that maps onto the square a cube
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
/** Null panels are painted in the skin's colour; see the art below. */
const PANEL_COLOURS = ["#e8392f", null, "#2f7be0", null, "#ffc52e", null];
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
        {/* The "white" panels are the skin's own colour: white on the beach
            ball, gold on the trophy one. Dice skins may set only their die and
            scoring colours (styles.contract.test), so the gold has to come
            from there rather than from a panel colour of its own. */}
        <linearGradient id={`${uid}-white`} x1="0" y1="0" x2="0.4" y2="1">
          <SkinStops />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${uid}-ball)`}>
        <circle {...BALL} fill={`url(#${uid}-white)`} />
        {BEACH_PANELS.map((p, i) => (
          <path
            key={i}
            d={p.d}
            fill={p.fill ?? `url(#${uid}-white)`}
            stroke="#0b1d3a"
            strokeOpacity="0.16"
            strokeWidth="0.8"
          />
        ))}
        <path
          d={BEACH_CAP}
          fill={`url(#${uid}-white)`}
          stroke="#0b1d3a"
          strokeOpacity="0.2"
          strokeWidth="0.8"
        />
        <circle {...BALL} fill={`url(#${uid}-shade)`} />
      </g>
    </>
  ),
});

// -------------------------------------------------------------- disco ball
// A mirror ball on a short chain: the sphere sits low like the ornament, and
// its facets are the latitude lines and meridians of the same sphere seen
// head on. The body is the skin's colour, so the trophy ball is gold.

const DISCO = { cx: 50, cy: 57, r: 40 };
const DISCO_CAP = "M43.5 13.5 L56.5 13.5 L55.5 19.5 Q50 21 44.5 19.5 Z";
const DISCO_LATITUDES = [-60, -40, -20, 0, 20, 40, 60].map((deg) => {
  const a = (deg * Math.PI) / 180;
  const y = DISCO.cy + DISCO.r * Math.sin(a);
  const half = DISCO.r * Math.cos(a);
  return { y, x1: DISCO.cx - half, x2: DISCO.cx + half };
});
const DISCO_MERIDIANS = [18, 36, 54, 72].map((deg) => DISCO.r * Math.sin((deg * Math.PI) / 180));
/** A few facets catching the light, and a few turned away from it. */
const DISCO_GLINTS = [
  [30, 37],
  [38, 29],
  [24, 48],
  [46, 41],
  [34, 55],
];
const DISCO_SHADOWS = [
  [66, 76],
  [74, 66],
  [58, 86],
  [78, 54],
];

const discoBall: Shell = (uid) => ({
  silhouette: (
    <>
      <circle {...DISCO} />
      <path d={DISCO_CAP} />
      <circle className="die__shell-loop" cx="50" cy="7.5" r="4" />
    </>
  ),
  art: (
    <>
      <defs>
        <radialGradient id={`${uid}-mirror`} cx="0.36" cy="0.3" r="0.8">
          <SkinStops />
        </radialGradient>
        <clipPath id={`${uid}-disco`}>
          <circle {...DISCO} />
        </clipPath>
      </defs>
      <circle {...DISCO} fill={`url(#${uid}-mirror)`} />
      <g clipPath={`url(#${uid}-disco)`}>
        {DISCO_GLINTS.map(([x, y], i) => (
          <rect key={`g${i}`} x={x} y={y} width="7" height="6" fill="#fff" opacity="0.45" />
        ))}
        {DISCO_SHADOWS.map(([x, y], i) => (
          <rect key={`s${i}`} x={x} y={y} width="7" height="6" fill="#0d1020" opacity="0.22" />
        ))}
        <g stroke="#1b1f2e" strokeOpacity="0.32" strokeWidth="0.9" fill="none">
          {DISCO_LATITUDES.map((l, i) => (
            <line key={`l${i}`} x1={l.x1} x2={l.x2} y1={l.y} y2={l.y} />
          ))}
          <line x1={DISCO.cx} x2={DISCO.cx} y1={DISCO.cy - DISCO.r} y2={DISCO.cy + DISCO.r} />
          {DISCO_MERIDIANS.map((rx, i) => (
            <ellipse key={`m${i}`} cx={DISCO.cx} cy={DISCO.cy} rx={rx} ry={DISCO.r} />
          ))}
        </g>
      </g>
      {/* A four-point sparkle on the lit side. */}
      <path
        d="M29 26 L30.6 31.4 L36 33 L30.6 34.6 L29 40 L27.4 34.6 L22 33 L27.4 31.4 Z"
        fill="#fff"
        opacity="0.9"
      />
      <path d={DISCO_CAP} fill="#c9ced8" stroke="#4a5060" strokeWidth="0.8" />
      <circle cx="50" cy="7.5" r="4" fill="none" stroke="#c9ced8" strokeWidth="2" />
    </>
  ),
});

// ------------------------------------------------------------------ heart
// A candy heart: the widest part is its top half, which is where a 3 × 3
// grid of pips sits. The dip between the lobes falls on the top-middle cell,
// which no face of a die ever uses.

const HEART =
  "M50 26 C46 14 37 7 27 7 C13 7 4 18 4 32 C4 56 30 74 50 95 C70 74 96 56 96 32 C96 18 87 7 73 7 C63 7 54 14 50 26 Z";

const heart: Shell = (uid) => ({
  silhouette: <path d={HEART} />,
  art: (
    <>
      <defs>
        <radialGradient id={`${uid}-candy`} cx="0.34" cy="0.28" r="0.85">
          <SkinStops />
        </radialGradient>
      </defs>
      <path d={HEART} fill={`url(#${uid}-candy)`} />
      {/* A pressed rim, like a sugar heart's. */}
      <path
        d={HEART}
        fill="none"
        stroke="#fff"
        strokeOpacity="0.35"
        strokeWidth="2"
        transform="translate(50 52) scale(0.88) translate(-50 -52)"
      />
      <ellipse
        cx="24"
        cy="20"
        rx="7"
        ry="4"
        fill="#fff"
        opacity="0.45"
        transform="rotate(-30 24 20)"
      />
    </>
  ),
});

// ------------------------------------------------------------- pot of gold
// An iron pot brimming with coins. The pot is the skin's colour (iron, or gold
// on the trophy pot) and carries the pips; the heap of coins stays gold either
// way, because that is what makes it a pot of gold.

const POT_BODY = "M12 44 Q9 84 30 91 L70 91 Q91 84 88 44 Z";
const POT_HEAP = "M15 42 Q20 21 50 17 Q80 21 85 42 Z";
const POT_FEET = "M24 89 L22 97 L31 97 L33 91 Z M76 89 L78 97 L69 97 L67 91 Z";
const POT_COINS = [
  [30, 31],
  [42, 24],
  [57, 23],
  [70, 31],
  [50, 33],
  [36, 38],
  [64, 38],
];

const potOfGold: Shell = (uid) => ({
  silhouette: (
    <>
      <path d={POT_HEAP} />
      <path d={POT_BODY} />
      <ellipse cx="50" cy="43" rx="41" ry="7" />
      <path d={POT_FEET} />
    </>
  ),
  art: (
    <>
      <defs>
        <radialGradient id={`${uid}-iron`} cx="0.35" cy="0.35" r="0.85">
          <SkinStops />
        </radialGradient>
        <radialGradient id={`${uid}-coin`} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fff6c4" />
          <stop offset="0.45" stopColor="#f6c533" />
          <stop offset="1" stopColor="#a8700a" />
        </radialGradient>
      </defs>
      <path d={POT_FEET} fill="#20242a" />
      <path d={POT_HEAP} fill={`url(#${uid}-coin)`} stroke="#7a4f05" strokeWidth="0.8" />
      {POT_COINS.map(([x, y], i) => (
        <g key={i}>
          <ellipse cx={x} cy={y} rx="6" ry="4.2" fill={`url(#${uid}-coin)`} stroke="#8a5a07" />
          <ellipse
            cx={x}
            cy={y}
            rx="3.4"
            ry="2.2"
            fill="none"
            stroke="#8a5a07"
            strokeOpacity="0.6"
          />
        </g>
      ))}
      <path d={POT_BODY} fill={`url(#${uid}-iron)`} />
      <ellipse
        cx="50"
        cy="43"
        rx="41"
        ry="7"
        fill="none"
        stroke={`url(#${uid}-iron)`}
        strokeWidth="5"
      />
      <ellipse cx="50" cy="43" rx="41" ry="7" fill="none" stroke="#000" strokeOpacity="0.35" />
      <path
        d="M19 52 Q19 74 30 84"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.28"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M66 20 L67.3 23.7 L71 25 L67.3 26.3 L66 30 L64.7 26.3 L61 25 L64.7 23.7 Z"
        fill="#fff"
      />
    </>
  ),
});

// ------------------------------------------------------------------ acorn
// A crosshatched cap over a smooth nut. The nut is the skin's colour and
// carries the pips, in the wide part above where it narrows to its point.

const ACORN_CAP = "M7 41 Q8 14 50 10 Q92 14 93 41 Q50 50 7 41 Z";
const ACORN_NUT = "M15 42 Q13 70 50 96 Q87 70 85 42 Z";
const ACORN_STEM = "M47 12 Q45 5 51 1.5 L55 3.5 Q51 7 53.5 12 Z";

const acorn: Shell = (uid) => ({
  silhouette: (
    <>
      <path d={ACORN_NUT} />
      <path d={ACORN_CAP} />
      <path d={ACORN_STEM} />
    </>
  ),
  art: (
    <>
      <defs>
        <radialGradient id={`${uid}-nut`} cx="0.35" cy="0.3" r="0.85">
          <SkinStops />
        </radialGradient>
        <linearGradient id={`${uid}-cap`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8a5a2e" />
          <stop offset="1" stopColor="#4f3015" />
        </linearGradient>
        <clipPath id={`${uid}-capclip`}>
          <path d={ACORN_CAP} />
        </clipPath>
      </defs>
      <path d={ACORN_NUT} fill={`url(#${uid}-nut)`} />
      <path
        d="M24 50 Q24 70 40 84"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.3"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d={ACORN_STEM} fill="#5b3a1a" stroke="#2f1d0b" strokeWidth="0.8" />
      <path d={ACORN_CAP} fill={`url(#${uid}-cap)`} />
      <g clipPath={`url(#${uid}-capclip)`} stroke="#2f1d0b" strokeOpacity="0.45" strokeWidth="1">
        {[-30, -15, 0, 15, 30, 45, 60, 75, 90, 105].map((x) => (
          <line key={`a${x}`} x1={x} y1="50" x2={x + 40} y2="8" />
        ))}
        {[10, 25, 40, 55, 70, 85, 100, 115, 130].map((x) => (
          <line key={`b${x}`} x1={x} y1="50" x2={x - 40} y2="8" />
        ))}
      </g>
      <path d={ACORN_CAP} fill="none" stroke="#2f1d0b" strokeWidth="1" />
    </>
  ),
});

// --------------------------------------------------------------- gift box
// Advent's last door: a wrapped box with a gold ribbon and bow. The paper is
// the skin's colour; the ribbon runs down the middle column of pips, which
// wear a light ring there so they still read on gold.

const GIFT_LID = "M6 25 H94 V39 H6 Z";
const GIFT_BOX = "M11 39 H89 V94 H11 Z";
const GIFT_BOW =
  "M50 25 C42 9 25 9 29 19 C32 26 43 26 50 25 Z M50 25 C58 9 75 9 71 19 C68 26 57 26 50 25 Z";

const giftBox: Shell = (uid) => ({
  silhouette: (
    <>
      <path d={GIFT_BOX} />
      <path d={GIFT_LID} />
      <path d={GIFT_BOW} />
    </>
  ),
  art: (
    <>
      <defs>
        <linearGradient id={`${uid}-paper`} x1="0" y1="0" x2="1" y2="1">
          <SkinStops />
        </linearGradient>
        <linearGradient id={`${uid}-ribbon`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#a8740c" />
          <stop offset="0.45" stopColor="#ffe08a" />
          <stop offset="1" stopColor="#b98212" />
        </linearGradient>
      </defs>
      <path d={GIFT_BOX} fill={`url(#${uid}-paper)`} />
      <path d={GIFT_BOX} fill="#000" opacity="0.12" />
      <path d={GIFT_LID} fill={`url(#${uid}-paper)`} />
      <path d="M6 39 H94" stroke="#000" strokeOpacity="0.3" strokeWidth="1.5" />
      <rect x="44.5" y="25" width="11" height="69" fill={`url(#${uid}-ribbon)`} />
      <path d={GIFT_BOW} fill={`url(#${uid}-ribbon)`} stroke="#7a5206" strokeWidth="0.8" />
      <circle cx="50" cy="24" r="4.5" fill="#f6c94f" stroke="#7a5206" strokeWidth="0.8" />
    </>
  ),
});

const SHELLS: Record<Exclude<DieShape, "cube">, Shell> = {
  pumpkin,
  ornament,
  "beach-ball": beachBall,
  "disco-ball": discoBall,
  heart,
  "pot-of-gold": potOfGold,
  acorn,
  "gift-box": giftBox,
};

/**
 * What marks a holiday die as held, in place of the check mark every other die
 * wears: a wrapped sweet on the pumpkin, a Santa hat perched on the ornament,
 * a sun over the beach ball, a party popper on the mirror ball, Cupid's arrow
 * through the heart, a shamrock on the pot of gold, a maple leaf on the acorn
 * and a sprig of holly on the gift. Same slot, same job — a shape that says "held"
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
  // A party popper mid-pop, for the mirror ball.
  "disco-ball": (
    <g stroke={CHARM_INK} strokeWidth="1" strokeLinejoin="round">
      <path d="M3 21 L9.5 8.5 L15.5 14.5 Z" fill="#f5c542" />
      <path d="M6 15.2 L11.8 19.2 M7.8 11.8 L13.6 16.6" stroke="#e8463c" strokeWidth="1.4" />
      <circle cx="17" cy="5" r="1.6" fill="#ff5fa2" />
      <circle cx="21" cy="10" r="1.4" fill="#3fc1ff" />
      <rect
        x="12.6"
        y="2"
        width="2.6"
        height="2.6"
        fill="#7cdc5b"
        transform="rotate(20 13.9 3.3)"
      />
      <rect
        x="18.6"
        y="14.4"
        width="2.4"
        height="2.4"
        fill="#ffd23f"
        transform="rotate(-25 19.8 15.6)"
      />
    </g>
  ),
  // Cupid's arrow, for the candy heart.
  heart: (
    <g stroke={CHARM_INK} strokeWidth="1" strokeLinejoin="round">
      <path d="M3.5 20.5 L18.5 5.5" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M2.2 17 L5.6 18.4 L7 21.8 L3.6 22.4 Z" fill="#fff4f6" />
      <path d="M5 14.6 L8.4 16 L9.8 19.4" fill="none" />
      <path
        d="M19.6 3 C18.4 1.6 16.2 2.2 16.4 4.2 C16.5 5.6 18 7.2 21 8.2 C22 5.2 22.6 3.2 21.6 2.2 C20.8 1.4 19.9 2 19.6 3 Z"
        fill="#ff3d6e"
      />
    </g>
  ),
  // A shamrock, for the pot of gold.
  "pot-of-gold": (
    <g stroke={CHARM_INK} strokeWidth="1" strokeLinejoin="round" fill="#3cb44b">
      <path d="M12 12 C9 9 5.5 9.5 5.5 6.5 C5.5 3.8 9 3.2 10.4 5.4 C11 3.6 13 3.2 13.6 4.8 C14.4 7 13.4 9.6 12 12 Z" />
      <path d="M12 12 C15 9 18.5 9.5 18.5 6.5 C18.5 3.8 15 3.2 13.6 5.4" fill="none" />
      <path d="M12 12 C15.2 9.4 19.6 9.6 20 12.6 C20.4 15.4 17 16.4 15.4 14.8 C15.8 16.8 14.2 18 12.8 16.8 C11.2 15.6 11.4 13.6 12 12 Z" />
      <path d="M12 12 C8.8 9.4 4.4 9.6 4 12.6 C3.6 15.4 7 16.4 8.6 14.8 C8.2 16.8 9.8 18 11.2 16.8 C12.8 15.6 12.6 13.6 12 12 Z" />
      <path
        d="M12 12 Q13 18 10.5 22.5"
        fill="none"
        stroke="#2c7a35"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </g>
  ),
  // A maple leaf turning, for the acorn.
  acorn: (
    <g stroke={CHARM_INK} strokeWidth="1" strokeLinejoin="round">
      <path
        d="M12 2 L13.6 6.4 L16.4 4.8 L15.8 9 L20.6 7.6 L18.8 11.4 L21.6 12.8 L16.6 15.4 L17.4 18 L12.8 16.6 L12.6 21.6 L11.4 21.6 L11.2 16.6 L6.6 18 L7.4 15.4 L2.4 12.8 L5.2 11.4 L3.4 7.6 L8.2 9 L7.6 4.8 L10.4 6.4 Z"
        fill="#e8742a"
      />
      <path d="M12 7 V18" stroke="#9a3f0c" strokeWidth="0.8" />
    </g>
  ),
  // A sprig of holly, for advent's gift.
  "gift-box": (
    <g stroke={CHARM_INK} strokeWidth="1" strokeLinejoin="round">
      <path
        d="M12 12 C9 8 5 9 2.5 7 C3.6 9.2 2.6 10.8 3.6 12.6 C5.4 11.8 7 13.4 9 12.8 C9.6 14.4 11 13.6 12 12 Z"
        fill="#2f8f4e"
      />
      <path
        d="M12 12 C15 8 19 9 21.5 7 C20.4 9.2 21.4 10.8 20.4 12.6 C18.6 11.8 17 13.4 15 12.8 C14.4 14.4 13 13.6 12 12 Z"
        fill="#2f8f4e"
      />
      <circle cx="10" cy="15" r="2.6" fill="#d7263d" />
      <circle cx="14.2" cy="15.4" r="2.6" fill="#d7263d" />
      <circle cx="12" cy="18.6" r="2.6" fill="#d7263d" />
    </g>
  ),
};
