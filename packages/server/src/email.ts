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

const FROM = process.env.EMAIL_FROM || "Greed <onboarding@resend.dev>";

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

async function send(to: string, subject: string, html: string, text: string): Promise<void> {
  const r = resend();
  if (!r) {
    console.log(`[email:disabled] to=${to} subject="${subject}"\n  ${text}`);
    return;
  }
  try {
    await r.emails.send({ from: FROM, to, subject, html, text });
  } catch (err) {
    console.error("[email] send failed:", (err as Error).message);
  }
}

function layout(title: string, body: string, cta: { href: string; label: string }): string {
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;background:#0a3d26;padding:32px">
  <div style="max-width:480px;margin:0 auto;background:#0f4a30;border-radius:14px;padding:28px;color:#f4efe6">
    <h1 style="margin:0 0 12px;font-size:20px">🎲 Greed</h1>
    <h2 style="margin:0 0 8px;font-size:16px">${title}</h2>
    <p style="margin:0 0 20px;color:#cfc7b8;line-height:1.5">${body}</p>
    <a href="${cta.href}" style="display:inline-block;background:#e8c55a;color:#1a1207;text-decoration:none;
      font-weight:700;padding:11px 20px;border-radius:9px">${cta.label}</a>
    <p style="margin:20px 0 0;color:#8a8577;font-size:12px">If the button doesn't work, paste this link:<br>${cta.href}</p>
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
