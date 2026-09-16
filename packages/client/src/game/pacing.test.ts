/**
 * The banners and the game loop have to agree about how long a beat is.
 *
 * They did not, and the symptom was a result still on screen over the wrong
 * player: a bank held for 3.1s and a bust for 3.5s while the next turn started
 * after 2.1s. The durations are derived from the pacing now, so this is here to
 * fail if either side is changed without the other.
 */

import { describe, expect, it } from "vitest";
import {
  BEAT_GAP_MS,
  BOT_THINK_MS,
  INTER_TURN_MS,
  ROLL_ANIM_MS,
  TURN_ACTION_MS,
} from "./pacing.js";
import { CELEBRATION_MS, TURN_ENDING } from "../beta/celebrations.js";
import type { CelebrationKind } from "../beta/celebrations.js";

const MID_TURN: CelebrationKind[] = ["score", "hot", "triple", "straight"];

describe("banner timings against the turn they belong to", () => {
  it("clears a turn-ending banner before the next player starts", () => {
    for (const kind of TURN_ENDING) {
      if (kind === "win") continue; // no turn follows a win
      expect(CELEBRATION_MS[kind], kind).toBeLessThanOrEqual(INTER_TURN_MS - BEAT_GAP_MS);
    }
  });

  it("clears a mid-turn banner before the next roll of that turn lands", () => {
    for (const kind of MID_TURN) {
      expect(CELEBRATION_MS[kind], kind).toBeLessThanOrEqual(TURN_ACTION_MS - BEAT_GAP_MS);
    }
  });

  it("never lets any banner but the winner's outlive a turn", () => {
    // The backstop. Whatever the budgets are, nothing except the end of the
    // game may still be up when the next player is rolling.
    for (const [kind, ms] of Object.entries(CELEBRATION_MS)) {
      if (kind === "win") continue;
      expect(ms, kind).toBeLessThan(INTER_TURN_MS);
    }
  });

  it("keeps a routine score the briefest thing on screen", () => {
    for (const [kind, ms] of Object.entries(CELEBRATION_MS)) {
      if (kind === "score") continue;
      expect(ms, kind).toBeGreaterThan(CELEBRATION_MS.score);
    }
  });

  it("gives every banner long enough to read", () => {
    // The other direction: bounded is not the same as blink-and-miss.
    for (const [kind, ms] of Object.entries(CELEBRATION_MS)) {
      expect(ms, kind).toBeGreaterThanOrEqual(1000);
    }
  });

  it("describes one action as the wait plus the throw it produces", () => {
    expect(TURN_ACTION_MS).toBe(BOT_THINK_MS + ROLL_ANIM_MS);
  });
});
