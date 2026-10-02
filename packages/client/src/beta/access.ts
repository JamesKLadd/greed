/** Presentation preference only; it never changes game/account access. */
export const BETA_SESSION_KEY = "greed:visual-beta:v1";
export const BETA_AVAILABLE = true;

/** Explicit recovery remains available even when browser storage is blocked. */
export function hasClassicOverride(search: string): boolean {
  return new URLSearchParams(search).getAll("classic").includes("1");
}

export function readBetaSession(storage: Pick<Storage, "getItem"> | null, search = ""): boolean {
  if (!BETA_AVAILABLE || hasClassicOverride(search)) return false;
  try {
    // Old "on" sessions remain compatible; missing/damaged data uses the
    // promoted default. Classic needs an explicit opt-out to survive reload.
    return storage?.getItem(BETA_SESSION_KEY) !== "off";
  } catch {
    return true;
  }
}

export function writeBetaSession(storage: Pick<Storage, "setItem">, on: boolean): void {
  try {
    storage.setItem(BETA_SESSION_KEY, on ? "on" : "off");
  } catch {
    // In-memory state and the URL preference still work with blocked storage.
  }
}

/** Change only this query key, retaining other parameter/token/hash bytes. */
export function presentationHref(href: string, on: boolean): string {
  const hashAt = href.indexOf("#");
  const hash = hashAt < 0 ? "" : href.slice(hashAt);
  const beforeHash = hashAt < 0 ? href : href.slice(0, hashAt);
  const queryAt = beforeHash.indexOf("?");
  const path = queryAt < 0 ? beforeHash : beforeHash.slice(0, queryAt);
  const parts = queryAt < 0 ? [] : beforeHash.slice(queryAt + 1).split("&");
  const kept = parts.filter((part) => !new URLSearchParams(part).has("classic"));
  if (!on) kept.push("classic=1");
  const query = kept.join("&");
  return path + (query ? `?${query}` : "") + hash;
}

export function readBrowserPresentation(): boolean {
  const search = window.location.search;
  try {
    return readBetaSession(sessionStorage, search);
  } catch {
    return readBetaSession(null, search);
  }
}

/** Returns the same recovery URL even if storage/history writes fail. */
export function writeBrowserPresentation(on: boolean): string {
  try {
    writeBetaSession(sessionStorage, on);
  } catch {
    /* Accessing sessionStorage itself can throw in private mode. */
  }
  const href = presentationHref(window.location.href, on);
  try {
    window.history.replaceState(window.history.state, "", href);
  } catch {
    /* The current React choice still applies; crash recovery can navigate. */
  }
  return href;
}
