import { describe, expect, it } from "vitest";
import {
  POD,
  BETA_SHORT_WIDE,
  diceCorridor,
  podRects,
  seatSlots,
  usesCompactSeats,
  type PodRect,
} from "./tableGeometry.js";

/**
 * The table layout is the one part of this redesign that can break silently.
 *
 * vitest runs in a node environment, so no component ever renders and no test
 * can look at the real thing — and the failure mode isn't an exception, it's
 * two seat pods quietly sitting on top of each other on a full table, on a
 * short phone, which nobody sees until a player does. `podRects()` transcribes
 * what the browser would compute so the invariants can be asserted here.
 *
 * These sizes are the ones that actually hurt: a 360px phone is the narrowest
 * device worth supporting, and the felt on it is a little under 344px wide.
 */

/* Mat sizes, not screen sizes: the portrait table is 80% of the stage (the rest
   is margin for the pods to hang into), so these are already scaled down. */
const PHONES = [
  { name: "360x640 (small Android)", screen: 344, w: 275, h: 400 },
  { name: "375x667 (iPhone SE)", screen: 359, w: 287, h: 420 },
  { name: "390x844 (iPhone 14)", screen: 374, w: 299, h: 560 },
  { name: "320x568 (smallest supported)", screen: 304, w: 243, h: 330 },
];

const WIDE = [
  { name: "laptop", w: 820, h: 513 },
  { name: "small landscape", w: 640, h: 400 },
];

const COUNTS = [2, 3, 4, 5, 6, 7, 8];

describe("beta short landscape", () => {
  for (const n of COUNTS) {
    it(`fits ${n} seats on a short landscape phone without covering the dice`, () => {
      const w = 620;
      const h = 218;
      const rects = seatSlots(n, true).map((slot) => ({
        x: (parseFloat(slot.x) / 100) * w - BETA_SHORT_WIDE.w / 2,
        y: (parseFloat(slot.y) / 100) * h - BETA_SHORT_WIDE.h / 2,
        w: BETA_SHORT_WIDE.w,
        h: BETA_SHORT_WIDE.h,
      }));
      expect(collisions(rects)).toEqual([]);
      for (const rect of rects) {
        expect(rect.x).toBeGreaterThanOrEqual(-60);
        expect(rect.x + rect.w).toBeLessThanOrEqual(w + 60);
        expect(overlaps(rect, { x: w / 2 - 120, y: h / 2 - 17, w: 240, h: 34 })).toBe(false);
      }
    });
  }
});

function overlaps(a: PodRect, b: PodRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function collisions(rects: PodRect[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (overlaps(rects[i], rects[j])) out.push(`seat ${i} overlaps seat ${j}`);
    }
  }
  return out;
}

describe("seat slots", () => {
  it("returns one slot per player, with the local player first", () => {
    for (const n of COUNTS) {
      for (const landscape of [false, true]) {
        expect(seatSlots(n, landscape), `n=${n} landscape=${landscape}`).toHaveLength(n);
      }
    }
  });

  it("seats the local player at the bottom in both layouts", () => {
    expect(seatSlots(5, false)[0].y).toBe("100%");
    expect(parseFloat(seatSlots(5, false)[0].x)).toBeCloseTo(50, 0);
    // The wide sweep starts at π/2, which is the bottom of the ring.
    expect(parseFloat(seatSlots(5, true)[0].y)).toBeCloseTo(93, 0);
  });

  it("spreads seats around the whole ring, not just the top", () => {
    // The point of the layout: at a full table there are seats down BOTH sides
    // as well as across the top, the way they'd sit at a real table.
    const ys = seatSlots(8, false).map((s) => parseFloat(s.y));
    const above = ys.filter((y) => y < 45).length;
    const middle = ys.filter((y) => y >= 45 && y <= 55).length;
    const below = ys.filter((y) => y > 55).length;
    expect(above, "seats across the top").toBeGreaterThanOrEqual(2);
    expect(middle, "seats down the sides").toBeGreaterThanOrEqual(2);
    expect(below, "seats near you").toBeGreaterThanOrEqual(2);
  });
});

