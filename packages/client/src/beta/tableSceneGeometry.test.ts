import { describe, expect, it } from "vitest";
import {
  SCENE_COUNTS,
  sceneSeatOrder,
  tableSceneGeometry,
  type SceneRect,
} from "./tableSceneGeometry.js";
const overlaps = (a: SceneRect, b: SceneRect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
describe("table scene identity", () => {
  it("rotates display order without rotating authoritative last-seat ownership", () => {
    const order = ["a", "b", "c", "d", "e"];
    expect(sceneSeatOrder(order, "d")).toEqual(["d", "e", "a", "b", "c"]);
    expect(order).toEqual(["a", "b", "c", "d", "e"]);
    expect(sceneSeatOrder(order, "e")[0]).toBe(order.at(-1));
    expect(sceneSeatOrder(order, "disconnected")).toEqual(order);
    expect(sceneSeatOrder(order)).toEqual(order);
  });
  it("refuses incomplete or ambiguous seat orders", () => {
    expect(() => sceneSeatOrder([])).toThrow();
    expect(() => sceneSeatOrder(["a", "a"])).toThrow();
    expect(() => sceneSeatOrder(Array.from({ length: 9 }, (_, i) => String(i)))).toThrow();
  });
});
describe("table scene geometry", () => {
  it("keeps near-name targets outside the live dice touch corridor on the narrow phone", () => {
    const { seats } = tableSceneGeometry(8, 320, 474);
    // Real tray fixture: five 44px touch areas, including held-die lift.
    const left = seats.find((s) => s.slot === "left-near")!.name;
    const right = seats.find((s) => s.slot === "right-near")!.name;
    expect(left.width).toBeGreaterThanOrEqual(44);
    expect(right.width).toBeGreaterThanOrEqual(44);
    expect(left.x + left.width).toBeLessThanOrEqual(46);
    expect(right.x).toBeGreaterThanOrEqual(274);
  });
  for (const [w, h] of [
    [320, 474],
    [360, 546],
    [390, 736],
    // Tablet portrait. Added for Table F: the plan's verification list asks for
    // a tablet size and every other check ran without one.
    [768, 940],
    [844, 314],
    [1120, 708],
  ])
    for (const count of SCENE_COUNTS) {
      it(`${count} seats fit ${w}×${h} without colliding scores`, () => {
        const layout = tableSceneGeometry(count, w, h);
        expect(layout.seats).toHaveLength(count);
        expect(new Set(layout.seats.map((s) => s.slot)).size).toBe(count);
        expect(layout.seats[0].view).toBe("back");
        expect(layout.seats.filter((s) => s.view === "front")).toHaveLength(
          count % 2 === 0 ? 1 : 2,
        );
        for (const [i, seat] of layout.seats.entries()) {
          expect(seat.mirrored).toBe(seat.slot.startsWith("left-"));
          for (const r of [seat.name, seat.score, seat.flag]) {
            expect(r.x).toBeGreaterThanOrEqual(0);
            expect(r.y).toBeGreaterThanOrEqual(0);
            expect(r.x + r.width).toBeLessThanOrEqual(w + 0.01);
            expect(r.y + r.height).toBeLessThanOrEqual(h + 0.01);
          }
          expect(seat.name.height).toBeGreaterThanOrEqual(44);
          for (const other of layout.seats.slice(i + 1)) {
            expect(overlaps(seat.score, other.score)).toBe(false);
            // Names are buttons — they open player details — so two of them
            // sharing pixels is a hit-target conflict, not just a visual one.
            // (Scores are inert text and are allowed to share a box edge with a
            // name: the rendered glyphs are far narrower than the centred box.)
            expect(overlaps(seat.name, other.name)).toBe(false);
          }
          expect(overlaps(seat.flag, seat.score)).toBe(false);
        }
        expect(layout.dieEdge).toBeLessThanOrEqual(46);
        const diceY =
          h * (layout.mode === "short-wide" ? 0.65 : layout.mode === "wide" ? 0.66 : 0.68);
        const touchEdge = Math.max(44, layout.dieEdge);
        const targets = Array.from({ length: 5 }, (_, die) => ({
          x: w / 2 + (die - 2) * layout.diePitch - touchEdge / 2,
          y: diceY - touchEdge / 2,
          width: touchEdge,
          height: touchEdge,
        }));
        for (const [i, target] of targets.entries()) {
          expect(target.x).toBeGreaterThanOrEqual(0);
          expect(target.x + target.width).toBeLessThanOrEqual(w);
          for (const other of targets.slice(i + 1)) {
            expect(overlaps(target, other)).toBe(false);
          }
          for (const seat of layout.seats) {
            expect(overlaps(target, seat.name)).toBe(false);
            expect(overlaps({ ...target, y: target.y - 9 }, seat.name)).toBe(false);
            expect(overlaps(target, seat.score)).toBe(false);
            expect(overlaps({ ...target, y: target.y - 9 }, seat.score)).toBe(false);
          }
        }
      });
    }
});
