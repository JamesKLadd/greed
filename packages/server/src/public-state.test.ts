import { describe, expect, it } from "vitest";
import { createRunGame } from "@greed/core";
import { publicGameState } from "./public-state.js";

describe("public game positions", () => {
  it("hides both prediction inputs without changing the authoritative position", () => {
    const state = createRunGame(8675309);
    const before = structuredClone(state);
    const wire = JSON.parse(JSON.stringify(publicGameState(state)));
    expect(wire.config.seed).toBe(0);
    expect(wire.rng).toBe(0);
    expect(wire.turn).toEqual(state.turn);
    expect(wire.players).toEqual(state.players);
    expect(state).toEqual(before);
    expect(state.config.seed).toBe(8675309);
    expect(state.rng).not.toBe(0);
  });

  it("can retain an opaque public game identity without exposing the RNG", () => {
    const state = createRunGame(8675309);
    const view = publicGameState(state, 1234);
    expect(view.config.seed).toBe(1234);
    expect(view.rng).toBe(0);
    expect(state.config.seed).toBe(8675309);
  });
});
