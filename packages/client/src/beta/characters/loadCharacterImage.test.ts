import { afterEach, describe, expect, it, vi } from "vitest";
import { loadCharacterImage } from "./loadCharacterImage.js";

class ReviewImage {
  src = "";
  decoding = "";
  naturalWidth = 512;
  naturalHeight = 768;
  onload: (() => Promise<void>) | null = null;
  onerror: (() => void) | null = null;
  decode: (() => Promise<void>) | undefined = vi.fn().mockResolvedValue(undefined);
}

function imageFixture() {
  const image = new ReviewImage();
  vi.stubGlobal(
    "Image",
    vi.fn(() => image),
  );
  const ready = vi.fn();
  const cancel = loadCharacterImage("/characters/fox-side.webp", ready);
  return { image, ready, cancel };
}

describe("selected character view loading", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("waits for asynchronous decode before replacing the fallback", async () => {
    const { image, ready } = imageFixture();
    let finish: () => void = () => {};
    image.decode = () => new Promise<void>((resolve) => (finish = resolve));
    const pending = image.onload!();
    expect(image.src).toBe("/characters/fox-side.webp");
    expect(image.decoding).toBe("async");
    expect(ready).not.toHaveBeenCalled();
    finish();
    await pending;
    expect(ready).toHaveBeenCalledWith({ src: image.src, width: 512, height: 768 });
  });

  it("keeps the fallback on load errors, decode errors or empty images", async () => {
    const { image, ready } = imageFixture();
    image.onerror!();
    expect(ready).toHaveBeenLastCalledWith(null);
    image.decode = vi.fn().mockRejectedValue(new Error("invalid image"));
    await image.onload!();
    expect(ready).toHaveBeenLastCalledWith(null);
    image.decode = undefined;
    image.naturalWidth = 0;
    await image.onload!();
    expect(ready).toHaveBeenLastCalledWith(null);
    expect(ready).toHaveBeenCalledTimes(3);
  });

  it("ignores late decode completion after changing views or unmounting", async () => {
    const { image, ready, cancel } = imageFixture();
    let finish: () => void = () => {};
    image.decode = () => new Promise<void>((resolve) => (finish = resolve));
    const pending = image.onload!();
    cancel();
    finish();
    await pending;
    expect(ready).not.toHaveBeenCalled();
    expect(image.onload).toBeNull();
    expect(image.onerror).toBeNull();
  });

  it("supports browsers without decode after a successful load", async () => {
    const { image, ready } = imageFixture();
    image.decode = undefined;
    await image.onload!();
    expect(ready).toHaveBeenCalledWith({ src: image.src, width: 512, height: 768 });
  });
});
