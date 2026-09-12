/** A casual preview gate, deliberately not an authentication boundary. */
export const BETA_SESSION_KEY = "greed:visual-beta:v1";
export const BETA_AVAILABLE = true;
export function acceptsBetaCode(code: string): boolean {
  return BETA_AVAILABLE && code.trim() === "2525";
}
export function readBetaSession(storage: Pick<Storage, "getItem">): boolean {
  try {
    return BETA_AVAILABLE && storage.getItem(BETA_SESSION_KEY) === "on";
  } catch {
    return false;
  }
}
export function writeBetaSession(storage: Pick<Storage, "setItem" | "removeItem">, on: boolean) {
  try {
    if (on) storage.setItem(BETA_SESSION_KEY, "on");
    else storage.removeItem(BETA_SESSION_KEY);
  } catch {
    // React state still supports an in-memory preview when storage is blocked.
  }
}
