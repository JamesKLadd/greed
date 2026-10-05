import { afterEach, describe, expect, it } from "vitest";
import { isGrowthAdmin, parseGrowthBatch } from "./growth.js";

const event = {
  id: "f768af0e-83d0-45f8-89f6-d58f2caab6ab",
  visitor: "8a335cfe-e425-4b4a-bfc0-1ff37b7ae645",
  session: "7bdb8118-12ce-4e2e-9f5c-8b899ce93b88",
  event: "daily_completed",
  source: "direct",
  campaign: "none",
};
const original = process.env.GROWTH_ADMIN_USERNAME;
afterEach(() => {
  if (original === undefined) delete process.env.GROWTH_ADMIN_USERNAME;
  else process.env.GROWTH_ADMIN_USERNAME = original;
});
describe("measurement boundary", () => {
  it("accepts only the fixed record fields and discards identifying extras", () => {
    expect(
      parseGrowthBatch({
        events: [
          { ...event, username: "private", score: 900, url: "https://example.test/?token=secret" },
        ],
      }),
    ).toEqual([event]);
  });
  it("rejects arbitrary events, labels, and non-random identifiers", () => {
    for (const changed of [
      { event: "user@email.test" },
      { source: "https://private.test" },
      { campaign: "secret-room" },
      { visitor: "player-name" },
      { session: null },
      { id: "00000000-0000-1000-8000-000000000000" },
    ])
      expect(() => parseGrowthBatch({ events: [{ ...event, ...changed }] })).toThrow();
  });
  it("bounds batches and handles malformed input", () => {
    for (const invalid of [
      null,
      {},
      { events: [] },
      { events: Array(21).fill(event) },
      { events: [null] },
    ])
      expect(() => parseGrowthBatch(invalid)).toThrow();
    expect(parseGrowthBatch({ events: Array(20).fill(event) })).toHaveLength(20);
  });
  it("restricts report ownership and supports an explicit configured owner", () => {
    delete process.env.GROWTH_ADMIN_USERNAME;
    expect(isGrowthAdmin("James")).toBe(true);
    expect(isGrowthAdmin("SomeoneElse")).toBe(false);
    process.env.GROWTH_ADMIN_USERNAME = "ReviewOwner";
    expect(isGrowthAdmin("reviewowner")).toBe(true);
    expect(isGrowthAdmin("James")).toBe(false);
  });
});
