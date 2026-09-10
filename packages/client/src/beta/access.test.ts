import { describe, expect, it } from "vitest";
import { acceptsBetaCode, BETA_SESSION_KEY, readBetaSession, writeBetaSession } from "./access.js";

describe("casual beta session", () => {
  it("requires the specified code, without accepting partial or padded digits", () => {
    expect(acceptsBetaCode("2525")).toBe(true);
    for (const code of ["", "252", "02525", "25250", "0000"])
      expect(acceptsBetaCode(code)).toBe(false);
  });
  it("defaults to classic, persists this session, and clears on return", () => {
    const data = new Map<string, string>([["greed:profile", "earned progress"]]);
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
      removeItem: (key: string) => {
        data.delete(key);
      },
    };
    expect(readBetaSession(storage)).toBe(false);
    writeBetaSession(storage, true);
    expect(readBetaSession(storage)).toBe(true);
    writeBetaSession(storage, false);
    expect(readBetaSession(storage)).toBe(false);
    expect(data.has(BETA_SESSION_KEY)).toBe(false);
    expect(data.get("greed:profile")).toBe("earned progress");
  });
  it("tolerates blocked storage", () => {
    const fail = () => {
      throw new Error("blocked");
    };
    expect(readBetaSession({ getItem: fail })).toBe(false);
    expect(() => writeBetaSession({ setItem: fail, removeItem: fail }, true)).not.toThrow();
  });
});
