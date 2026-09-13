import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { hasUnreadRelease, LATEST_VERSION, markReleaseSeen, RELEASES } from "./changelog.js";
import { recordGame, type GameSummary } from "./profile.js";

/**
 * The update log is a claim about what the running build contains, so the thing
 * worth checking is that it still agrees with the build: a release note added
 * without bumping the version (or the other way round) shows players a version
 * number the home screen doesn't recognise.
 */
const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../package.json", import.meta.url)), "utf8"),
) as { version: string };

const parts = (v: string) => v.split(".").map(Number);

describe("update log", () => {
  it("opens on the version the game is actually running", () => {
    expect(RELEASES[0].version).toBe(pkg.version);
  });

  it("lists releases newest first", () => {
    // Compare on the FIRST part that differs and stop there, the way version
    // numbers actually order. The old predicate asked whether any part was
    // greater and no part was lesser, which quietly held only while every
    // release was a patch bump: the first minor bump, 0.7.0 after 0.6.4, has a
    // patch that goes DOWN (0 after 4) and was read as going backwards.
    for (let i = 1; i < RELEASES.length; i++) {
      const [a, b] = [parts(RELEASES[i - 1].version), parts(RELEASES[i].version)];
      const at = a.findIndex((n, k) => n !== b[k]);
      const newer = at >= 0 && a[at] > b[at];
      expect(newer, `${RELEASES[i - 1].version} should be newer than ${RELEASES[i].version}`).toBe(
        true,
      );
    }
  });

  it("gives every release a version, a real date and something to say", () => {
    for (const r of RELEASES) {
      expect(r.version, "version").toMatch(/^\d+\.\d+\.\d+$/);
      expect(r.date, `date of ${r.version}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(r.date)), `date of ${r.version} parses`).toBe(false);
      expect(r.notes.length, `notes of ${r.version}`).toBeGreaterThan(0);
      for (const note of r.notes) expect(note.trim().length).toBeGreaterThan(0);
    }
  });

  it("does not list the same version twice", () => {
    const seen = RELEASES.map((r) => r.version);
    expect(new Set(seen).size).toBe(seen.length);
  });
});

// Minimal in-memory localStorage, so a "device" is a fresh object per test.
class MemStore {
  private store = new Map<string, string>();
  getItem(k: string) {
    return this.store.has(k) ? this.store.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.store.set(k, String(v));
  }
  removeItem(k: string) {
    this.store.delete(k);
  }
  clear() {
    this.store.clear();
  }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemStore }).localStorage = new MemStore();
});

/** Give this device a history, which is what tells a returning player from a
 *  brand-new one when there is no seen-version record at all. */
function havePlayed() {
  recordGame({
    won: true,
    finalTotal: 3000,
    goal: 3000,
    bestTurn: 400,
    banks: 5,
    busts: 1,
    hotDice: 0,
    turns: 6,
    bankedPoints: 3000,
    opponents: 1,
    maxDeficit: 0,
    bestHotStreak: 0,
  } satisfies GameSummary);
}

describe("flagging an unread release", () => {
  it("lights up for a player who has played but not read this one", () => {
    havePlayed();
    expect(hasUnreadRelease()).toBe(true);
  });

  it("stays lit until the log is actually opened", () => {
    havePlayed();
    // Drawing the home screen twice is not reading the notes.
    expect(hasUnreadRelease()).toBe(true);
    expect(hasUnreadRelease()).toBe(true);
  });

  it("goes out once, and does not come back for the same release", () => {
    havePlayed();
    markReleaseSeen();
    expect(hasUnreadRelease()).toBe(false);
    // The whole point: no pulse on every subsequent launch.
    expect(hasUnreadRelease()).toBe(false);
  });

  it("comes back when a newer release ships", () => {
    havePlayed();
    markReleaseSeen();
    expect(hasUnreadRelease()).toBe(false);
    // What a deploy looks like from here: the build moved on, this device's
    // record didn't.
    markReleaseSeen("0.0.1-older");
    expect(hasUnreadRelease()).toBe(true);
  });

  it("leaves a brand-new install alone, and keeps it that way", () => {
    // Nothing about the game is old news to someone opening it for the first
    // time, so there is nothing to announce.
    expect(hasUnreadRelease()).toBe(false);
    havePlayed();
    // Still quiet after their first game: the record was seeded on that first
    // look, so this release stays read.
    expect(hasUnreadRelease()).toBe(false);
  });

  it("survives storage being unavailable", () => {
    const boom = {
      getItem() {
        throw new Error("denied");
      },
      setItem() {
        throw new Error("denied");
      },
      removeItem() {
        throw new Error("denied");
      },
    };
    (globalThis as unknown as { localStorage: unknown }).localStorage = boom;
    expect(() => hasUnreadRelease()).not.toThrow();
    expect(() => markReleaseSeen()).not.toThrow();
  });

  it("tracks the version the log actually opens on", () => {
    expect(LATEST_VERSION).toBe(RELEASES[0].version);
  });
});
