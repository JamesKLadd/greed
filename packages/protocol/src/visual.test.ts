import { describe, expect, it } from "vitest";
import { cleanBetaIdentity, cleanBetaLook } from "./visual.js";
describe("versioned presentation compatibility", () => {
  it("ignores missing and unsupported versions without throwing", () => {
    for (const raw of [undefined, null, [], "bad", { version: 2 }])
      expect(cleanBetaLook(raw)).toBeUndefined();
  });
  it("bounds all client-controlled fields and removes extra properties", () => {
    const look = cleanBetaLook({
      version: 1,
      mascot: "cat",
      frame: "future",
      background: null,
      nameplate: {},
      badge: "x".repeat(10000),
      dice: "url(evil)",
      points: 10000,
    });
    expect(look).toEqual({
      version: 1,
      mascot: "cat",
      frame: "brass",
      background: "felt",
      nameplate: "classic",
      hat: "none",
      badge: "",
      dice: "ivory",
    });
    expect(cleanBetaIdentity({ ...look, dice: "circuit" })).not.toHaveProperty("dice");
  });
  it("keeps a known hat and sends anything else out bare-headed", () => {
    const base = { version: 1, mascot: "fox" };
    expect(cleanBetaIdentity({ ...base, hat: "witch-hat" })?.hat).toBe("witch-hat");
    expect(cleanBetaIdentity({ ...base, hat: "crown-of-thorns" })?.hat).toBe("none");
    // An identity from before hats existed, or from an older client.
    expect(cleanBetaIdentity(base)?.hat).toBe("none");
  });
});
