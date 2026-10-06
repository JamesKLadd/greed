import {
  GROWTH_CAMPAIGNS,
  GROWTH_SOURCES,
  type GrowthEvent,
  type GrowthRecord,
} from "@greed/protocol";
import { SERVER_URL, ONLINE_ENABLED } from "./online.js";

export type { GrowthEvent } from "@greed/protocol";
const PREF = "greed:usage";
const VISITOR = "greed:usage-visitor";
const SESSION = "greed:usage-session";
const MONTH = 30 * 24 * 60 * 60_000;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let queue: GrowthRecord[] = [];
let timer: number | undefined;
let initialized = false;

/** Blocked storage and browser privacy signals always disable collection. */
export function usageEnabled(): boolean {
  try {
    return (
      navigator.doNotTrack !== "1" &&
      !(navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl &&
      localStorage.getItem(PREF) !== "off"
    );
  } catch {
    return false;
  }
}
export function setUsageEnabled(enabled: boolean): void {
  queue = [];
  window.clearTimeout(timer);
  timer = undefined;
  try {
    localStorage.setItem(PREF, enabled ? "on" : "off");
    localStorage.removeItem(VISITOR);
    sessionStorage.removeItem(SESSION);
  } catch {
    /* Play still works with storage blocked. */
  }
}
function context(): Omit<GrowthRecord, "id" | "event"> {
  const now = Date.now();
  const stored = JSON.parse(localStorage.getItem(VISITOR) ?? "null");
  const visitor =
    stored && ID.test(stored.id) && stored.expires > now
      ? (stored.id as string)
      : crypto.randomUUID();
  if (visitor !== stored?.id)
    localStorage.setItem(VISITOR, JSON.stringify({ id: visitor, expires: now + MONTH }));
  const old = JSON.parse(sessionStorage.getItem(SESSION) ?? "null");
  const reuse = old && ID.test(old.id) && now - old.at < 30 * 60_000;
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("source");
  const rawCampaign = params.get("utm_campaign");
  const landing = /^\/welcome(?:\/|$)/.test(window.location.pathname);
  const source =
    GROWTH_SOURCES.find((s) => s === requested) ??
    (params.has("room") ? "room_invite" : landing ? "landing" : reuse ? old.source : "direct");
  const campaign =
    GROWTH_CAMPAIGNS.find((c) => c === rawCampaign) ?? (reuse && !landing ? old.campaign : "none");
  const session = reuse ? (old.id as string) : crypto.randomUUID();
  sessionStorage.setItem(SESSION, JSON.stringify({ id: session, at: now, source, campaign }));
  return { visitor, session, source, campaign };
}
/** Send before a welcome link navigates away; never hold up navigation. */
export function flushGrowthEvents(): void {
  window.clearTimeout(timer);
  timer = undefined;
  if (!usageEnabled()) {
    queue = [];
    return;
  }
  const events = queue.splice(0, 20);
  if (!events.length) return;
  void fetch(`${SERVER_URL.replace(/^ws/, "http").replace(/\/+$/, "")}/api/growth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events }),
    keepalive: true,
    credentials: "omit",
  }).catch(() => {
    /* Offline measurements are discarded; never delay play. */
  });
}
export function recordGrowthEvent(event: GrowthEvent): void {
  if (import.meta.env.DEV) {
    try {
      const raw: unknown = JSON.parse(sessionStorage.getItem("greed:growth-review") ?? "[]");
      const entry = { event, at: new Date().toISOString() };
      sessionStorage.setItem(
        "greed:growth-review",
        JSON.stringify([...(Array.isArray(raw) ? raw.slice(-99) : []), entry]),
      );
      window.dispatchEvent(new CustomEvent("greed:growth", { detail: entry }));
    } catch {
      /* Development measurements are optional too. */
    }
  }
  if (
    (!import.meta.env.PROD && import.meta.env.VITE_GROWTH_RECORDING !== "true") ||
    !ONLINE_ENABLED ||
    !usageEnabled()
  )
    return;
  try {
    queue.push({ ...context(), id: crypto.randomUUID(), event });
    if (queue.length >= 20) flushGrowthEvents();
    else if (timer === undefined) timer = window.setTimeout(flushGrowthEvents, 1500);
  } catch {
    /* Unsupported crypto or storage disables collection. */
  }
}
export function initGrowth(landing = false): void {
  if (initialized) return;
  initialized = true;
  recordGrowthEvent(landing ? "landing_viewed" : "visit");
  window.addEventListener("pagehide", flushGrowthEvents);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushGrowthEvents();
    else recordGrowthEvent(landing ? "landing_viewed" : "visit");
  });
}
