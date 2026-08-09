import { describe, expect, it } from "vitest";
import {
  emptyProfile,
  mergeProfile,
  normalizeEmail,
  validateUsername,
  usernameAvailable,
  signup,
  login,
  saveProfile,
  getAccount,
  verifyEmail,
} from "./accounts.js";
import { signSession, verifySession, hashPassword, verifyPassword, hashToken } from "./auth.js";
import { accountsEnabled, query, migrate } from "./db.js";

// ---------------------------------------------------------------------------
// Pure logic — no database required (always runs, incl. CI).
// ---------------------------------------------------------------------------

describe("mergeProfile", () => {
  it("never loses cumulative progress (takes the max)", () => {
    const a = {
      ...emptyProfile(),
      wins: 10,
      gamesPlayed: 30,
      bestTurn: 900,
      totalBankedPoints: 5000,
    };
    const b = {
      ...emptyProfile(),
      wins: 2,
      gamesPlayed: 4,
      bestTurn: 1500,
      totalBankedPoints: 800,
    };
    const m = mergeProfile(a, b);
    expect(m.wins).toBe(10);
    expect(m.gamesPlayed).toBe(30);
    expect(m.bestTurn).toBe(1500); // higher wins
    expect(m.totalBankedPoints).toBe(5000);
  });

  it("unions achievements and takes the latest cosmetics", () => {
    const a = {
      ...emptyProfile(),
      achievements: ["first-win", "hot-hand"],
      dice: "ivory",
      table: "classic",
    };
    const b = {
      ...emptyProfile(),
      achievements: ["hot-hand", "veteran"],
      dice: "gold",
      table: "midnight",
    };
    const m = mergeProfile(a, b);
    expect(m.achievements.sort()).toEqual(["first-win", "hot-hand", "veteran"]);
    expect(m.dice).toBe("gold");
    expect(m.table).toBe("midnight");
  });

  it("adopts the incoming live streak", () => {
    const a = { ...emptyProfile(), currentStreak: 5 };
    const b = { ...emptyProfile(), currentStreak: 1 };
    expect(mergeProfile(a, b).currentStreak).toBe(1);
  });
});

describe("validation", () => {
  it("normalizes and validates emails", () => {
    expect(normalizeEmail("  Foo@Bar.COM ")).toBe("foo@bar.com");
    expect(() => normalizeEmail("nope")).toThrow();
    expect(() => normalizeEmail("a@b")).toThrow();
  });

  it("enforces username rules and blocks profanity", () => {
    expect(validateUsername("Player_1")).toBe("Player_1");
    expect(() => validateUsername("ab")).toThrow(); // too short
    expect(() => validateUsername("has space")).toThrow();
    expect(() => validateUsername("_leading")).toThrow(); // must start alnum
    expect(() => validateUsername("way_too_long_username_x")).toThrow();
  });
});

describe("auth primitives", () => {
  it("hashes and verifies passwords", async () => {
    const hash = await hashPassword("s3cret-password");
    expect(hash).not.toBe("s3cret-password");
    expect(await verifyPassword("s3cret-password", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("signs and verifies a session round-trip", async () => {
    const token = await signSession({ sub: "u123", username: "Ada" });
    const claims = await verifySession(token);
    expect(claims).toEqual({ sub: "u123", username: "Ada" });
    expect(await verifySession(token + "tamper")).toBeNull();
    expect(await verifySession("garbage")).toBeNull();
  });

  it("hashes single-use tokens deterministically", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });
});

// ---------------------------------------------------------------------------
// Integration — runs only when a database is configured (skipped in CI).
// ---------------------------------------------------------------------------

describe.skipIf(!accountsEnabled())("accounts (live DB)", () => {
  const rand = Math.random().toString(36).slice(2, 8);
  const email = `it_${rand}@example.com`;
  const username = `it_${rand}`;
  const cleanup: string[] = [];

  it("signs up, logs in, and syncs a profile", async () => {
    await migrate();
    const s = await signup({ email, username, password: "hunter2pass" });
    cleanup.push(s.user.id);
    expect(s.user.username).toBe(username);
    expect(s.user.emailVerified).toBe(false);

    expect(await usernameAvailable(username)).toBe(false);
    expect(await usernameAvailable(`free_${rand}`)).toBe(true);

    const byName = await login({ login: username, password: "hunter2pass" });
    expect(byName.user.id).toBe(s.user.id);
    await expect(login({ login: username, password: "nope" })).rejects.toThrow();

    await saveProfile(s.user.id, { wins: 4, bestTurn: 700, achievements: ["first-win"] });
    const merged = await saveProfile(s.user.id, {
      wins: 1,
      bestTurn: 1300,
      achievements: ["hot-hand"],
    });
    expect(merged.wins).toBe(4);
    expect(merged.bestTurn).toBe(1300);
    expect(merged.achievements.sort()).toEqual(["first-win", "hot-hand"]);

    const acc = await getAccount(s.user.id);
    expect(acc?.profile.wins).toBe(4);

    expect(await verifyEmail("not-a-real-token")).toBe(false);
  });

  it("rejects duplicate usernames case-insensitively", async () => {
    await expect(
      signup({
        email: `dupe_${rand}@x.com`,
        username: username.toUpperCase(),
        password: "hunter2pass",
      }),
    ).rejects.toThrow();
  });

  // Best-effort teardown.
  it("cleans up", async () => {
    for (const id of cleanup) await query(`DELETE FROM users WHERE id = $1`, [id]);
    await query(`DELETE FROM users WHERE lower(email) = lower($1)`, [`dupe_${rand}@x.com`]);
  });
});
