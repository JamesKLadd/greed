import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CharacterSprite } from "./CharacterSprite.js";
import {
  CHARACTER_ART_MANIFEST,
  CHARACTER_KINDS,
  CHARACTER_VIEWS,
  DEFAULT_CHARACTER_ART,
  getArtPlacement,
  getCharacterArt,
  isCharacterArt,
  type CharacterArt,
} from "./manifest.js";

describe("character art manifest", () => {
  it("provides every beta character and view with valid metadata", () => {
    expect(CHARACTER_KINDS).toHaveLength(6);
    for (const kind of CHARACTER_KINDS) {
      for (const view of CHARACTER_VIEWS) {
        expect(isCharacterArt(CHARACTER_ART_MANIFEST[kind][view])).toBe(true);
      }
    }
    expect(getArtPlacement(DEFAULT_CHARACTER_ART, { width: 180, height: 240 })).toEqual({
      x: 0,
      y: 0,
      width: 180,
      height: 240,
    });
  });

  it("places identical visible art equally despite different source padding", () => {
    const paddedArt: CharacterArt = {
      anchor: { x: 0.6, y: 0.6 },
      visibleBounds: { x: 0.3, y: 0.3, width: 0.6, height: 0.6 },
    };
    const plain = getArtPlacement(DEFAULT_CHARACTER_ART, { width: 180, height: 240 })!;
    const padded = getArtPlacement(paddedArt, { width: 300, height: 400 })!;
    expect(padded.x + padded.width * paddedArt.visibleBounds.x).toBeCloseTo(plain.x);
    expect(padded.y + padded.height * paddedArt.visibleBounds.y).toBeCloseTo(plain.y);
    expect(padded.width * paddedArt.visibleBounds.width).toBeCloseTo(plain.width);
    expect(padded.height * paddedArt.visibleBounds.height).toBeCloseTo(plain.height);
    expect(padded.x + padded.width * paddedArt.anchor.x).toBeCloseTo(90);
    expect(padded.y + padded.height * paddedArt.anchor.y).toBeCloseTo(120);
  });

  it("keeps an off-center anchor fixed and the visible silhouette inside the canvas", () => {
    const art: CharacterArt = {
      anchor: { x: 0.35, y: 0.7 },
      visibleBounds: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
    };
    const placed = getArtPlacement(art, { width: 500, height: 1000 })!;
    expect(placed.width / placed.height).toBeCloseTo(0.5);
    expect(placed.x + placed.width * art.anchor.x).toBeCloseTo(90);
    expect(placed.y + placed.height * art.anchor.y).toBeCloseTo(120);
    expect(placed.x + placed.width * art.visibleBounds.x).toBeGreaterThanOrEqual(-1e-8);
    expect(placed.y + placed.height * art.visibleBounds.y).toBeGreaterThanOrEqual(-1e-8);
    expect(placed.x + placed.width * 0.9).toBeLessThanOrEqual(180 + 1e-8);
    expect(placed.y + placed.height * 0.9).toBeLessThanOrEqual(240 + 1e-8);
  });

  it("rejects malformed art metadata and impossible source dimensions", () => {
    for (const art of [
      null,
      {},
      { ...DEFAULT_CHARACTER_ART, src: "" },
      { ...DEFAULT_CHARACTER_ART, anchor: { x: NaN, y: 0.5 } },
      { ...DEFAULT_CHARACTER_ART, visibleBounds: { x: 0, y: 0, width: 0, height: 1 } },
      { ...DEFAULT_CHARACTER_ART, visibleBounds: { x: 0.8, y: 0, width: 0.8, height: 1 } },
      { ...DEFAULT_CHARACTER_ART, visibleBounds: { x: 0.7, y: 0, width: 0.2, height: 1 } },
    ]) {
      expect(isCharacterArt(art)).toBe(false);
    }
    expect(getArtPlacement(DEFAULT_CHARACTER_ART, { width: 0, height: 240 })).toBeNull();
    expect(getArtPlacement(DEFAULT_CHARACTER_ART, { width: Infinity, height: 240 })).toBeNull();
  });

  it("falls back for unknown IDs while retaining the original identity and requested view", () => {
    for (const characterId of ["future-mascot", "__proto__", undefined]) {
      expect(getCharacterArt(characterId, "back")).toBe(CHARACTER_ART_MANIFEST.fox.back);
      const html = renderToStaticMarkup(
        createElement(CharacterSprite, { characterId, view: "back", mirrored: true }),
      );
      expect(html).toContain(`data-character-id="${characterId ?? ""}"`);
      expect(html).toContain('data-view="back"');
      expect(html).toContain('<g transform="translate(180 0) scale(-1 1)">');
      expect(html).toContain('data-art-source="placeholder"');
    }
  });
});
