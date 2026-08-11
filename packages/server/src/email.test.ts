import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `emailEnabled` / `verificationRequired` are read from the environment at call
 * time, and between them they decide whether a brand-new account can play
 * immediately or is left waiting on a message. Getting that wrong locks real
 * people out of their accounts, so the truth table is worth pinning down.
 *
 * The module caches its sender at import time, so each case re-imports with a
 * fresh module registry rather than mutating a live one.
 */

async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import("./email.js");
}

const KEYS = ["RESEND_API_KEY", "EMAIL_FROM", "REQUIRE_EMAIL_VERIFICATION"];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("emailEnabled", () => {
  it("is false without an API key", async () => {
    const { emailEnabled } = await load({ RESEND_API_KEY: undefined });
    expect(emailEnabled()).toBe(false);
  });

  it("is true with one", async () => {
    const { emailEnabled } = await load({ RESEND_API_KEY: "re_test" });
    expect(emailEnabled()).toBe(true);
  });
});

describe("verificationRequired", () => {
  it("is off by default, even with email fully configured", async () => {
    // The important half of the contract: verification is opt-IN. Having a
    // working mail setup is not consent to gate signups behind it.
    const { verificationRequired } = await load({
      RESEND_API_KEY: "re_test",
      EMAIL_FROM: "Greed <hi@example.com>",
      REQUIRE_EMAIL_VERIFICATION: undefined,
    });
    expect(verificationRequired()).toBe(false);
  });

  it("stays off when asked for but no mail can be sent", async () => {
    // The other half, and the reason this isn't a single flag: a verification
    // step with no way to deliver the message strands every new account
    // permanently unverified. Refusing to enable it is the safe failure.
    const { verificationRequired } = await load({
      RESEND_API_KEY: undefined,
      REQUIRE_EMAIL_VERIFICATION: "true",
    });
    expect(verificationRequired()).toBe(false);
  });

  it("is on only when explicitly asked for AND email works", async () => {
    const { verificationRequired } = await load({
      RESEND_API_KEY: "re_test",
      REQUIRE_EMAIL_VERIFICATION: "true",
    });
    expect(verificationRequired()).toBe(true);
  });

  it('treats anything other than the exact string "true" as off', async () => {
    for (const value of ["1", "yes", "TRUE", "on", ""]) {
      const { verificationRequired } = await load({
        RESEND_API_KEY: "re_test",
        REQUIRE_EMAIL_VERIFICATION: value,
      });
      expect(verificationRequired(), `value=${JSON.stringify(value)}`).toBe(false);
    }
  });
});

describe("emailStatus", () => {
  it("distinguishes disabled, sandbox and enabled", async () => {
    const off = await load({ RESEND_API_KEY: undefined, EMAIL_FROM: undefined });
    expect(off.emailStatus()).toContain("disabled");

    const sandbox = await load({ RESEND_API_KEY: "re_test", EMAIL_FROM: undefined });
    expect(sandbox.emailStatus()).toContain("SANDBOX");

    const live = await load({ RESEND_API_KEY: "re_test", EMAIL_FROM: "Greed <hi@example.com>" });
    expect(live.emailStatus()).toContain("enabled");
  });

  it("treats a present-but-empty EMAIL_FROM as unset", async () => {
    // How a hosting dashboard represents "added the variable, haven't filled it
    // in" — it must not read as a configured sender.
    const { emailStatus } = await load({ RESEND_API_KEY: "re_test", EMAIL_FROM: "   " });
    expect(emailStatus()).toContain("SANDBOX");
  });
});
