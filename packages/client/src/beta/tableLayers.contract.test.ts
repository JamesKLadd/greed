/**
 * Who is in front of whom at the table.
 *
 * The scene is built out of absolutely positioned pieces whose depth is decided
 * entirely by z-index, and vitest runs in node so nothing ever renders here to
 * check it. These are regex-level assertions over the stylesheet, which is the
 * only machine-checkable guard there is — and the layering has been wrong twice
 * in ways a player noticed before a test did:
 *
 *  - Seats down the SIDE of the table were drawn in front of it. The felt is a
 *    trapezoid that widens toward the viewer, so those characters' legs and feet
 *    appeared on top of the table they were supposed to be sitting at.
 *  - The viewer's own character was drawn over its own score, swallowing the
 *    "YOUR POINTS" line under the number.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("./tableScene.css", import.meta.url)), "utf8")
  // Comments out of the way first: a rule explained by one above it is still
  // the rule that follows the previous block, and leaving them in made the
  // match below silently find nothing rather than fail.
  .replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * Every z-index a selector is given, in source order.
 *
 * Source order matters: the later rule wins between two of equal specificity,
 * which is exactly how the self seat overrides the shared character depth.
 */
function depths(selector: string): number[] {
  const found: number[] = [];
  const pattern = new RegExp(
    `(^|[,{}])\\s*${selector.replace(/[.]/g, "\\$&")}\\s*\\{([^}]*)\\}`,
    "g",
  );
  for (const block of css.matchAll(pattern)) {
    const z = /(?:^|[;{\s])z-index:\s*(-?\d+)/.exec(block[2]);
    if (z) found.push(Number(z[1]));
  }
  return found;
}
const last = (selector: string): number | undefined => depths(selector).at(-1);

describe("table depth", () => {
  const surface = last(".tp-surface");

  it("gives the table itself a depth to measure everything else against", () => {
    expect(surface).toBeTypeOf("number");
  });

  it("seats every other player BEHIND the table", () => {
    // The shared rule. Far and side seats both take it; only the self seat
    // overrides it, and it is checked separately below.
    expect(last(".tp-character")).toBeLessThan(surface!);
  });

  it("never lets a per-slot or responsive rule lift a seat back in front", () => {
    // The original bug was a second rule overriding the shared one. Any rule
    // naming a character other than the viewer's own is checked, wherever in
    // the file it is — including inside the media queries.
    for (const selector of [".tp-seat--far .tp-character", ".tp-seat--side .tp-character"]) {
      for (const z of depths(selector)) {
        expect(z, selector).toBeLessThan(surface!);
      }
    }
  });

  it("puts the viewer's own character in front of the table", () => {
    // They are between the felt and the camera; that one is meant to be raised.
    expect(last(".tp-seat--self .tp-character")).toBeGreaterThan(surface!);
  });

  it("keeps the viewer's own score above their own character", () => {
    // Their head reaches into the band the score sits in and there is nowhere
    // else to put either, so the score has to win.
    expect(last(".tp-seat--self .tp-score")).toBeGreaterThan(last(".tp-seat--self .tp-character")!);
  });

  it("keeps every name and score above the table they are labelling", () => {
    for (const selector of [".tp-name", ".tp-score"]) {
      expect(last(selector), selector).toBeGreaterThan(surface!);
    }
  });
});
