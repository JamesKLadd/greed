/**
 * In-memory rate limiting for the auth endpoints.
 *
 * Signup, login and password-reset were unthrottled, so they could be
 * brute-forced or spam-registered against. A fixed-window counter per
 * (bucket, client) is enough here: the server is a single process, and the goal
 * is to blunt automated abuse rather than to coordinate limits across a fleet.
 * If this ever runs multiple instances, move the counters to the database.
 */

interface Window {
  count: number;
  /** Epoch ms when the current window expires. */
  resetAt: number;
}

const windows = new Map<string, Window>();

/** Drop expired entries so the map can't grow without bound. */
function sweep(now: number): void {
  if (windows.size < 500) return;
  for (const [key, w] of windows) if (w.resetAt <= now) windows.delete(key);
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the caller may retry (only meaningful when blocked). */
  retryAfter: number;
}

/**
 * Count one hit against `bucket` for `client`, allowing `limit` per `windowMs`.
 */
export function rateLimit(
  bucket: string,
  client: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const key = `${bucket}:${client}`;
  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return { allowed: false, retryAfter: Math.ceil((existing.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfter: 0 };
}

/** Clear all counters (tests). */
export function resetRateLimits(): void {
  windows.clear();
}

/**
 * Best-effort client identity. Render (like most platforms) terminates TLS at a
 * proxy, so the socket address is the proxy's — prefer the left-most entry of
 * x-forwarded-for, which is the original client.
 */
export function clientKey(
  headers: Record<string, string | string[] | undefined>,
  socketIp = "",
): string {
  const fwd = headers["x-forwarded-for"];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  const first = raw?.split(",")[0]?.trim();
  return first || socketIp || "unknown";
}
