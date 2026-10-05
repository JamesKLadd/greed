/** Scene coordinates belong to display slots; player identity never does. */
export type SceneCount = 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type SceneSlot =
  | "self"
  | "far"
  | "far-left"
  | "far-right"
  | "left-far"
  | "left-mid"
  | "left-near"
  | "right-far"
  | "right-mid"
  | "right-near";
export interface SceneRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface SceneSeat {
  slot: SceneSlot;
  view: "back" | "front" | "side";
  mirrored: boolean;
  character: SceneRect;
  name: SceneRect;
  score: SceneRect;
  flag: SceneRect;
  flagAngle: number;
}
export const SCENE_COUNTS: SceneCount[] = [2, 3, 4, 5, 6, 7, 8];
const TEMPLATES: Record<SceneCount, SceneSlot[]> = {
  2: ["self", "far"],
  3: ["self", "far-left", "far-right"],
  4: ["self", "left-mid", "far", "right-mid"],
  5: ["self", "left-mid", "far-left", "far-right", "right-mid"],
  6: ["self", "left-near", "left-mid", "far", "right-mid", "right-near"],
  7: ["self", "left-near", "left-mid", "far-left", "far-right", "right-mid", "right-near"],
  8: ["self", "left-near", "left-mid", "left-far", "far", "right-far", "right-mid", "right-near"],
};
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const centered = (x: number, y: number, width: number, height: number): SceneRect => ({
  x: x - width / 2,
  y: y - height / 2,
  width,
  height,
});

export function sceneSeatOrder(order: readonly string[], perspectiveId?: string): string[] {
  if (order.length < 2 || order.length > 8 || new Set(order).size !== order.length)
    throw new Error("A table needs 2–8 unique player IDs");
  const anchor = Math.max(0, perspectiveId ? order.indexOf(perspectiveId) : 0);
  return [...order.slice(anchor), ...order.slice(0, anchor)];
}

/** Width/height are the measured scene, after header, safe areas and blank footer. */
export function tableSceneGeometry(count: SceneCount, width: number, height: number) {
  const wide = width > height * 1.1;
  const short = wide ? height < 410 : height < 610;
  const mode = wide ? (short ? "short-wide" : "wide") : short ? "short-portrait" : "portrait";
  // x, y, score x, score y, name y, flag x, flag y (percent of scene).
  const positions: Record<SceneSlot, number[]> = wide
    ? {
        self: [50, 100, 50, short ? 81 : 78.5, 98, 61, short ? 80 : 78.5],
        far: [50, 10, 50, 21, 15.5, 56.5, 21],
        "far-left": [42, 10, 42, 21, 15.5, 42, 28],
        "far-right": [58, 10, 58, 21, 15.5, 58, 28],
        "left-far": [25, 22, 38, 23.5, 30, 31, 22],
        "right-far": [75, 22, 62, 23.5, 30, 69, 22],
        "left-mid": [19, 40, 32, 42, 48, 25, 43],
        "right-mid": [81, 40, 68, 42, 48, 75, 43],
        "left-near": [13, 60, 25, 62, 69, 19, 59],
        "right-near": [87, 60, 75, 62, 69, 81, 59],
      }
    : {
        self: [50, 100, 50, short ? 80 : 79, 98, 67, short ? 80 : 79],
        far: [50, 8, 50, 20.5, 12, 50, 26],
        "far-left": [40, 8, 40, 21, 12, 40, 27.5],
        "far-right": [60, 8, 60, 21, 12, 60, 27.5],
        "left-far": [16, 20, 34, 27.5, 28, 30, 20.5],
        "right-far": [84, 20, 66, 27.5, 28, 70, 20.5],
        "left-mid": [10, 37, 27, 37, 45, 23, 44],
        "right-mid": [90, 37, 73, 37, 45, 77, 44],
        "left-near": [6, 54, 20, 58, 62, 20, 51],
        "right-near": [94, 54, 80, 58, 62, 80, 51],
      };
  const sideSize = wide
    ? short
      ? 55
      : clamp(width * 0.12, 76, 146)
    : short
      ? width * 0.22
      : clamp(width * 0.26, 76, 125);
  const farSize = wide
    ? short
      ? 60
      : clamp(width * 0.11, 72, 134)
    : short
      ? width * 0.18
      : clamp(width * 0.22, 64, 125);
  const selfSize = wide ? (short ? 87 : 160) : short ? 108 : clamp(width * 0.34, 116, 190);
  const selfBelow = wide ? (short ? 65 : 75) : short ? 52 : 36;
  const scoreWidth = wide ? (short ? 60 : 88) : Math.min(66, width * 0.205);
  const scoreHeight = wide ? (short ? 26 : 34) : 30;
  const seats: SceneSeat[] = TEMPLATES[count].map((slot) => {
    const [x, y, sx, sy, ny, fx, fy] = positions[slot];
    const view = slot === "self" ? "back" : slot.startsWith("far") ? "front" : "side";
    const size = view === "back" ? selfSize : view === "front" ? farSize : sideSize;
    const ch = (size * 4) / 3;
    const nameWidth =
      !wide && slot.endsWith("-near")
        ? 44
        : view === "front" && count % 2 === 1
          ? Math.min(64, width * 0.18)
          : Math.min(76, width * 0.22);
    const character =
      view === "back"
        ? { x: width / 2 - size / 2, y: height + selfBelow - ch, width: size, height: ch }
        : centered((width * x) / 100, (height * y) / 100, size, ch);
    const flagWidth = view === "side" ? 9 : 26;
    const flagHeight = view === "side" ? (short ? 24 : 30) : 12;
    return {
      slot,
      view,
      mirrored: slot.startsWith("left-"),
      character,
      name: centered(
        clamp((width * x) / 100, nameWidth / 2 + 2, width - nameWidth / 2 - 2),
        view === "back" ? height - 22 : (height * ny) / 100,
        nameWidth,
        44,
      ),
      score: centered(
        (width * sx) / 100,
        (height * sy) / 100,
        view === "back"
          ? 80
          : view === "front" && count % 2 === 1
            ? Math.min(scoreWidth, width * 0.18)
            : scoreWidth,
        view === "back" ? (wide && short ? 30 : 38) : scoreHeight,
      ),
      flag: centered((width * fx) / 100, (height * fy) / 100, flagWidth, flagHeight),
      flagAngle:
        view === "side"
          ? (slot.startsWith("left-") ? 1 : -1) * (wide ? (short ? 38 : 30) : 17)
          : -8,
    };
  });
  return {
    mode,
    seats,
    dieEdge: wide ? (short ? 31 : 46) : clamp(width * 0.09, 29, 39),
    // Trim empty margins on narrow phones while preserving distinct 44px targets.
    diePitch: wide ? (short ? 52 : 70) : clamp(width * 0.09 + 16, 44, 58),
    scoreFont: wide ? (short ? 15 : 22) : short ? 14 : 17,
  };
}
