import { describe, it, expect } from "vitest";
import { applyAction, createGame, currentPlayer, getLegalActions } from "./game.js";
import type { GameState, PlayerConfig } from "./types.js";

function players(n: number): PlayerConfig[] {
  return Array.from({ length: n }, (_, i) => ({
    id: String.fromCharCode(65 + i), // A, B, C, D...
    name: `P${i}`,
    isBot: false,
  }));
}

/**
 * Force the current player to bank exactly `points`, then advance to the next
 * turn (bypasses random rolls). Banking no longer auto-advances, so tests
 * explicitly ADVANCE unless the bank ended the game (P1 auto-win).
 */
function forceBank(state: GameState, points: number): GameState {
  const s: GameState = structuredClone(state);
  s.turn.turnScore = points;
  let next = applyAction(s, { type: "BANK" });
  if (next.phase !== "game-over") next = applyAction(next, { type: "ADVANCE" });
  return next;
}

function eventTypes(state: GameState): string[] {
  return state.log.map((e) => e.type);
}

describe("createGame", () => {
  it("rejects fewer than 2 or more than 8 players", () => {
    expect(() => createGame(players(1), { goal: 2000, seed: 1 })).toThrow();
    expect(() => createGame(players(9), { goal: 2000, seed: 1 })).toThrow();
  });

  it("puts the starting player first in the order", () => {
    const g = createGame(players(4), { goal: 2000, seed: 1, startIndex: 2 });
    expect(g.order[0]).toBe(2);
    expect(g.order).toEqual([2, 3, 0, 1]);
    expect(currentPlayer(g).id).toBe("C");
  });

  it("cannot bank before rolling", () => {
    const g = createGame(players(2), { goal: 2000, seed: 1, startIndex: 0 });
    expect(getLegalActions(g).canBank).toBe(false);
    expect(getLegalActions(g).canRoll).toBe(true);
  });
});

describe("endgame - the final turn belongs to the last seat", () => {
  it("finishes the round through the last player; the starter does not go again", () => {
    let g = createGame(players(4), { goal: 2000, seed: 1, startIndex: 0 });
    // order = [A, B, C, D]; A starts, D is the last seat (to A's right).
    expect(currentPlayer(g).id).toBe("A");

    g = forceBank(g, 100); // A opens the round
    expect(currentPlayer(g).id).toBe("B");

    g = forceBank(g, 2000); // B triggers the endgame
    expect(eventTypes(g)).toContain("endgame-triggered");
    expect(g.endgame.triggerPlayerId).toBe("B");
    expect(currentPlayer(g).id).toBe("C"); // B does not play again

    g = forceBank(g, 300); // C final turn
    expect(currentPlayer(g).id).toBe("D");

    expect(g.phase).toBe("playing");
    g = forceBank(g, 300); // D is the last seat -> game ends after D

    expect(g.phase).toBe("game-over");
    expect(g.winnerId).toBe("B"); // B's 2000 is the highest; A never got a final turn
  });

  it("ends immediately when the last seat triggers the endgame", () => {
    let g = createGame(players(4), { goal: 2000, seed: 1, startIndex: 0 });
    g = forceBank(g, 100); // A
    g = forceBank(g, 100); // B
    g = forceBank(g, 100); // C
    g = forceBank(g, 2000); // D (last seat) triggers -> nobody follows
    expect(g.phase).toBe("game-over");
    expect(g.winnerId).toBe("D");
  });
});

describe("endgame - P1 auto-win", () => {
  it("ends immediately when the starting player is first to the goal", () => {
    let g = createGame(players(4), { goal: 2000, seed: 1, startIndex: 0 });
    g = forceBank(g, 2000); // A (P1) reaches goal first
    expect(eventTypes(g)).toContain("auto-win");
    expect(g.phase).toBe("game-over");
    expect(g.winnerId).toBe("A");
  });

  it("a later goal-reacher does not auto-win; highest total wins", () => {
    let g = createGame(players(4), { goal: 2000, seed: 1, startIndex: 0 });
    g = forceBank(g, 100); // A
    g = forceBank(g, 100); // B
    g = forceBank(g, 2000); // C triggers
    g = forceBank(g, 2100); // D (last) overtakes on the final turn
    expect(eventTypes(g)).not.toContain("auto-win");
    expect(g.phase).toBe("game-over");
    expect(g.winnerId).toBe("D"); // 2100 > C's 2000
  });
});

describe("endgame - tie triggers sudden death", () => {
  it("resolves a tie for the lead with an extra round", () => {
    let g = createGame(players(4), { goal: 2000, seed: 1, startIndex: 0 });
    g = forceBank(g, 500); // A = 500
    g = forceBank(g, 500); // B = 500
    g = forceBank(g, 2000); // C triggers, C = 2000
    g = forceBank(g, 2000); // D (last) ties C at 2000 -> game would end

    expect(g.phase).toBe("sudden-death");
    expect(eventTypes(g)).toContain("sudden-death");
    // Contenders C and D, in turn order, C first.
    expect(currentPlayer(g).id).toBe("C");

    g = forceBank(g, 100); // C = 2100
    expect(currentPlayer(g).id).toBe("D");
    g = forceBank(g, 50); // D = 2050

    expect(g.phase).toBe("game-over");
    expect(g.winnerId).toBe("C");
  });
});

describe("turn stays visible until advanced", () => {
  it("a bust holds the losing roll (outcome set) until ADVANCE", () => {
    let g = createGame(players(2), { goal: 2000, seed: 7, startIndex: 0 });
    // Roll until this turn busts; the turn should not switch on its own.
    let guard = 0;
    while (!g.turn.outcome && guard++ < 50) {
      g = applyAction(g, { type: "ROLL" });
    }
    if (g.turn.outcome === "busted") {
      expect(g.turn.playerIndex).toBe(0); // still the same player's turn
      expect(getLegalActions(g).canAdvance).toBe(true);
      expect(getLegalActions(g).canRoll).toBe(false);
      g = applyAction(g, { type: "ADVANCE" });
      expect(g.turn.playerIndex).toBe(1); // now it advances
    }
  });
});

describe("full random games terminate with a valid winner", () => {
  function autoPlay(seed: number): GameState {
    let g = createGame(players(4), { goal: 2000, seed });
    let guard = 0;
    while (g.phase !== "game-over" && guard++ < 100000) {
      const la = getLegalActions(g);
      if (la.canAdvance) {
        g = applyAction(g, { type: "ADVANCE" });
      } else if (la.canBank && g.turn.turnScore >= 300) {
        g = applyAction(g, { type: "BANK" });
      } else if (la.canRoll) {
        g = applyAction(g, { type: "ROLL" });
      } else {
        break;
      }
    }
    return g;
  }

  it("100 seeded games all end with a winner at or above the goal", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const g = autoPlay(seed);
      expect(g.phase).toBe("game-over");
      expect(g.winnerId).not.toBeNull();
      const winner = g.players.find((p) => p.id === g.winnerId)!;
      expect(winner.total).toBeGreaterThanOrEqual(g.config.goal);
    }
  });
});
