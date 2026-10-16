import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dailyShareImage } from "./dailyShareImage.js";
import { SHARE_PALETTES } from "./seasonalShareArt.js";
import type { SeasonalTheme } from "./seasonal.js";

const { activeTheme } = vi.hoisted(() => ({ activeTheme: vi.fn<() => SeasonalTheme>() }));
vi.mock("./seasonal.js", () => ({ currentSeasonalTheme: activeTheme }));

const result = {
  day: "2026-10-15",
  date: "October 15, 2026",
  score: "2,350",
  best: "650",
  bestLabel: "Best turn",
  challengeLabel: "Daily result",
  pointsLabel: "points",
  hook: "Can you beat my score?",
};

function mockCanvas() {
  const stops: [number, string][] = [];
  const calls: { text: string; x: number; y: number; color: unknown }[] = [];
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    font: "",
    createLinearGradient: vi.fn(() => ({
      addColorStop: (at: number, color: string) => stops.push([at, color]),
    })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 20 })),
    fillText: vi.fn((text: string, x: number, y: number) =>
      calls.push({ text, x, y, color: ctx.fillStyle }),
    ),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    setLineDash: vi.fn(),
    drawImage: vi.fn(),
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx),
    toBlob: vi.fn((resolve: (blob: Blob | null) => void) =>
      resolve(new Blob(["png"], { type: "image/png" })),
    ),
  };
  vi.stubGlobal("document", { createElement: vi.fn(() => canvas) });
  // Some supported Node test runtimes provide Blob but no browser File.
  vi.stubGlobal(
    "File",
    class extends Blob {
      readonly name: string;
      constructor(parts: BlobPart[], name: string, options: FilePropertyBag) {
        super(parts, options);
        this.name = name;
      }
    },
  );
  return { ctx, canvas, stops, calls };
}

beforeEach(() => activeTheme.mockReset().mockReturnValue("classic"));
afterEach(() => vi.unstubAllGlobals());

describe("seasonal daily score images", () => {
  it("keeps the classic palette, frame and text positions without decorative drawing", async () => {
    const { ctx, canvas, calls, stops } = mockCanvas();
    const file = await dailyShareImage(result);
    expect(activeTheme).toHaveBeenCalledOnce();
    expect(stops).toEqual([
      [0, "#215b48"],
      [1, "#091c22"],
    ]);
    expect(ctx.strokeRect).toHaveBeenCalledOnce();
    expect(ctx.strokeRect).toHaveBeenCalledWith(36, 36, 1008, 1008);
    expect(ctx.save).not.toHaveBeenCalled();
    expect(calls).toEqual([
      { text: "GREED", x: 540, y: 175, color: "#f7d782" },
      { text: result.challengeLabel, x: 540, y: 244, color: "#fff4d6" },
      { text: result.date, x: 540, y: 301, color: "#fff4d6" },
      { text: result.score, x: 540, y: 670, color: "#f7d782" },
      { text: result.pointsLabel, x: 540, y: 733, color: "#fff4d6" },
      { text: "Best turn: 650", x: 540, y: 826, color: "#fff4d6" },
      { text: result.hook, x: 540, y: 922, color: "#fff4d6" },
      { text: "playgreed.vercel.app", x: 540, y: 994, color: "#fff4d6" },
    ]);
    expect([canvas.width, canvas.height]).toEqual([1080, 1080]);
    expect(file.name).toBe("greed-daily-2026-10-15.png");
    expect(file.type).toBe("image/png");
  });

  it.each(["halloween", "christmas", "summer"] as const)(
    "uses the active %s palette and ornaments without changing result text or placement",
    async (theme) => {
      activeTheme.mockReturnValue(theme);
      const { ctx, calls, stops } = mockCanvas();
      const file = await dailyShareImage(result);
      const palette = SHARE_PALETTES[theme];
      expect(stops).toEqual([
        [0, palette.from],
        [1, palette.to],
      ]);
      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.restore.mock.calls.length).toBe(ctx.save.mock.calls.length);
      expect(ctx.beginPath).toHaveBeenCalled();
      expect(calls.map(({ text, x, y }) => ({ text, x, y }))).toEqual([
        { text: "GREED", x: 540, y: 175 },
        { text: result.challengeLabel, x: 540, y: 244 },
        { text: result.date, x: 540, y: 301 },
        { text: result.score, x: 540, y: 670 },
        { text: result.pointsLabel, x: 540, y: 733 },
        { text: "Best turn: 650", x: 540, y: 826 },
        { text: result.hook, x: 540, y: 922 },
        { text: "playgreed.vercel.app", x: 540, y: 994 },
      ]);
      expect(calls.find(({ text }) => text === result.score)?.color).toBe(palette.accent);
      expect(file.name).toBe("greed-daily-2026-10-15.png");
    },
  );

  it("allows a preview theme without reading or changing the active appearance", async () => {
    const { stops } = mockCanvas();
    await dailyShareImage({ ...result, theme: "summer" });
    expect(activeTheme).not.toHaveBeenCalled();
    expect(stops).toEqual([
      [0, SHARE_PALETTES.summer.from],
      [1, SHARE_PALETTES.summer.to],
    ]);
  });

  it("still reports image export failures", async () => {
    const { canvas } = mockCanvas();
    canvas.toBlob.mockImplementation((resolve) => resolve(null));
    await expect(dailyShareImage({ ...result, theme: "christmas" })).rejects.toThrow(
      "Image export unavailable",
    );
  });
});
