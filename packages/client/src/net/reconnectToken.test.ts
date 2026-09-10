import { afterEach, expect, it, vi } from "vitest";
import { readToken, dropToken } from "./useOnlineGame.js";
afterEach(() => vi.unstubAllGlobals());
it("reads and removes the reconnect token without recursive calls", () => {
  const data = new Map([["greed-token", "saved-session"]]);
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => data.get(k) ?? null,
    removeItem: (k: string) => data.delete(k),
  });
  expect(readToken()).toBe("saved-session");
  dropToken();
  expect(readToken()).toBeNull();
});
it("keeps guest multiplayer usable when storage is denied", () => {
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw Error();
    },
    removeItem: () => {
      throw Error();
    },
  });
  expect(readToken()).toBeNull();
  expect(dropToken).not.toThrow();
});
