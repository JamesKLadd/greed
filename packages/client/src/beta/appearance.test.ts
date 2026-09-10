import { describe, expect, it } from "vitest";
import { loadProfile } from "../game/profile.js";
import {
  APPEARANCE_KEY,
  DEFAULT_APPEARANCE,
  canEquipAppearance,
  normalizeAppearance,
  readAppearance,
  writeAppearance,
} from "./appearance.js";
describe("isolated beta looks", () => {
  it("normalizes missing, corrupt and future catalog data", () => {
    expect(normalizeAppearance({ dice: "future", frame: {}, mascot: "cat" })).toEqual({
      ...DEFAULT_APPEARANCE,
      mascot: "cat",
    });
    expect(readAppearance({ getItem: () => "broken json" })).toEqual(DEFAULT_APPEARANCE);
  });
  it("writes only its own key and tolerates unavailable storage", () => {
    const data = new Map([["greed:profile", "earned progress"]]);
    writeAppearance(
      {
        setItem: (k, v) => {
          data.set(k, v);
        },
      },
      DEFAULT_APPEARANCE,
    );
    expect(data.get("greed:profile")).toBe("earned progress");
    expect(data.size).toBe(2);
    expect(data.has(APPEARANCE_KEY)).toBe(true);
    expect(() =>
      writeAppearance(
        {
          setItem: () => {
            throw Error();
          },
        },
        DEFAULT_APPEARANCE,
      ),
    ).not.toThrow();
  });
  it("permits samples but requires real unlocks for catalog items and badges", () => {
    const p = loadProfile();
    expect(canEquipAppearance(DEFAULT_APPEARANCE, p)).toBe(true);
    expect(canEquipAppearance({ ...DEFAULT_APPEARANCE, dice: "gold" }, p)).toBe(false);
    expect(canEquipAppearance({ ...DEFAULT_APPEARANCE, badge: "first-win" }, p)).toBe(false);
    expect(
      canEquipAppearance(
        { ...DEFAULT_APPEARANCE, dice: "gold", badge: "first-win" },
        { ...p, achievements: ["first-win", "high-roller"] },
      ),
    ).toBe(true);
  });
});
