import { describe, expect, it } from "vitest";
import { rollCall } from "../../game/rollCall.js";
import { createChallengeFixture } from "./challengeFixtures.js";

describe("development challenge fixtures", () => {
  it("builds rare hands and hot dice with actual engine rolls", () => {
    expect(rollCall(createChallengeFixture("five").initial.state.turn)).toBe("five");
    expect(rollCall(createChallengeFixture("straight").initial.state.turn)).toBe("straight");
    expect(createChallengeFixture("hot").initial.state.turn.hotDice).toBe(true);
    expect(createChallengeFixture("bust").initial.state.turn.outcome).toBe("busted");
  });

  it("plays a real ten-turn run and exposes completion only after the last turn", async () => {
    const fixture = createChallengeFixture("initial");
    let view = fixture.initial;
    while (!view.complete) {
      view = await fixture.playMove("ROLL");
      if (!view.state.turn.outcome) view = await fixture.playMove("BANK");
    }
    expect(view.turns).toBe(10);
    expect(fixture.result.complete).toBe(true);
    expect(await fixture.resumeRun()).toBeNull();
  });

  it("starts the final scenario on the tenth turn with a clean mat", async () => {
    const fixture = createChallengeFixture("final");
    expect(fixture.initial.turns).toBe(9);
    expect(fixture.initial.state.turn.outcome).toBeNull();
    let view = await fixture.playMove("ROLL");
    if (!view.state.turn.outcome) view = await fixture.playMove("BANK");
    expect(view.complete).toBe(true);
    expect(view.turns).toBe(10);
  });

  it("keeps an accepted move after losing its reply, recoverable without a replay", async () => {
    const fixture = createChallengeFixture("initial");
    fixture.failNext = "lost";
    await expect(fixture.playMove("ROLL")).rejects.toThrow("accepted the move");
    expect(fixture.moves).toEqual(["ROLL"]);
    const recovered = await fixture.resumeRun();
    expect(recovered?.state.turn.rollCount).toBe(1);
    expect(fixture.moves).toHaveLength(1);
  });

  it("can fail before accepting a move and fail recovery once", async () => {
    const fixture = createChallengeFixture("initial");
    fixture.failNext = "before";
    await expect(fixture.playMove("ROLL")).rejects.toThrow("did not reach");
    expect(fixture.moves).toHaveLength(0);
    fixture.failNextRead = true;
    await expect(fixture.resumeRun()).rejects.toThrow("reconnect failed");
    expect(await fixture.resumeRun()).toEqual(fixture.initial);
  });
});
