import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./auth.js";
import {
  fetchDailyBest,
  fetchLeaderboard,
  fetchWeeklyBest,
  LEADERBOARD_CATEGORIES,
} from "./leaderboards.js";

vi.mock("./auth.js", () => ({ api: vi.fn() }));

beforeEach(() => vi.mocked(api).mockReset());

describe.each(LEADERBOARD_CATEGORIES)("%s career leaderboard portraits", (category) => {
  it("keeps equipped identity for rows and an own standing outside the top 25", async () => {
    const visualBeta = {
      version: 1,
      mascot: "panda",
      frame: "brass",
      background: "felt",
      nameplate: "classic",
      hat: "none",
      badge: "",
    };
    const entry = { username: "Winner", avatar: "panda", visualBeta, value: 100, rank: 1 };
    const own = { ...entry, username: "Player", value: 5, rank: 30, you: true };
    vi.mocked(api).mockResolvedValue({
      category,
      entries: [entry],
      yourEntry: own,
      yourRank: 30,
      yourValue: 5,
      players: 40,
    });
    const board = await fetchLeaderboard(category);
    expect(board.entries[0]).toEqual(entry);
    expect(board.yourEntry).toEqual(own);
    expect(board.yourRank).toBe(30);
    expect(board.yourValue).toBe(5);
    expect(board.players).toBe(40);
  });
});

describe("career leaderboard compatibility", () => {
  it("accepts an older server without row portraits or own identity", async () => {
    const entry = { username: "Winner", value: 100, rank: 1 };
    vi.mocked(api).mockResolvedValue({
      category: "wins",
      entries: [entry],
      yourRank: 30,
      yourValue: 5,
      players: 40,
    });
    const board = await fetchLeaderboard("wins");
    expect(board.entries[0]).toMatchObject({ ...entry, avatar: "" });
    expect(board.entries[0].visualBeta).toBeUndefined();
    expect(board.yourEntry).toBeNull();
    expect(board.yourRank).toBe(30);
  });

  it("sanitizes malformed career portraits and leaves anonymous personal standings empty", async () => {
    vi.mocked(api).mockResolvedValue({
      category: "wins",
      entries: [{ username: "Winner", avatar: 4, visualBeta: "invalid", value: 100, rank: 1 }],
      yourEntry: null,
      yourRank: null,
      yourValue: null,
      players: 40,
    });
    const board = await fetchLeaderboard("wins");
    expect(board.entries[0].avatar).toBe("");
    expect(board.entries[0].visualBeta).toBeUndefined();
    expect(board.entries[0].value).toBe(100);
    expect(board.entries[0].rank).toBe(1);
    expect(board.yourEntry).toBeNull();
    expect(board.yourRank).toBeNull();
  });
});

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
      hat: "none",
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
