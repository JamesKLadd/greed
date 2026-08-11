import { describe, expect, it } from "vitest";
import { AVATARS, FREE_AVATARS, emojiById, resolveAvatar } from "./avatars.js";
import { en } from "../i18n/catalog.js";

describe("the avatar list", () => {
  it("has unique ids", () => {
    const ids = AVATARS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique emoji, so two seats never wear the same face", () => {
    const emoji = AVATARS.map((a) => a.emoji);
    expect(new Set(emoji).size).toBe(emoji.length);
  });

  it("offers enough free faces to fill a full table", () => {
    // Eight seats, and auto-assignment only ever draws from the free pool — so
    // with fewer than eight, a full table of strangers would collide.
    expect(FREE_AVATARS.length).toBeGreaterThanOrEqual(8);
  });

  it("pairs every unlockable face with a requirement", () => {
    for (const a of AVATARS) {
      expect(Boolean(a.unlock), `${a.id}`).toBe(Boolean(a.requirement));
    }
  });

  it("has a catalog entry for every id", () => {
    // The Locker looks these up with an `as MsgKey` cast, which bypasses the
    // type system entirely — a missing entry compiles fine and renders the raw
    // key at the player. This is the only thing that catches it.
    for (const a of AVATARS) {
      expect(en, `cosmetic.${a.id}.name`).toHaveProperty(`cosmetic.${a.id}.name`);
      if (a.requirement) {
        expect(en, `cosmetic.${a.id}.req`).toHaveProperty(`cosmetic.${a.id}.req`);
      }
    }
  });
});

describe("resolveAvatar", () => {
  it("uses an explicit pick when there is one", () => {
    expect(resolveAvatar("Ana", false, "unicorn")).toBe(emojiById("unicorn"));
  });

  it("falls back to the name when the pick is unknown or absent", () => {
    // An older client (or an older server) can send an id this build doesn't
    // have. That must degrade to a face, never to a blank seat.
    expect(resolveAvatar("Ana", false, "no-such-avatar")).toBe(resolveAvatar("Ana", false));
    expect(resolveAvatar("Ana", false, "")).toBe(resolveAvatar("Ana", false));
  });

  it("is stable for a name, so a player's face doesn't change between games", () => {
    expect(resolveAvatar("Ana", false)).toBe(resolveAvatar("Ana", false));
    expect(resolveAvatar("Robo 3", true)).toBe(resolveAvatar("Robo 3", true));
  });

  it("never derives an unearned face", () => {
    const free = new Set(FREE_AVATARS.map((a) => a.emoji));
    for (const name of ["Ana", "Bo", "Cy", "Di", "Eve", "Fay", "Gus", "Hal", "", "🙂"]) {
      expect(free.has(resolveAvatar(name, false)), name).toBe(true);
    }
  });

  it("gives bots machines, so a bot never passes for a person", () => {
    const free = new Set(FREE_AVATARS.map((a) => a.emoji));
    for (let i = 0; i < 12; i++) {
      expect(free.has(resolveAvatar(`Robo ${i}`, true))).toBe(false);
    }
  });

  it("always returns something", () => {
    for (const name of ["", " ", "x", "a very long player name indeed"]) {
      for (const isBot of [false, true]) {
        expect(resolveAvatar(name, isBot)).toBeTruthy();
      }
    }
  });
});
