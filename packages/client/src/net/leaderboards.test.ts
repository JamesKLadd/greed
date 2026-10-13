import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./auth.js";
import { fetchDailyBest, fetchWeeklyBest } from "./leaderboards.js";

vi.mock("./auth.js", () => ({ api: vi.fn() }));

beforeEach(() => vi.mocked(api).mockReset());

describe.each([
  ["daily", fetchDailyBest, "day"],
  ["weekly", fetchWeeklyBest, "week"],
] as const)("%s all-time board identities", (_kind, fetchBoard, period) => {
  it("keeps equipped portraits on board rows and personal bests", async () => {
    const visualBeta = {
      version: 1,
      mascot: "panda",
      frame: "diamond",
      background: "sunset",
      nameplate: "marquee",
      badge: "",
    };
    const entry = {
      username: "Player",
      avatar: "bear",
      visualBeta,
      [period]: "2026-10-05",
      score: 7500,
      rank: 3,
    };
    vi.mocked(api).mockResolvedValue({ entries: [entry], yourBest: entry, runs: 25 });
    const board = await fetchBoard();
    expect(board.entries[0]).toEqual(entry);
    expect(board.yourBest).toEqual(entry);
    expect(board.runs).toBe(25);
  });

  it("accepts older servers without identity fields", async () => {
    const entry = { username: "Player", [period]: "2026-10-05", score: 5000, rank: 1 };
    vi.mocked(api).mockResolvedValue({ entries: [entry], yourBest: entry });
    const board = await fetchBoard();
    expect(board.entries[0]).toMatchObject({ ...entry, avatar: "" });
    expect(board.entries[0].visualBeta).toBeUndefined();
    expect(board.yourBest?.avatar).toBe("");
    expect(board.yourBest?.visualBeta).toBeUndefined();
    expect(board.runs).toBe(0);
  });

  it("sanitizes malformed portrait data before rendering", async () => {
    const entry = {
      username: "Player",
      avatar: 4,
      visualBeta: { version: 1, mascot: "not-a-mascot", frame: "???", badge: "<script>" },
      [period]: "2026-10-05",
      score: 5000,
      rank: 1,
    };
    vi.mocked(api).mockResolvedValue({ entries: [entry], yourBest: entry });
    const board = await fetchBoard();
    const expectedIdentity = {
      version: 1,
      mascot: "fox",
      frame: "brass",
      background: "felt",
      nameplate: "classic",
      badge: "",
    };
    expect(board.entries[0]).toMatchObject({ avatar: "", visualBeta: expectedIdentity });
    expect(board.yourBest).toMatchObject({ avatar: "", visualBeta: expectedIdentity });
    expect(board.entries[0].score).toBe(5000);
    expect(board.entries[0].rank).toBe(1);
  });
});
