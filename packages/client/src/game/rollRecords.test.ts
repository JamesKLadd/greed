import { beforeEach, describe, expect, it, vi } from "vitest";
import { runPosition, type RunMove } from "@greed/core";
import { ThrowCollector, rollGameFromState, type RollGame } from "@greed/bots";

const uploads: string[] = [];
let refuse = 0;
let offline = false;
vi.mock("../net/rollStats.js", () => ({
  uploadLocalGame: vi.fn(async (id: string) => {
    const { ApiError } = await import("../net/auth.js");
    if (offline) throw new ApiError(0, "offline");
    if (refuse > 0) {
      refuse -= 1;
      throw new ApiError(400, "no", "stats.invalid");
    }
    uploads.push(id);
  }),
}));

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  uploads.length = 0;
  refuse = 0;
  offline = false;
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  });
});

function game(): RollGame {
  const moves: RunMove[] = Array.from({ length: 30 }, () => ["ROLL", "BANK"] as RunMove[]).flat();
  const collector = new ThrowCollector(["you"]);
  const pos = runPosition(5, moves, 10, (b, a) => collector.observe(b, a));
  return rollGameFromState("local", pos.state, "you", collector.throwsFor("you"));
}

const { clearDeviceRollGames, deviceRollGames, flushRollUploads, recordLocalRollGame } =
  await import("./rollRecords.js");

describe("solo games waiting on the device", () => {
  it("a guest keeps them on the device; nothing is sent without an account", async () => {
    recordLocalRollGame(game());
    await flushRollUploads();
    expect(deviceRollGames()).toHaveLength(1);
    expect(uploads).toEqual([]);
  });

  it("an empty flush (signing in with nothing queued) does not jam later ones", async () => {
    store.set("greed:auth", "token");
    await flushRollUploads(); // nothing queued: finishes without awaiting
    recordLocalRollGame(game());
    await flushRollUploads();
    expect(uploads).toHaveLength(1);
    expect(deviceRollGames()).toEqual([]);
  });

  it("keeps a game the server could not be reached for, and drops one it refused", async () => {
    store.set("greed:auth", "token");
    offline = true;
    recordLocalRollGame(game());
    await flushRollUploads();
    expect(deviceRollGames()).toHaveLength(1);
    offline = false;
    refuse = 1;
    await flushRollUploads();
    expect(deviceRollGames()).toEqual([]);
    expect(uploads).toEqual([]);
  });

  it("signing out clears them", () => {
    recordLocalRollGame(game());
    clearDeviceRollGames();
    expect(deviceRollGames()).toEqual([]);
  });
});
