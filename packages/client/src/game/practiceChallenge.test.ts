import { describe, expect, it } from "vitest";
import { practiceChallenge, PRACTICE_TURNS } from "./practiceChallenge.js";

describe("offline practice challenge", () => {
  it("finishes after three resolved turns and cannot play beyond completion", async () => {
    const practice = practiceChallenge(42);
    for (let safety = 0; !practice.view().complete && safety < 100; safety++) {
      const view = practice.view();
      await practice.play(view.state.turn.lastRoll && !view.state.turn.outcome ? "BANK" : "ROLL");
    }
    expect(practice.result().complete).toBe(true);
    expect(practice.result().turns).toBe(PRACTICE_TURNS);
    const final = practice.view();
    expect(await practice.play("ROLL")).toEqual(final);
    expect(await practice.play("BANK")).toEqual(final);
  });
  it("keeps separate practice runs isolated", async () => {
    const first = practiceChallenge(42);
    const second = practiceChallenge(42);
    const fresh = second.view();
    await first.play("ROLL");
    expect(first.view()).not.toEqual(fresh);
    expect(second.view()).toEqual(fresh);
    expect(second.result().score).toBe(0);
  });
});
