import { describe, expect, it } from "vitest";
import { cleanAdventProgress, mergeAdventProgress } from "@greed/protocol";
import {
  ADVENT_DOORS,
  ADVENT_LAST_DOOR,
  adventDoorsOpened,
  adventToday,
  adventUnlocked,
  openNextDoor,
} from "./advent.js";
import { AVATARS, isUnlocked as avatarUnlocked } from "./avatars.js";
import { DICE_SKINS, TABLE_THEMES, isUnlocked } from "./cosmetics.js";
import { hatUnlocked } from "../beta/appearance.js";
import { loadProfile, type Profile } from "./profile.js";

const at = (iso: string) => new Date(iso);
const blank = (): Profile => ({ ...loadProfile(), advent: {} });

/** Finish `games` games at one moment. */
function play(p: Profile, games: number, when: Date): Profile {
  for (let i = 0; i < games; i++) p = openNextDoor(p, when)?.profile ?? p;
  return p;
}

describe("advent calendar", () => {
  it("runs December 1-24 on the Chicago calendar", () => {
    expect(adventToday(at("2026-11-30T18:00:00Z"))).toBeNull();
    expect(adventToday(at("2026-12-01T18:00:00Z"))).toEqual({ year: 2026, day: 1 });
    expect(adventToday(at("2026-12-24T18:00:00Z"))).toEqual({ year: 2026, day: 24 });
    // 03:00 UTC on the 25th is still Christmas Eve in Chicago.
    expect(adventToday(at("2026-12-25T03:00:00Z"))).toEqual({ year: 2026, day: 24 });
    expect(adventToday(at("2026-12-25T18:00:00Z"))).toBeNull();
  });

  it("opens one door per finished game, never past today's date", () => {
    const dec3 = at("2026-12-03T18:00:00Z");
    const p = play(blank(), 10, dec3);
    expect(p.advent).toEqual({ "2026": 3 });
    expect(openNextDoor(p, dec3)).toBeNull();
  });

  it("lets a late starter catch up, then a door a day", () => {
    let p = play(blank(), 30, at("2026-12-10T18:00:00Z"));
    expect(p.advent!["2026"]).toBe(10);
    p = play(p, 5, at("2026-12-11T18:00:00Z"));
    expect(p.advent!["2026"]).toBe(11);
    p = play(p, 40, at("2026-12-24T18:00:00Z"));
    expect(p.advent!["2026"]).toBe(ADVENT_LAST_DOOR);
    expect(openNextDoor(p, at("2026-12-24T19:00:00Z"))).toBeNull();
  });

  it("starts again next December, and keeps what last year's doors gave", () => {
    const last = play(blank(), 24, at("2026-12-24T18:00:00Z"));
    const next = play(last, 1, at("2027-12-01T18:00:00Z"));
    expect(next.advent).toEqual({ "2026": 24, "2027": 1 });
    expect(adventDoorsOpened(next)).toBe(24);
    expect(adventUnlocked("gift-box", next)).toBe(true);
  });

  it("puts a real item behind every door, unlocked by that door and no sooner", () => {
    expect(ADVENT_DOORS).toHaveLength(24);
    expect(new Set(ADVENT_DOORS.map((d) => d.id)).size).toBe(24);
    for (const door of ADVENT_DOORS) {
      const before = { ...blank(), advent: { "2026": door.door - 1 } };
      const after = { ...blank(), advent: { "2026": door.door } };
      const unlocked = (p: Profile) => {
        if (door.kind === "dice")
          return isUnlocked(
            DICE_SKINS.find((c) => c.id === door.id)!,
            p,
          );
        if (door.kind === "table")
          return isUnlocked(
            TABLE_THEMES.find((c) => c.id === door.id)!,
            p,
          );
        if (door.kind === "avatar")
          return avatarUnlocked(
            AVATARS.find((a) => a.id === door.id)!,
            p,
          );
        return hatUnlocked(door.id, p);
      };
      expect(unlocked(before), `${door.id} before door ${door.door}`).toBe(false);
      expect(unlocked(after), `${door.id} at door ${door.door}`).toBe(true);
    }
    // Christmas Eve is the shaped one.
    expect(DICE_SKINS.find((c) => c.id === ADVENT_DOORS[23].id)?.shape).toBe("gift-box");
  });

  it("cleans and merges per year, the higher count winning", () => {
    expect(cleanAdventProgress({ "2026": 30, "2025": -2, junk: 3, "2024": "7" })).toEqual({
      "2026": 24,
      "2025": 0,
    });
    expect(cleanAdventProgress(null)).toEqual({});
    expect(cleanAdventProgress([1, 2])).toEqual({});
    expect(mergeAdventProgress({ "2026": 7 }, { "2026": 3, "2025": 24 })).toEqual({
      "2026": 7,
      "2025": 24,
    });
  });
});
