import { describe, it, expect } from "vitest";
import { applyAction, createGame, isWinner, rivalBest, scoreFor } from "./game.js";
import type { GameState, PlayerConfig } from "./types.js";

/** n seats alternating sides 0,1,0,1… by list position. */
function teamPlayers(n: number): PlayerConfig[] {
  return Array.from({ length: n }, (_, i) => ({
    id: String.fromCharCode(65 + i), // A, B, C, D…
    name: `P${i}`,
    isBot: false,
    team: i % 2,
  }));
}

function forceBank(state: GameState, points: number): GameState {
  const s: GameState = structuredClone(state);
  s.turn.turnScore = points;
  let next = applyAction(s, { type: "BANK" });
  if (next.phase !== "game-over") next = applyAction(next, { type: "ADVANCE" });
  return next;
}

/** Pass the turn with nothing banked (banking 0 is not a legal action). */
function forceSkip(state: GameState): GameState {
  let next = applyAction(state, { type: "SKIP" });
  if (next.phase !== "game-over") next = applyAction(next, { type: "ADVANCE" });
  return next;
}

function teamOfSeat(state: GameState, id: string): number {
  return state.players.find((p) => p.id === id)!.team!;
}

describe("team setup validation", () => {
  it("accepts tables of 4 and 6", () => {
    expect(() => createGame(teamPlayers(4), { goal: 3000, seed: 1 })).not.toThrow();
    expect(() => createGame(teamPlayers(6), { goal: 3000, seed: 1 })).not.toThrow();
  });

  it("rejects table sizes that cannot split into two equal sides", () => {
    // 2 and 8 are legal free-for-all sizes but not legal team sizes.
    expect(() => createGame(teamPlayers(2), { goal: 3000, seed: 1 })).toThrow();
    expect(() => createGame(teamPlayers(8), { goal: 3000, seed: 1 })).toThrow();
  });

  it("rejects a half-teamed table", () => {
    const mixed = teamPlayers(4);
    delete mixed[3].team;
    expect(() => createGame(mixed, { goal: 3000, seed: 1 })).toThrow();
  });

  it("rejects lopsided sides", () => {
    const lopsided = teamPlayers(4);
    lopsided[3].team = 0; // 3 v 1
    expect(() => createGame(lopsided, { goal: 3000, seed: 1 })).toThrow();
  });

  it("leaves a free-for-all untouched", () => {
    const g = createGame(
      teamPlayers(4).map((p) => ({ ...p, team: undefined })),
      { goal: 3000, seed: 1 },
    );
    expect(g.teams).toBeNull();
    expect(g.winnerTeam).toBeNull();
  });
});

