import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS } from "./profile.js";
import { STEAM_ACHIEVEMENT_IDS, isDesktopShell, syncSteamAchievements } from "./steam.js";

describe("steam bridge", () => {
  it("maps every game achievement to a Steam API name", () => {
    for (const a of ACHIEVEMENTS) {
      expect(STEAM_ACHIEVEMENT_IDS[a.id], `missing Steam name for ${a.id}`).toBeTruthy();
    }
  });

  it("uses distinct, uppercase ACH_ Steam names", () => {
    const names = Object.values(STEAM_ACHIEVEMENT_IDS);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).toMatch(/^ACH_[A-Z_]+$/);
  });

  it("reports no desktop shell and no-ops under test (no Tauri global)", () => {
    expect(isDesktopShell()).toBe(false);
    // Should not throw when there is no Tauri runtime.
    expect(() => syncSteamAchievements(["first-win", "veteran"])).not.toThrow();
  });
});
