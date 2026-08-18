import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RELEASES } from "./changelog.js";

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
    for (let i = 1; i < RELEASES.length; i++) {
      const [a, b] = [parts(RELEASES[i - 1].version), parts(RELEASES[i].version)];
      // Strictly descending on the first part that differs.
      const older = a.some((n, k) => n > b[k]) && !a.some((n, k) => n < b[k]);
      expect(older, `${RELEASES[i - 1].version} should be newer than ${RELEASES[i].version}`).toBe(
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
