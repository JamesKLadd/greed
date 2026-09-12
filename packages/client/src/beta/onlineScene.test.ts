import { describe, expect, it } from "vitest";
import { createGame, type GameState } from "@greed/core";
import { cleanBetaLook } from "@greed/protocol";
import { DEFAULT_APPEARANCE, appearanceVars } from "./appearance.js";
import { canActOnline, onlineAppearance, onlineScenePlayers } from "./onlineScene.js";
import { sceneSeatOrder } from "./tableSceneGeometry.js";

const game = (): GameState =>
  createGame(
    [
      { id: "beta", name: "Beta player", isBot: false },
      { id: "classic", name: "Classic player", isBot: false },
      { id: "bot", name: "Bot", isBot: true },
    ],
    { goal: 3000, seed: 1, startIndex: 0 },
  );
const betaLook = cleanBetaLook({
  ...DEFAULT_APPEARANCE,
  mascot: "cat",
  dice: "circuit",
  frame: "neon",
  background: "stars",
  nameplate: "ticket",
})!;

describe("online table presentation ownership", () => {
  it("uses the throwing player's dice while keeping the viewer's table", () => {
    const viewer = { ...DEFAULT_APPEARANCE, table: "afterhours", dice: "volcanic" };
    const beta = onlineAppearance(
      viewer,
      "beta",
      { beta: "ivory", classic: "gold" },
      { beta: betaLook },
    );
    const classic = onlineAppearance(
      viewer,
      "classic",
      { beta: "ivory", classic: "gold" },
      { beta: betaLook },
    );
    expect(beta.dice).toBe("circuit");
    expect(classic.dice).toBe("gold");
    expect(beta.table).toBe("afterhours");
    expect(classic.table).toBe("afterhours");
    expect(appearanceVars(beta)["--felt-1" as keyof ReturnType<typeof appearanceVars>]).toEqual(
      appearanceVars(classic)["--felt-1" as keyof ReturnType<typeof appearanceVars>],
    );
    expect(viewer.dice).toBe("volcanic");
  });

  it("survives old snapshots and unknown appearance ids without copying the viewer's dice", () => {
    expect(onlineAppearance(DEFAULT_APPEARANCE, "old").dice).toBe("ivory");
    const missing = onlineScenePlayers(game());
    expect(missing.map((p) => p.id)).toEqual(["beta", "classic", "bot"]);
    expect(missing.every((p) => p.connected && Boolean(p.characterId))).toBe(true);
    const future = onlineScenePlayers(
      game(),
      {},
      {
        beta: { ...betaLook, mascot: "future-mascot", frame: "future-frame" },
      },
    );
    expect(future[0].look.mascot).toBe("fox");
    expect(future[0].look.frame).toBe("brass");
  });

  it("keeps per-player art, names and details identical for every viewing seat", () => {
    const state = game();
    const players = onlineScenePlayers(state, { classic: "panda" }, { beta: betaLook });
    expect(players[0]).toMatchObject({
      id: "beta",
      characterId: "cat",
      nameplate: "ticket",
      look: betaLook,
    });
    expect(players[1]).toMatchObject({ id: "classic", characterId: "panda" });
    const order = state.order.map((i) => state.players[i].id);
    for (const viewer of ["beta", "classic", undefined]) {
      const byId = new Map(players.map((p) => [p.id, p]));
      const visual = sceneSeatOrder(order, viewer).map((id) => byId.get(id)!);
      expect(visual.find((p) => p.id === "beta")?.look).toMatchObject(betaLook);
      expect(visual.find((p) => p.id === "classic")?.characterId).toBe("panda");
    }
  });

  it("keeps seats stable through turns, a disconnect and server autoplay takeover", () => {
    const state = game();
    const order = state.order.map((i) => state.players[i].id);
    const before = sceneSeatOrder(order, "classic");
    for (let playerIndex = 0; playerIndex < state.players.length; playerIndex++) {
      const next = { ...state, turn: { ...state.turn, playerIndex } };
      const players = onlineScenePlayers(
        next,
        {},
        { beta: betaLook },
        { classic: false, bot: false },
      );
      expect(players[1].connected).toBe(false);
      expect(players[2].connected).toBe(true);
      expect(players[0].characterId).toBe("cat");
      expect(
        sceneSeatOrder(
          next.order.map((i) => next.players[i].id),
          "classic",
        ),
      ).toEqual(before);
    }
  });

  it("anchors spectators to the first seat and uses the new order after a rematch", () => {
    const state = game();
    state.order = [1, 2, 0];
    const order = state.order.map((i) => state.players[i].id);
    expect(sceneSeatOrder(order)).toEqual(["classic", "bot", "beta"]);
    expect(sceneSeatOrder(order, "beta")[0]).toBe("beta");
    state.order = [2, 0, 1];
    const rematchOrder = state.order.map((i) => state.players[i].id);
    expect(sceneSeatOrder(rematchOrder)[0]).toBe("bot");
    expect(sceneSeatOrder(rematchOrder, "beta")[0]).toBe("beta");
    expect(onlineScenePlayers(state, {}, { beta: betaLook })[0].characterId).toBe("cat");
  });

  it("grants actions only to a connected viewer who owns the active human seat", () => {
    const state = game();
    expect(canActOnline(state, "beta", false, false)).toBe(true);
    expect(canActOnline(state, "classic", false, false)).toBe(false);
    expect(canActOnline(state, null, true, false)).toBe(false);
    expect(canActOnline(state, "beta", true, false)).toBe(false);
    expect(canActOnline(state, "beta", false, true)).toBe(false);
    expect(canActOnline({ ...state, phase: "game-over" }, "beta", false, false)).toBe(false);
    expect(
      canActOnline({ ...state, turn: { ...state.turn, playerIndex: 2 } }, "bot", false, false),
    ).toBe(false);
  });
});
