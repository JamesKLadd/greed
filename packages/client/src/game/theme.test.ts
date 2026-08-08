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
    const cb = seatColor(0);
    expect(cb).not.toBe(normal);
    expect(cb.toLowerCase()).toBe("#e69f00"); // Okabe–Ito orange
  });
});

describe("initials", () => {
  it("uses one letter for a single word and two for multiple", () => {
    expect(initials("You")).toBe("Y");
    expect(initials("Robo 1")).toBe("R1");
    expect(initials("Alice Smith")).toBe("AS");
    expect(initials("")).toBe("?");
  });
});
