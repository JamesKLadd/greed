/**
 * Transactional email (verification + password reset) via Resend.
 *
 * Email is OPTIONAL: sending a real message needs both RESEND_API_KEY and a
 * verified sender domain (EMAIL_FROM). Until those exist, this logs the link to
 * the server console so the flows are fully testable, and signup/login keep
 * working. Flip on real delivery later by setting the two env vars — no code
 * change. `emailEnabled()` lets callers tell the client whether a message was
 * actually sent.
 */

import { Resend } from "resend";

/**
 * Resend's shared sandbox sender. It works without owning a domain, but it will
 * ONLY deliver to the address that owns the Resend account — every other
 * recipient is rejected. Fine for a smoke test, useless for real signups.
 */
const SANDBOX_FROM = "Greed <onboarding@resend.dev>";
// Trimmed, because a variable that exists with an empty (or whitespace) value is
// how hosting dashboards represent "I added the key but haven't filled it in" —
// and that has to behave the same as not setting it at all.
const CONFIGURED_FROM = (process.env.EMAIL_FROM || "").trim();
const FROM = CONFIGURED_FROM || SANDBOX_FROM;

let client: Resend | null = null;
function resend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

/** True when real email delivery is configured. */
export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * Whether new accounts must confirm their email address before they're
 * considered verified.
 *
 * OFF unless explicitly switched on, and deliberately so: a verification step
 * you cannot complete is worse than none at all — it leaves every account
 * permanently marked unverified with no way to fix it. So this stays off until
 * someone asserts that mail really does reach strangers, which is a stronger
 * claim than "an API key is present". A key alone can mean the sandbox sender,
 * which only ever delivers to the account owner.
 *
 * Turn it on with REQUIRE_EMAIL_VERIFICATION=true once a domain is verified
 * with the provider. Nothing else needs changing — the whole flow is still here.
 */
export function verificationRequired(): boolean {
  return process.env.REQUIRE_EMAIL_VERIFICATION === "true" && emailEnabled();
}

/**
 * One line for the boot log describing what email will actually do.
 *
 * Three states, not two, because the middle one is a legitimate place to stop:
 * a key with no sender is the sandbox, which is exactly how you prove the
 * plumbing works before owning a verified domain. It is only a problem if you
 * thought you were live — so it reads as a limitation, not an error. (Calling
 * it MISCONFIGURED, as this once did, sends people off debugging a setup that
 * is working.)
 */
export function emailStatus(): string {
  if (!process.env.RESEND_API_KEY) {
    return "Email: disabled (no RESEND_API_KEY) — verification links are logged to this console.";
  }
  if (!CONFIGURED_FROM) {
    return (
      `Email: SANDBOX — sending as ${SANDBOX_FROM}, which Resend delivers ONLY to your own ` +
      "account address. Good for testing the flow. To reach real players, verify a domain in " +
      "Resend and set EMAIL_FROM."
    );
  }
  return `Email: enabled (from ${FROM}) — sending to any address.`;
}

/** Companion line for the boot log: whether signups have to confirm an address. */
export function verificationStatus(): string {
  return verificationRequired()
    ? "Email verification: REQUIRED — new accounts must confirm their address."
    : "Email verification: off — new accounts are created ready to play. " +
        "(Set REQUIRE_EMAIL_VERIFICATION=true, with a verified sender, to turn it on.)";
}

async function send(to: string, subject: string, html: string, text: string): Promise<void> {
  const r = resend();
  if (!r) {
    console.log(`[email:disabled] to=${to} subject="${subject}"\n  ${text}`);
    return;
  }
  try {
    const { error } = await r.emails.send({ from: FROM, to, subject, html, text });
    // The SDK reports a rejected send in the RESULT, not by throwing — an
    // unverified sender domain lands here, not in the catch below.
    if (error) console.error(`[email] rejected (from=${FROM} to=${to}):`, error.message);
  } catch (err) {
    console.error("[email] send failed:", (err as Error).message);
  }
}

/**
 * Matches the app's dark tabletop palette (see styles/tokens.css) — a charcoal
 * room, a raised slab, and the same green that means "go" on the Roll button.
 * All styling is inline and table-free on purpose: email clients strip <style>
 * blocks, and several still don't do flex or custom properties.
 */
function layout(title: string, body: string, cta: { href: string; label: string }): string {
  return `<!doctype html><html><body style="margin:0;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#12161e;padding:32px">
  <div style="max-width:480px;margin:0 auto;background:#232a35;border:1px solid #333d4b;border-radius:14px;padding:28px;color:#eef2f8">
    <h1 style="margin:0 0 12px;font-size:20px;letter-spacing:1px">🎲 GREED</h1>
    <h2 style="margin:0 0 8px;font-size:16px;font-weight:700">${title}</h2>
    <p style="margin:0 0 20px;color:#99a4b4;line-height:1.5">${body}</p>
    <a href="${cta.href}" style="display:inline-block;background:#35c07a;color:#04150c;text-decoration:none;
      font-weight:700;padding:12px 22px;border-radius:9px">${cta.label}</a>
    <p style="margin:20px 0 0;color:#6b7583;font-size:12px">If the button doesn't work, paste this link:<br>${cta.href}</p>
  </div></body></html>`;
}

export async function sendVerifyEmail(to: string, username: string, link: string): Promise<void> {
  await send(
    to,
    "Verify your Greed account",
    layout(
      `Welcome, ${username}!`,
      "Confirm your email address to finish setting up your account.",
      { href: link, label: "Verify email" },
    ),
    `Welcome to Greed, ${username}! Verify your email: ${link}`,
  );
}

export async function sendResetEmail(to: string, username: string, link: string): Promise<void> {
  await send(
    to,
    "Reset your Greed password",
    layout(
      `Hi ${username},`,
      "We received a request to reset your password. This link expires in 1 hour. If you didn't ask for this, you can ignore this email.",
      { href: link, label: "Reset password" },
    ),
    `Reset your Greed password (expires in 1 hour): ${link}`,
  );
}
