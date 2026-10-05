const PUBLIC_URL = "https://playgreed.vercel.app/";

/** Never propagate account tokens, dev switches, or unrelated query parameters. */
export function gameLink(
  target: { challenge: "daily" } | { room: string },
  current = window.location.href,
): string {
  const source = new URL(current);
  const url = new URL(
    (source.protocol === "https:" || source.protocol === "http:") &&
      source.hostname !== "tauri.localhost"
      ? source.origin + source.pathname
      : PUBLIC_URL,
  );
  if ("room" in target) url.searchParams.set("room", target.room);
  else url.searchParams.set("challenge", target.challenge);
  url.searchParams.set("source", "room" in target ? "room_invite" : "daily_share");
  return url.toString();
}

export function roomFromLink(search: string): string | null {
  const code = new URLSearchParams(search).get("room")?.trim().toUpperCase();
  return code && /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/.test(code) ? code : null;
}

const INVITE_KEY = "greed:pending-room";

export function readRoomInvitation(): string | null {
  const fromUrl = roomFromLink(window.location.search);
  try {
    if (fromUrl) sessionStorage.setItem(INVITE_KEY, fromUrl);
    return fromUrl ?? roomFromLink(`room=${sessionStorage.getItem(INVITE_KEY) ?? ""}`);
  } catch {
    return fromUrl;
  }
}

export function clearRoomInvitation(): void {
  try {
    sessionStorage.removeItem(INVITE_KEY);
  } catch {
    // The URL still carries the invite when storage is unavailable.
  }
  const url = new URL(window.location.href);
  url.searchParams.delete("room");
  window.history.replaceState({}, "", url.pathname + url.search + url.hash);
}