describe("turn order", () => {
  it("alternates sides so partners never act back to back", () => {
    for (const n of [4, 6]) {
      for (let seed = 1; seed <= 40; seed++) {
        const g = createGame(teamPlayers(n), { goal: 3000, seed });
        const sides = g.order.map((i) => g.players[i].team);
        for (let k = 1; k < sides.length; k++) {
          expect(sides[k], `n=${n} seed=${seed} order=${g.order}`).not.toBe(sides[k - 1]);
        }
      }
    }
  });

  it("still seats every player exactly once", () => {
    const g = createGame(teamPlayers(6), { goal: 3000, seed: 7 });
    expect([...g.order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe("a side shares one score", () => {
  it("scoreFor reports the side total, not the seat total", () => {
    let g = createGame(teamPlayers(4), { goal: 3000, seed: 3, startIndex: 0 });
    const first = g.order[0];
    g = forceBank(g, 500);
    // The banker's own total is 500, but their side is also worth 500 so far.
    expect(g.players[first].total).toBe(500);
    expect(scoreFor(g, first)).toBe(500);

    const partner = g.teams![g.players[first].team!].find((i) => i !== first)!;
    // A partner who has banked nothing still shares the side's score.
    expect(g.players[partner].total).toBe(0);
    expect(scoreFor(g, partner)).toBe(500);
  });

  it("rivalBest ignores teammates", () => {
    let g = createGame(teamPlayers(4), { goal: 3000, seed: 3, startIndex: 0 });
    const a = g.order[0];
    g = forceBank(g, 900); // side of `a` now on 900
    const opponent = g.order[1];
    expect(g.players[opponent].team).not.toBe(g.players[a].team);
    expect(rivalBest(g, opponent)).toBe(900);
    // From `a`'s own seat the 900 is their own side, so their rival is still on 0.
    expect(rivalBest(g, a)).toBe(0);
  });
});

describe("winning as a side", () => {
  it("a partner's banking can carry the side over the goal", () => {
    let g = createGame(teamPlayers(4), { goal: 3000, seed: 5, startIndex: 0 });
    // Seats alternate, so order = [x, y, x's partner, y's partner].
    const [s0, s1, s2] = g.order;
    expect(g.players[s0].team).toBe(g.players[s2].team);

    g = forceBank(g, 1600); // side A: 1600
    g = forceBank(g, 100); // side B: 100
    g = forceBank(g, 1400); // s2 tops side A up to 3000 — the side reaches the goal

    expect(g.endgame.triggered).toBe(true);
    expect(scoreFor(g, s0)).toBe(3000);
    // Neither individual is anywhere near 3000.
    expect(g.players[s0].total).toBe(1600);
    expect(g.players[s2].total).toBe(1400);
    expect(g.phase).not.toBe("game-over");
    expect(g.players[s1].team).not.toBe(g.players[s0].team);
  });

  it("credits the win to the side, and every member of it counts as a winner", () => {
    let g = createGame(teamPlayers(4), { goal: 1000, seed: 5, startIndex: 0 });
    const last = g.order[3];
    g = forceBank(g, 100);
    g = forceBank(g, 100);
    g = forceBank(g, 100);
    g = forceBank(g, 1000); // the last seat carries its side past the goal -> auto-win

    expect(g.phase).toBe("game-over");
    expect(g.winnerTeam).toBe(g.players[last].team);
    const winners = g.players.filter((p) => p.team === g.winnerTeam);
    expect(winners).toHaveLength(2);
    for (const p of winners) expect(isWinner(g, p.id)).toBe(true);
    for (const p of g.players.filter((x) => x.team !== g.winnerTeam)) {
      expect(isWinner(g, p.id)).toBe(false);
    }
  });

  it("sends every member of both level sides to sudden death", () => {
    let g = createGame(teamPlayers(4), { goal: 1000, seed: 9, startIndex: 0 });
    // Both sides bank exactly 1000 across the round; the last seat closes it out.
    g = forceBank(g, 1000); // side A -> 1000, arms the endgame
    g = forceBank(g, 400); // side B -> 400
    g = forceSkip(g); // side A stands
    g = forceBank(g, 600); // side B -> 1000, round ends level

    expect(g.phase).toBe("sudden-death");
    expect(g.suddenDeath!.contenders).toHaveLength(4); // all four, not just two
  });

  it("isWinner falls back to the individual in a free-for-all", () => {
    let g = createGame(
      teamPlayers(4).map((p) => ({ ...p, team: undefined })),
      { goal: 500, seed: 5, startIndex: 0 },
    );
    const last = g.order[3];
    g = forceBank(g, 10);
    g = forceBank(g, 10);
    g = forceBank(g, 10);
    g = forceBank(g, 500);
    expect(g.phase).toBe("game-over");
    expect(g.winnerTeam).toBeNull();
    expect(isWinner(g, g.players[last].id)).toBe(true);
    expect(isWinner(g, g.players[g.order[0]].id)).toBe(false);
  });
});

describe("team games always terminate", () => {
  it("random play finishes with a winning side", () => {
    for (const n of [4, 6]) {
      for (let seed = 1; seed <= 25; seed++) {
        let g = createGame(teamPlayers(n), { goal: 2000, seed });
        for (let step = 0; step < 6000 && g.phase !== "game-over"; step++) {
          const legal = applyAction(g, { type: "ROLL" });
          g = legal;
          if (g.turn.outcome) {
            g = applyAction(g, { type: "ADVANCE" });
          } else if (g.turn.turnScore >= 400) {
            g = applyAction(g, { type: "BANK" });
            if (g.phase !== "game-over") g = applyAction(g, { type: "ADVANCE" });
          }
        }
        expect(g.phase, `n=${n} seed=${seed}`).toBe("game-over");
        expect(g.winnerTeam, `n=${n} seed=${seed}`).not.toBeNull();
        expect(teamOfSeat(g, g.winnerId!)).toBe(g.winnerTeam);
      }
    }
  });
});
