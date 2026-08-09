import { afterEach, describe, expect, it } from "vitest";
import { initials, seatColor, setColorblindPalette } from "./theme.js";

afterEach(() => setColorblindPalette(false));

describe("seatColor", () => {
  it("is stable per index and wraps around", () => {
    expect(seatColor(0)).toBe(seatColor(0));
    expect(seatColor(0)).toBe(seatColor(8)); // palette length is 8
    expect(seatColor(0)).not.toBe(seatColor(1));
  });

  it("switches to the colorblind-safe palette when enabled", () => {
    const normal = seatColor(0);
    setColorblindPalette(true);
    expect(seatColor(0)).not.toBe(normal);
  });

  it("stays legible on the cream card stock seats are printed on", () => {
    // Seat colours are used as avatar rings, names and progress fills on
    // --paper-1. They were originally picked for dark-green felt, where light
    // values were required — exactly the values that vanish on a light surface.
    // Assert the contrast property rather than specific hexes so the palette can
    // be retuned without breaking, but never back to unreadable.
    for (const colorblind of [false, true]) {
      setColorblindPalette(colorblind);
      for (let i = 0; i < 8; i++) {
        const ratio = contrast(seatColor(i), PAPER_1);
        expect(ratio, `seat ${i} (colorblind=${colorblind}) on cream`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

/** --paper-1 in styles/tokens.css: the surface seat colours are drawn on. */
const PAPER_1 = "#f8f1e2";

function relativeLuminance(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = channel((n >> 16) & 255);
  const g = channel((n >> 8) & 255);
  const b = channel(n & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colours. */
function contrast(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe("initials", () => {
  it("uses one letter for a single word and two for multiple", () => {
    expect(initials("You")).toBe("Y");
    expect(initials("Robo 1")).toBe("R1");
    expect(initials("Alice Smith")).toBe("AS");
    expect(initials("")).toBe("?");
  });
});
