import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BETA_SESSION_KEY,
  hasClassicOverride,
  presentationHref,
  readBetaSession,
  readBrowserPresentation,
  writeBetaSession,
  writeBrowserPresentation,
} from "./access.js";

let data: Map<string, string>;
let storage: { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn> };
let browserLocation: { href: string; readonly search: string };
let browserHistory: { state: object; replaceState: ReturnType<typeof vi.fn> };
const SITE = "https://playgreed.vercel.app/";

beforeEach(() => {
  data = new Map([
    ["greed:profile", "earned progress"],
    ["greed:settings", "saved preferences"],
  ]);
  storage = {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value);
    }),
  };
  browserLocation = {
    href: SITE,
    get search() {
      return new URL(this.href).search;
    },
  };
  browserHistory = {
    state: { existingState: true },
    replaceState: vi.fn((_state: unknown, _title: string, href: string) => {
      browserLocation.href = href;
    }),
  };
  vi.stubGlobal("sessionStorage", storage);
  vi.stubGlobal("window", { location: browserLocation, history: browserHistory });
});
afterEach(() => vi.unstubAllGlobals());

const fail = () => {
  throw new Error("storage blocked");
};

describe("public presentation preference", () => {
  it("defaults new visitors and damaged preferences to the new look", () => {
    expect(readBetaSession(storage)).toBe(true);
    for (const value of ["", "broken json", "true", "classic", "future"]) {
      data.set(BETA_SESSION_KEY, value);
      expect(readBetaSession(storage)).toBe(true);
    }
    expect(readBetaSession(null)).toBe(true);
  });

  it("preserves old on sessions and persists an explicit Classic opt-out", () => {
    data.set(BETA_SESSION_KEY, "on");
    expect(readBetaSession(storage)).toBe(true);
    writeBetaSession(storage, false);
    expect(data.get(BETA_SESSION_KEY)).toBe("off");
    expect(readBetaSession(storage)).toBe(false);
    writeBetaSession(storage, true);
    expect(data.get(BETA_SESSION_KEY)).toBe("on");
    expect(readBetaSession(storage)).toBe(true);
    expect(data.get("greed:profile")).toBe("earned progress");
    expect(data.get("greed:settings")).toBe("saved preferences");
    expect(data.size).toBe(3);
  });

  it("defaults blocked storage to the new look and tolerates write failures", () => {
    expect(readBetaSession({ getItem: fail })).toBe(true);
    expect(() => writeBetaSession({ setItem: fail }, false)).not.toThrow();
    expect(() => writeBetaSession({ setItem: fail }, true)).not.toThrow();
  });

  it("honors explicit Classic recovery before touching saved storage", () => {
    data.set(BETA_SESSION_KEY, "on");
    expect(readBetaSession(storage, "?classic=1")).toBe(false);
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(readBetaSession({ getItem: fail }, "?classic=1")).toBe(false);
    expect(readBetaSession(null, "?classic=1")).toBe(false);
  });

  it("requires the exact recovery value and handles duplicate/encoded keys", () => {
    for (const search of ["", "?classic", "?classic=0", "?classic=true", "?other=classic%3D1"]) {
      expect(hasClassicOverride(search)).toBe(false);
    }
    for (const search of ["?classic=1", "?classic=0&classic=1", "?cla%73sic=1"]) {
      expect(hasClassicOverride(search)).toBe(true);
    }
  });
});

describe("presentation URLs and crash recovery", () => {
  it("adds/removes only the Classic parameter while preserving token/hash bytes", () => {
    const original = SITE + "?reset=a%2Bb%20c~%2F&room=ABCD#panel%20one";
    const classic = presentationHref(original, false);
    expect(classic).toBe(SITE + "?reset=a%2Bb%20c~%2F&room=ABCD&classic=1#panel%20one");
    expect(presentationHref(classic, true)).toBe(original);
    expect(presentationHref(SITE + "#help", false)).toBe(SITE + "?classic=1#help");
    expect(presentationHref(SITE + "?classic=1#help", true)).toBe(SITE + "#help");
  });

  it("replaces duplicate and encoded presentation keys without altering other params", () => {
    const original = SITE + "?room=ABCD&classic=0&cla%73sic=1&classic=1&x=%2525#table";
    expect(presentationHref(original, false)).toBe(SITE + "?room=ABCD&x=%2525&classic=1#table");
    expect(presentationHref(original, true)).toBe(SITE + "?room=ABCD&x=%2525#table");
  });

  it("round-trips the browser choice across reloads while keeping history state", () => {
    browserLocation.href = SITE + "?room=ABCD#help";
    expect(readBrowserPresentation()).toBe(true);
    writeBrowserPresentation(false);
    expect(readBrowserPresentation()).toBe(false);
    expect(data.get(BETA_SESSION_KEY)).toBe("off");
    expect(browserHistory.replaceState).toHaveBeenLastCalledWith(
      browserHistory.state,
      "",
      SITE + "?room=ABCD&classic=1#help",
    );
    writeBrowserPresentation(true);
    expect(readBrowserPresentation()).toBe(true);
    expect(browserLocation.href).toBe(SITE + "?room=ABCD#help");
    expect(data.get("greed:profile")).toBe("earned progress");
  });

  it("keeps Classic reload/recovery available when session storage throws", () => {
    vi.stubGlobal("sessionStorage", { getItem: fail, setItem: fail });
    expect(readBrowserPresentation()).toBe(true);
    expect(writeBrowserPresentation(false)).toBe(SITE + "?classic=1");
    expect(readBrowserPresentation()).toBe(false);
    expect(writeBrowserPresentation(true)).toBe(SITE);
    expect(readBrowserPresentation()).toBe(true);
  });

  it("handles the sessionStorage property itself throwing in private mode", () => {
    Object.defineProperty(globalThis, "sessionStorage", { configurable: true, get: fail });
    expect(readBrowserPresentation()).toBe(true);
    expect(writeBrowserPresentation(false)).toBe(SITE + "?classic=1");
    expect(readBrowserPresentation()).toBe(false);
  });

  it("returns a navigable Classic recovery URL even when history also refuses writes", () => {
    vi.stubGlobal("sessionStorage", { getItem: fail, setItem: fail });
    browserHistory.replaceState.mockImplementation(fail);
    const recovery = writeBrowserPresentation(false);
    expect(recovery).toBe(SITE + "?classic=1");
    expect(browserLocation.href).toBe(SITE);
    browserLocation.href = recovery;
    expect(readBrowserPresentation()).toBe(false);
  });
});