describe("portrait: pods never collide", () => {
  for (const phone of PHONES) {
    for (const n of COUNTS) {
      it(`${n} players on ${phone.name}`, () => {
        expect(collisions(podRects(phone.w, phone.h, n, false))).toEqual([]);
      });
    }
  }
});

describe("portrait: pods stay on the screen", () => {
  for (const phone of PHONES) {
    for (const n of COUNTS) {
      it(`${n} players on ${phone.name}`, () => {
        const rects = podRects(phone.w, phone.h, n, false);
        // Pods deliberately overhang the mat's SIDES — that margin is what the
        // narrow table exists to create. What they must not do is run off the
        // screen, so the budget is the margin, not the mat.
        const margin = (phone.screen - phone.w) / 2;
        for (const [i, r] of rects.entries()) {
          expect(r.x, `seat ${i} runs off the left of the screen`).toBeGreaterThanOrEqual(-margin);
          expect(r.x + r.w, `seat ${i} runs off the right of the screen`).toBeLessThanOrEqual(
            phone.w + margin,
          );
        }
        // Vertically: nothing above the mat, and only the bottom seat below it,
        // by the overhang the stage leaves room for.
        for (const [i, r] of rects.entries()) {
          expect(r.y, `seat ${i} above the mat`).toBeGreaterThanOrEqual(-2);
          const allowance = i === 0 ? POD.selfOverhang * r.h : 0;
          expect(r.y + r.h, `seat ${i} below the mat`).toBeLessThanOrEqual(phone.h + allowance + 2);
        }
      });
    }
  }
});

describe("portrait: five dice still fit down the middle", () => {
  /* Seats down both sides cost the dice horizontal room, so the die size is
     derived from what's left rather than guessed. If that corridor ever gets
     too narrow, the dice wrap to a second row — the one thing the in-game
     layout must never do. */
  for (const phone of PHONES) {
    for (const n of COUNTS) {
      it(`${n} players on ${phone.name}`, () => {
        const corridor = diceCorridor(phone.w);
        const needed = 5 * POD.minDiePx + POD.diceRowOverheadPx;
        expect(corridor, "corridor between the side seats").toBeGreaterThanOrEqual(needed);
      });
    }
  }
});

describe("wide: pods never collide and stay near the mat", () => {
  for (const screen of WIDE) {
    for (const n of COUNTS) {
      it(`${n} players on ${screen.name}`, () => {
        const rects = podRects(screen.w, screen.h, n, true);
        expect(collisions(rects)).toEqual([]);
        // Wide pods deliberately straddle the rail, so they overhang the mat —
        // but never by more than half a pod, or they'd float free of the table.
        for (const [i, r] of rects.entries()) {
          expect(r.x, `seat ${i} left`).toBeGreaterThan(-POD.wide.w / 2);
          expect(r.x + r.w, `seat ${i} right`).toBeLessThan(screen.w + POD.wide.w / 2);
        }
      });
    }
  }
});

describe("compact seats", () => {
  it("are every portrait opponent, and never used in the wide layout", () => {
    expect(usesCompactSeats(false), "portrait").toBe(true);
    expect(usesCompactSeats(true), "wide").toBe(false);
  });

  it("are what keeps the dice corridor open at all", () => {
    // The arithmetic behind the rule: a full-size pod on each rail leaves a
    // corridor too narrow for five dice on the smallest mat we support; the
    // compact one doesn't.
    const felt = PHONES[3].w;
    const needed = 5 * POD.minDiePx + POD.diceRowOverheadPx;
    const fullWidthPod = 132;
    expect(felt - 2 * (0.04 * felt + fullWidthPod / 2)).toBeLessThan(needed);
    expect(diceCorridor(felt)).toBeGreaterThanOrEqual(needed);
  });
});
