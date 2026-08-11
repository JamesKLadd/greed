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

  it("stays legible on the dark slab seat pods are made of", () => {
    // Seat colours are used as avatar rings and progress fills on --surface-2.
    // This palette has been retuned twice — once for dark felt, once for cream
    // card stock, now for a dark room — so assert the contrast PROPERTY rather
    // than specific hexes. It can be retuned again freely; it just can't go
    // back to unreadable.
    for (const colorblind of [false, true]) {
      setColorblindPalette(colorblind);
      for (let i = 0; i < 8; i++) {
        const ratio = contrast(seatColor(i), SURFACE_2);
        expect(ratio, `seat ${i} (colorblind=${colorblind}) on a pod`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

/** --surface-2 in styles/tokens.css: the surface seat colours are drawn on. */
const SURFACE_2 = "#1a202a";

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
