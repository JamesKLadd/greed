/**
 * Where the seats sit around the table.
 *
 * ONE arrangement in both orientations: everybody spread evenly around the
 * rail, you at the bottom, the rest running clockwise from there. What changes
 * between a phone and a laptop is only the shape of the table they're sitting
 * at — a tall oval or a wide one.
 *
 * The thing that makes this work on a phone is that THE TABLE IS NARROWER THAN
 * THE SCREEN. Seat pods straddle the rail, half on the cloth and half off it,
 * so the empty margin either side of the table is where the pods live rather
 * than wasted space. That's what buys room for seats down both sides without
 * squeezing the dice into a slot in the middle.
 *
 * (An earlier version of this banked every opponent across the top of the oval
 * to keep the dice row full-width. It fitted, but it didn't read as a table
 * with people sitting round it, which is the whole point.)
 *
 * Slots are indexed by TURN DISTANCE from the local player: index 0 is you at
 * the bottom, index 1 is whoever plays after you, then clockwise.
 */

export interface SeatSlot {
  /** CSS `left`. */
  x: string;
  /** CSS `top`. */
  y: string;
  /** translate() x — which edge of the pod is pinned to (x, y). */
  ax: string;
  /** translate() y. */
  ay: string;
}

/**
 * Every opponent pod in portrait is the compact one — a disc over a name over a
 * score. Not a concession at eight players but the rule at all of them: on a
 * phone the corridor left for the dice is the width of the mat minus the two
 * pods straddling its rails, and a full-size pod eats enough of that to push
 * the dice onto a second row. Keeping one pod size also means the ring doesn't
 * change shape as players join.
 */
export function usesCompactSeats(landscape: boolean): boolean {
  return !landscape;
}

/**
 * Seat-ring radii, as percentages of the mat.
 *
 * Portrait's rx is under 50 so a pod centred on the ring straddles the rail
 * rather than floating clear of it, and its ry is a good deal smaller again —
 * there is margin at the SIDES of a portrait table for pods to spill into, but
 * almost none above, and the seat that plays just before you has to clear your
 * own (larger) pod at the bottom.
 */
const RING = {
  portrait: { rx: 46, ry: 32 },
  wide: { rx: 45, ry: 43 },
};

/* ------------------------------------------------------------------ metrics
 * Pod sizes, duplicated from the --pod-* custom properties in game.css.
 *
 * CSS can't import this module and this module can't read CSS, so the two are
 * kept in sync by hand — and by `tableGeometry.test.ts`, which uses these
 * numbers to prove that no two pods overlap and none escapes the mat at any
 * player count. If you change a --pod-* value in game.css, change it here too
 * or the proof is about a layout that no longer exists.
 *
 * Heights are fixed on purpose: `row()` above stacks by --pod-h, so a pod that
 * grew with its content would push itself into the pod above it.
 */
export const POD = {
  /**
   * How much of the screen the portrait table takes. The rest is margin either
   * side for the seat pods to hang into — that margin is what makes seats down
   * both sides possible at all, so it is a feature, not leftover space.
   * Mirrors `.felt[data-layout="portrait"] { width }`.
   */
  portraitFeltFraction: 0.8,
  /**
   * Smallest die the dice clamp in game.css will go down to. Only reached on a
   * 320px phone at a full table — the tightest thing we support.
   */
  minDiePx: 22,
  /** The gaps between the five dice, plus a little air either side of the row. */
  diceRowOverheadPx: 36,
  /**
   * How far the bottom seat hangs off the near rail, as a fraction of its own
   * height — you sit AT the table's edge, not on it. The stage leaves this much
   * room below the mat; see `.felt[data-layout="portrait"]` in game.css.
   */
  selfOverhang: 0.4,
  portrait: {
    compact: { minW: 62, cqw: 0.3, maxW: 92, h: 66 },
    // `h` is a MINIMUM here — the bottom pod sizes to its content (see
    // .pseat--bottom). It's the largest it gets in practice, which is what the
    // overhang assertion wants.
    self: { minW: 104, cqw: 0.42, maxW: 132, h: 80 },
  },
  wide: { w: 152, h: 92 },
} as const;

/** Beta's short-landscape CSS uses these dimensions with the same wide slots. */
export const BETA_SHORT_WIDE = { w: 100, h: 56 } as const;

/**
 * The clear width down the middle of the mat, once the pods straddling each
 * rail have taken their bite. This is what the five dice have to fit inside,
 * and it's the number the die-size clamp in game.css is derived from — see the
 * `--corridor` custom property there, which is this same arithmetic in CSS.
 */
export function diceCorridor(feltW: number): number {
  const o = POD.portrait.compact;
  const podW = clamp(o.minW, feltW * o.cqw, o.maxW);
  // A pod is centred on the ring, so it reaches (50 - rx)% + half its width in
  // from each edge.
  const bite = ((50 - RING.portrait.rx) / 100) * feltW + podW / 2;
  return feltW - 2 * bite;
}

const clamp = (lo: number, v: number, hi: number) => Math.min(Math.max(v, lo), hi);

export interface PodRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The pod rectangles a felt of this size would actually produce, in felt-box
 * pixels. A transcription of what the browser computes from `seatSlots` plus
 * the CSS above — the machinery that lets the layout be tested at all, given
 * that vitest runs in node and nothing ever renders.
 */
export function podRects(
  feltW: number,
  feltH: number,
  playerCount: number,
  landscape: boolean,
): PodRect[] {
  const size = (rel: number) => {
    if (landscape) return { w: POD.wide.w, h: POD.wide.h };
    const p = rel === 0 ? POD.portrait.self : POD.portrait.compact;
    return { w: clamp(p.minW, feltW * p.cqw, p.maxW), h: p.h };
  };

  return seatSlots(playerCount, landscape).map((slot, rel) => {
    const { w, h } = size(rel);
    return {
      x: (parseFloat(slot.x) / 100) * feltW + (parseFloat(slot.ax) / 100) * w,
      y: (parseFloat(slot.y) / 100) * feltH + (parseFloat(slot.ay) / 100) * h,
      w,
      h,
    };
  });
}

/**
 * Seat slots for a table of `playerCount`, indexed by turn distance from the
 * local player (0 = you, at the bottom).
 *
 * Even angular spacing, starting at the bottom of the ring and running
 * clockwise — the same sweep in both orientations, so turn order always reads
 * the same way round whichever way the phone is held.
 */
export function seatSlots(playerCount: number, landscape: boolean): SeatSlot[] {
  const n = Math.max(1, playerCount);
  const { rx, ry } = landscape ? RING.wide : RING.portrait;

  return Array.from({ length: n }, (_, rel) => {
    // In portrait the bottom seat comes off the ring and sits at the mat's near
    // edge instead. It's a bigger pod than the rest (it's the one you read your
    // own score off), and on the ring it would crowd the two seats either side
    // of it on a short screen. At the rail it has the whole width to itself.
    if (rel === 0 && !landscape) {
      return { x: "50%", y: "100%", ax: "-50%", ay: `${-100 * (1 - POD.selfOverhang)}%` };
    }
    const angle = Math.PI / 2 + (rel / n) * Math.PI * 2;
    return {
      x: `${50 + rx * Math.cos(angle)}%`,
      y: `${50 + ry * Math.sin(angle)}%`,
      ax: "-50%",
      ay: "-50%",
    };
  });
}
