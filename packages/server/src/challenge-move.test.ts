/**
 * What a challenge move costs the player who is waiting on it.
 *
 * The reply to a move is the only thing standing between pressing Roll and
 * seeing the dice, so anything done before answering is time the player spends
 * looking at a still board. That matters beyond feel: a roll ends a run only by
 * BUSTING it, so work done on the last move of a run is work done on exactly
 * the reply whose slowness gives the result away. A player on turn 10 read the
 * pause and knew they had busted before the throw had played out.
 *
 * So these pin the shape of the reply rather than its contents: the move that
 * ends a run must ask the database for no more than any other move does.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";

const dailyStatus = vi.fn(async () => ({ board: "daily" }));
const weeklyStatus = vi.fn(async () => ({ board: "weekly" }));
/** A run that ends on this move — the expensive case, and the revealing one. */
const finished = { state: { turn: {} }, turns: 10, totalTurns: 10, complete: true };
const playDailyMove = vi.fn(async () => finished);
const playWeeklyMove = vi.fn(async () => finished);

vi.mock("./db.js", () => ({ accountsEnabled: () => true, query: async () => ({ rows: [] }) }));
vi.mock("./auth.js", () => ({ verifySession: () => ({ sub: "u1", username: "someone" }) }));
vi.mock("./daily.js", () => ({
  dailyStatus,
  playDailyMove,
  resumeDailyRun: vi.fn(),
  startDailyRun: vi.fn(),
}));
vi.mock("./weekly.js", () => ({
  weeklyStatus,
  playWeeklyMove,
  resumeWeeklyRun: vi.fn(),
  startWeeklyRun: vi.fn(),
}));

const { handleApi } = await import("./http-api.js");

/** A POST of one move, with the reply captured. */
async function move(path: string): Promise<{ code: number; body: unknown }> {
  // A real stream, because readBody listens for "data" and "end" rather than
  // iterating — a hand-rolled object that only looks like a request answers a
  // different question than the one being asked here.
  const req = Object.assign(Readable.from([Buffer.from(JSON.stringify({ move: "ROLL" }))]), {
    url: path,
    method: "POST",
    headers: { authorization: "Bearer t", "content-type": "application/json" },
    socket: { remoteAddress: "1.2.3.4" },
  }) as unknown as IncomingMessage;

  let code = 0;
  let body = "";
  const res = {
    setHeader: () => {},
    writeHead: (c: number) => {
      code = c;
    },
    end: (b?: string) => {
      body = b ?? "";
    },
  } as unknown as ServerResponse;

  await handleApi(req, res);
  return { code, body: body ? JSON.parse(body) : null };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the move that ends a run", () => {
  it("answers the weekly without reading the board first", async () => {
    const { code, body } = await move("/api/weekly/move");
    expect(code).toBe(200);
    expect(playWeeklyMove).toHaveBeenCalledOnce();
    // The board is seven sequential queries. None of them belong in front of
    // the reply the player is waiting on — the screen re-reads the board when
    // the run finishes, which is a moment later and off the critical path.
    expect(weeklyStatus).not.toHaveBeenCalled();
    expect(body).toEqual(finished);
  });

  it("answers the daily the same way", async () => {
    const { code, body } = await move("/api/daily/move");
    expect(code).toBe(200);
    expect(playDailyMove).toHaveBeenCalledOnce();
    expect(dailyStatus).not.toHaveBeenCalled();
    expect(body).toEqual(finished);
  });
});
