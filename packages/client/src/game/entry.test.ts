import { describe, expect, it } from "vitest";
import { playEntryUrl, readPlayEntry } from "./entry.js";

describe("public play destinations", () => {
  it("preserves the chosen challenge through the account step and a reload", () => {
    const daily = playEntryUrl(
      "https://greed.test/?practice=1&source=landing&utm_campaign=bust",
      "daily",
    );
    expect(readPlayEntry(new URL(daily, "https://greed.test").search)).toBe("daily");
    expect(daily).toBe("/?source=landing&utm_campaign=bust&challenge=daily");
    expect(readPlayEntry("?challenge=weekly")).toBe("weekly");
  });
  it("clears stale play destinations on exit without losing unrelated links", () => {
    expect(
      playEntryUrl("https://greed.test/?practice=1&challenge=daily&room=ABC123#top", "home"),
    ).toBe("/?room=ABC123#top");
    expect(playEntryUrl("https://greed.test/?challenge=weekly&reset=token", "practice")).toBe(
      "/?reset=token&practice=1",
    );
    expect(readPlayEntry("?challenge=unknown")).toBe("home");
  });
});
