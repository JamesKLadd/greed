import { describe, expect, it } from "vitest";
import { loadProfile } from "../game/profile.js";
import {
  APPEARANCE_KEY,
  DEFAULT_APPEARANCE,
  canEquipAppearance,
  normalizeAppearance,
  profileWithAppearance,
  readAppearance,
  resolveEquippedAppearance,
  writeAppearance,
} from "./appearance.js";
describe("production appearance", () => {
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
  it("permits the base look but requires real unlocks for catalog items and badges", () => {
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

  it.each([{ dice: "circuit" }, { dice: "volcanic" }, { table: "afterhours" }])(
    "keeps former samples previewable but rejects equipping %j",
    (sample) => {
      const look = { ...DEFAULT_APPEARANCE, ...sample };
      const p = loadProfile();
      expect(normalizeAppearance(look)).toEqual(look);
      expect(canEquipAppearance(look, p)).toBe(false);
      expect(profileWithAppearance(look, p)).toBeNull();
    },
  );

  it("uses equipped earned catalog items instead of a stale temporary session look", () => {
    const p = {
      ...loadProfile(),
      dice: "gold",
      table: "midnight",
      wins: 5,
      achievements: ["first-win", "high-roller"],
      visualBeta: {
        version: 1 as const,
        mascot: "cat",
        frame: "diamond",
        background: "stars",
        nameplate: "marquee",
        badge: "first-win",
      },
    };
    const before = structuredClone(p);
    expect(
      resolveEquippedAppearance(p, {
        ...DEFAULT_APPEARANCE,
        dice: "circuit",
        table: "afterhours",
        mascot: "bear",
      }),
    ).toEqual({ ...p.visualBeta, dice: "gold", table: "midnight" });
    expect(p).toEqual(before);
  });

  it("promotes legacy base equipment to the new base and retains the saved portrait", () => {
    const p = loadProfile();
    const previous = {
      ...DEFAULT_APPEARANCE,
      dice: "volcanic",
      table: "afterhours",
      mascot: "owl",
      frame: "neon",
      background: "sunset",
      nameplate: "ticket",
    };
    expect(resolveEquippedAppearance(p, previous)).toEqual({
      ...previous,
      dice: "house",
      table: "club",
    });
    expect(p.dice).toBe("ivory");
    expect(p.table).toBe("classic");
  });

  it("falls back safely for unknown or unequipped rewards without revoking progress", () => {
    const p = {
      ...loadProfile(),
      dice: "gold",
      table: "future-table",
      gamesPlayed: 8,
      achievements: ["first-win"],
    };
    expect(resolveEquippedAppearance(p, { ...DEFAULT_APPEARANCE, badge: "high-roller" })).toEqual(
      DEFAULT_APPEARANCE,
    );
    expect(p).toMatchObject({
      dice: "gold",
      table: "future-table",
      gamesPlayed: 8,
      achievements: ["first-win"],
    });
  });

  it("equips earned items to the existing account fields and keeps the identity schema", () => {
    const p = {
      ...loadProfile(),
      wins: 4,
      totalBankedPoints: 6000,
      avatar: "bear",
      achievements: ["first-win", "high-roller", "hat-trick"],
    };
    const look = {
      ...DEFAULT_APPEARANCE,
      dice: "gold",
      table: "royal",
      mascot: "panda",
      frame: "diamond",
      background: "stars",
      nameplate: "marquee",
      badge: "first-win",
    };
    const equipped = profileWithAppearance(look, p)!;
    expect(equipped).toEqual({
      ...p,
      dice: "gold",
      table: "royal",
      visualBeta: {
        version: 1,
        mascot: "panda",
        frame: "diamond",
        background: "stars",
        nameplate: "marquee",
        badge: "first-win",
      },
    });
    expect(resolveEquippedAppearance(equipped)).toEqual(look);
    expect(p.dice).toBe("ivory");
    expect(p.table).toBe("classic");
  });

  it("maps the free house and club selections to compatible account catalog IDs", () => {
    const p = {
      ...loadProfile(),
      dice: "gold",
      table: "royal",
      achievements: ["high-roller", "hat-trick"],
    };
    const equipped = profileWithAppearance(DEFAULT_APPEARANCE, p)!;
    expect(equipped).toMatchObject({ dice: "ivory", table: "classic" });
    expect(equipped.visualBeta).not.toHaveProperty("dice");
    expect(equipped.visualBeta).not.toHaveProperty("table");
    expect(resolveEquippedAppearance(equipped)).toEqual(DEFAULT_APPEARANCE);
  });

  it.each([
    { dice: "gold" },
    { table: "royal" },
    { badge: "first-win" },
    { dice: "future-dice" },
    { mascot: "future-mascot" },
    { frame: "future-frame" },
    { background: "future-background" },
    { nameplate: "future-nameplate" },
  ])("rejects an illegal action before constructing a persisted profile: %j", (selection) => {
    const p = loadProfile();
    expect(profileWithAppearance({ ...DEFAULT_APPEARANCE, ...selection }, p)).toBeNull();
    expect(p).toEqual(loadProfile());
  });
});
