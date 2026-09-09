/**
 * The three things a login is supposed to keep to itself.
 *
 * Each of these was measured on a running server before it was fixed: a login
 * for an address with no account answered in 2ms against 90 for one that
 * existed, signup named which field collided, and a password reset left every
 * token already issued working for the rest of its thirty days.
 */

import { describe, expect, it, vi } from "vitest";

/** A tiny stand-in for the users table, enough for sessionIsCurrent. */
const users = new Map<string, { validFrom: Date | null }>();

vi.mock("./db.js", () => ({
  accountsEnabled: () => true,
  query: async (sql: string, params: unknown[] = []) => {
    if (sql.includes("sessions_valid_from AS valid_from")) {
      const row = users.get(params[0] as string);
      return { rows: row ? [{ valid_from: row.validFrom }] : [] };
    }
    return { rows: [] };
  },
}));

const { signSession, verifySession, sessionIsCurrent, forgetSessionCurrency } =
  await import("./auth.js");

describe("a session is only as good as the account behind it", () => {
  it("stands while the account has not moved the line", async () => {
    users.set("u1", { validFrom: null });
    forgetSessionCurrency("u1");
    const claims = (await verifySession(await signSession({ sub: "u1", username: "ada" })))!;
    expect(await sessionIsCurrent(claims)).toBe(true);
  });

  it("falls the moment the account resets its password", async () => {
    users.set("u2", { validFrom: null });
    forgetSessionCurrency("u2");
    const claims = (await verifySession(await signSession({ sub: "u2", username: "bo" })))!;
    expect(await sessionIsCurrent(claims)).toBe(true);

    // The reset moves sessions_valid_from past this token's issue time.
    users.set("u2", { validFrom: new Date(Date.now() + 5000) });
    forgetSessionCurrency("u2");
    expect(await sessionIsCurrent(claims)).toBe(false);
  });

  it("is refused outright once the account is gone", async () => {
    users.set("u3", { validFrom: null });
    forgetSessionCurrency("u3");
    const claims = (await verifySession(await signSession({ sub: "u3", username: "cy" })))!;
    expect(await sessionIsCurrent(claims)).toBe(true);

    users.delete("u3");
    forgetSessionCurrency("u3");
    expect(await sessionIsCurrent(claims)).toBe(false);
  });
});
