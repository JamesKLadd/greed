import { afterEach, describe, expect, it, vi } from "vitest";
import { clearRoomInvitation, gameLink, readRoomInvitation, roomFromLink } from "./share.js";

afterEach(() => vi.unstubAllGlobals());

describe("public game links", () => {
  it("shares a challenge without carrying account tokens or development flags", () => {
    expect(
      gameLink({ challenge: "daily" }, "https://playgreed.vercel.app/?reset=private&ui#token"),
    ).toBe("https://playgreed.vercel.app/?challenge=daily&source=daily_share");
  });
  it("uses the public game from native desktop origins", () => {
    for (const origin of ["tauri://localhost/", "http://tauri.localhost/"]) {
      expect(gameLink({ room: "ABCD" }, origin)).toBe(
        "https://playgreed.vercel.app/?room=ABCD&source=room_invite",
      );
    }
  });
  it("only accepts real room codes, normalizing case and surrounding whitespace", () => {
    expect(roomFromLink("?room=%20abcd%20")).toBe("ABCD");
    for (const invalid of ["", "ABC", "ABCDE", "AB00", "ABIO", "<svg>"]) {
      expect(roomFromLink(`?room=${encodeURIComponent(invalid)}`)).toBeNull();
    }
  });
  it("keeps a room through a reload and clears it only when consumed or cancelled", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const location = {
      search: "?room=ABCD",
      href: "https://playgreed.vercel.app/?room=ABCD&challenge=daily#keep",
    };
    const replaceState = vi.fn();
    vi.stubGlobal("sessionStorage", storage);
    vi.stubGlobal("window", { location, history: { replaceState } });
    expect(readRoomInvitation()).toBe("ABCD");
    location.search = "";
    expect(readRoomInvitation()).toBe("ABCD");
    clearRoomInvitation();
    expect(readRoomInvitation()).toBeNull();
    expect(replaceState).toHaveBeenCalledWith({}, "", "/?challenge=daily#keep");
  });
  it("can follow a URL invitation with storage blocked", () => {
    vi.stubGlobal("window", { location: { search: "?room=ABCD" } });
    vi.stubGlobal("sessionStorage", {
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readRoomInvitation()).toBe("ABCD");
  });
});
