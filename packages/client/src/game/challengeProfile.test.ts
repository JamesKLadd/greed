import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDailyGame, createRunGame, createWeeklyGame } from "@greed/core";
import { claimChallengeTurnAchievement, recordChallengeBestTurn } from "./challengeProfile.js";
import { loadProfile, raiseBestTurn } from "./profile.js";
import type { RunView } from "./useChallengeRun.js";

beforeEach(() => {
  const saved = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
  });
});

afterEach(() => vi.unstubAllGlobals());

function finishedAttempt(bestTurn = 1000, createGame = createRunGame): RunView {
  const state = createGame(42);
  state.players[0].total = bestTurn + 2000;
  state.log = [
    { type: "bank", playerId: "you", gained: bestTurn, total: bestTurn },
    { type: "bank", playerId: "you", gained: 600, total: bestTurn + 600 },
    { type: "bank", playerId: "you", gained: 700, total: bestTurn + 1300 },
    { type: "bank", playerId: "you", gained: 700, total: bestTurn + 2000 },
  ];
  return { state, turns: 10, totalTurns: 10, complete: true };
}

describe("completed challenge career best", () => {
  it("counts the larger turn in an attempt that does not beat the weekly score", () => {
    // The standing weekly score may be 5000, with a best turn of only 600.
    raiseBestTurn(600);
    expect(recordChallengeBestTurn(finishedAttempt())).toBe(true);
    expect(loadProfile().bestTurn).toBe(1000);
    expect(loadProfile().gamesPlayed).toBe(0);
    // A subsequent board read of that standing best cannot lower the record.
    expect(raiseBestTurn(600)).toBe(false);
    expect(loadProfile().bestTurn).toBe(1000);
  });

  it("records the verified position without depending on a leaderboard reply", () => {
    expect(recordChallengeBestTurn(finishedAttempt())).toBe(true);
    // The score is the largest bank, not the attempt's aggregate total.
    expect(loadProfile().bestTurn).toBe(1000);
    expect(recordChallengeBestTurn(finishedAttempt())).toBe(false);
  });

  it("does not infer a record from an empty recovery or unfinished run", () => {
    expect(recordChallengeBestTurn(null)).toBe(false);
    expect(recordChallengeBestTurn({ ...finishedAttempt(), complete: false })).toBe(false);
    expect(loadProfile().bestTurn).toBe(0);
  });
});

describe("challenge Tidal Wave achievement", () => {
  it.each([
    ["daily", createDailyGame],
    ["weekly", createWeeklyGame],
  ] as const)("awards a bank of exactly 2500 in the %s challenge", (_mode, createGame) => {
    recordChallengeBestTurn(finishedAttempt(2500, createGame));
    expect(claimChallengeTurnAchievement(2500)?.id).toBe("tidal-wave");
    expect(loadProfile().achievements).toContain("tidal-wave");
    expect(loadProfile().gamesPlayed).toBe(0);
    expect(claimChallengeTurnAchievement(2500)).toBeNull();
  });

  it("awards a larger turn even when its weekly attempt does not beat the standing score", () => {
    // Standing total 5000, best turn 600; new total 4600, best turn 2600.
    raiseBestTurn(600);
    recordChallengeBestTurn(finishedAttempt(2600));
    expect(claimChallengeTurnAchievement(600)?.id).toBe("tidal-wave");
  });

  it("can recover the achievement from the server's completed-run summary", () => {
    expect(claimChallengeTurnAchievement(2500)?.id).toBe("tidal-wave");
    expect(claimChallengeTurnAchievement(2500)).toBeNull();
  });

  it("awards from the final verified position before any leaderboard refresh", () => {
    recordChallengeBestTurn(finishedAttempt(2500));
    expect(claimChallengeTurnAchievement(0)?.id).toBe("tidal-wave");
  });

  it("does not award an aggregate total or points lost to a bust", () => {
    const final = finishedAttempt(2450);
    final.state.log.push({ type: "bust", playerId: "you", lostPoints: 3000 });
    recordChallengeBestTurn(final);
    expect(final.state.players[0].total).toBeGreaterThan(2500);
    expect(claimChallengeTurnAchievement(2450)).toBeNull();
    expect(loadProfile().achievements).not.toContain("tidal-wave");
  });
});
