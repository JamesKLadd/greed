import { describe, expect, it } from "vitest";
import {
  WEEKLY_ATTEMPTS,
  WEEKLY_CAP_FROM,
  WEEKLY_TURNS,
  msUntilNextWeek,
  scoreWeeklyRun,
  weekKey,
  WEEKLY_ATTEMPTS_PER_DAY,
  WEEKLY_DAILY_CAP_FROM,
  weeklyAllowance,
  weeklyPosition,
  type WeeklyMove,
} from "./weekly.js";
import { dailyKey } from "./daily.js";

/** Roll until the turn is worth `bankAt`, then bank — a whole run's moves. */
function play(bankAt: number, seed: number): WeeklyMove[] {
  const moves: WeeklyMove[] = [];
  for (let guard = 0; guard < 400; guard++) {
    const pos = weeklyPosition(seed, moves);
    if (pos.result.complete) break;
    const start = pos.state.turn.outcome ? null : pos.state.turn;
    moves.push(start && start.turnScore >= bankAt ? "BANK" : "ROLL");
  }
  return moves;
}

describe("weekKey", () => {
  it("names a week by the Monday it starts on", () => {
    // Sunday is the LAST day of its week, not the first: the reset is the
    // midnight that ends Sunday, so Sunday still belongs to the week before.
    expect(weekKey(new Date("2026-08-30T17:00:00Z"))).toBe("2026-08-24"); // a Sunday
    expect(weekKey(new Date("2026-08-24T17:00:00Z"))).toBe("2026-08-24"); // its Monday
    expect(weekKey(new Date("2026-08-27T17:00:00Z"))).toBe("2026-08-24"); // mid-week
  });

  it("turns the week over at Central midnight on Monday, not UTC midnight", () => {
    // Summer (CDT, UTC-5): Monday begins at 05:00Z.
    expect(weekKey(new Date("2026-08-31T04:59:59Z"))).toBe("2026-08-24");
    expect(weekKey(new Date("2026-08-31T05:00:00Z"))).toBe("2026-08-31");
    // Sunday evening Central is already Monday in UTC — the case a player
    // actually hits, and the one a UTC key would get wrong.
    expect(weekKey(new Date("2026-08-31T02:00:00Z"))).toBe("2026-08-24");
  });

  it("rolls over month and year ends like any other week", () => {
    // A week that straddles New Year keeps the December Monday that named it.
    expect(weekKey(new Date("2027-01-01T12:00:00Z"))).toBe("2026-12-28");
    expect(weekKey(new Date("2027-01-04T06:00:00Z"))).toBe("2027-01-04");
    // And one that straddles a month end.
    expect(weekKey(new Date("2026-09-01T12:00:00Z"))).toBe("2026-08-31");
  });

  it("agrees with the daily on the day a week begins", () => {
    // Both challenges reset on the same clock, so the Monday the weekly names
    // must be the day the daily is naming at that instant.
    const mondayMidnight = new Date("2026-08-31T05:00:00Z");
    expect(weekKey(mondayMidnight)).toBe(dailyKey(mondayMidnight));
  });
});

describe("msUntilNextWeek", () => {
  it("counts down to Monday midnight Central, through both offsets", () => {
    // 23:30 Central on the Sunday of an August week is 04:30Z on the Monday.
    expect(msUntilNextWeek(new Date("2026-08-31T04:30:00Z"))).toBe(30 * 60 * 1000);
    // The same wall-clock moment in winter is an hour later in UTC.
    expect(msUntilNextWeek(new Date("2026-01-12T05:30:00Z"))).toBe(30 * 60 * 1000);
    // A whole week remains at the stroke of Monday midnight.
    expect(msUntilNextWeek(new Date("2026-08-31T05:00:00Z"))).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("never runs out while the week it belongs to is still current", () => {
    // The countdown drives the "new challenge in…" clock, so a zero or negative
    // reading would show a finished timer on a live week. Includes both DST
    // switchovers, where the week is 167 and 169 hours long.
    for (const iso of [
      "2026-08-24T05:00:00.000Z", // the stroke of a Monday
      "2026-08-27T12:34:56.789Z",
      "2026-08-31T04:59:59.999Z", // the last millisecond of a week
      "2026-03-08T09:30:00.000Z", // spring forward, mid-week
      "2026-11-01T08:30:00.000Z", // fall back, mid-week
      "2027-01-01T12:00:00.000Z", // a week straddling New Year
    ]) {
      const now = new Date(iso);
      const ms = msUntilNextWeek(now);
      expect(ms, iso).toBeGreaterThan(0);
      expect(weekKey(new Date(now.getTime() + ms)), iso).not.toBe(weekKey(now));
      expect(weekKey(new Date(now.getTime() + ms - 1)), iso).toBe(weekKey(now));
    }
  });

  it("makes a week exactly 167 or 169 hours long across a DST switch", () => {
    // Proof the boundary tracks the zone rather than a fixed offset: the week
    // containing a switch is an hour short or an hour long, like the day is.
    const spring = msUntilNextWeek(new Date("2026-03-02T06:00:00Z")); // Monday 00:00 CST
    expect(spring).toBe(167 * 60 * 60 * 1000);
    const fall = msUntilNextWeek(new Date("2026-10-26T05:00:00Z")); // Monday 00:00 CDT
    expect(fall).toBe(169 * 60 * 60 * 1000);
  });
});

describe("a weekly run", () => {
  it("is deterministic: the same moves always score the same", () => {
    const moves = play(300, 12345);
    expect(scoreWeeklyRun(12345, moves)).toEqual(scoreWeeklyRun(12345, moves));
  });

  it("plays exactly WEEKLY_TURNS turns however many moves are sent", () => {
    const moves = [...play(300, 7), ...(Array(50).fill("ROLL") as WeeklyMove[])];
    const r = scoreWeeklyRun(7, moves);
    expect(r.turns).toBe(WEEKLY_TURNS);
    expect(r.complete).toBe(true);
    expect(r.banks + r.busts).toBe(WEEKLY_TURNS);
  });

  it("gives each attempt its own dice, so a week cannot be scouted", () => {
    // Unlimited attempts buy more rolls of the dice, never a second look at the
    // same ones — which is the whole reason the seed is per-attempt and secret.
    const first = weeklyPosition(101, ["ROLL"]).state.turn.dice.join("");
    const second = weeklyPosition(202, ["ROLL"]).state.turn.dice.join("");
    expect(first).not.toBe(second);
  });

  it("cannot be inflated by a doctored move list", () => {
    // The score is derived by replaying the moves, so illegal ones are dropped
    // rather than credited — a forged submission is worth no more than what it
    // could actually have played.
    const honest = scoreWeeklyRun(99, play(300, 99));
    const doctored = scoreWeeklyRun(99, [
      ...play(300, 99),
      ...(Array(200).fill("BANK") as WeeklyMove[]),
    ]);
    expect(doctored.score).toBe(honest.score);
  });

  it("an empty attempt scores zero and is not complete", () => {
    const r = scoreWeeklyRun(1, []);
    expect(r.score).toBe(0);
    expect(r.complete).toBe(false);
  });

  it("replays a five of a kind built by hand rather than busting on it", () => {
    // The bug as a player met it, through the path the server actually uses:
    // the opening throw of this seed is 3,3,3,3,2, the triple locks three of
    // the 3s, and the fourth is held by hand (H3) before throwing the last die
    // — which comes up 3. A single 3 pays nothing on its own, so the throw
    // scored zero and the run was busted by five of a kind.
    const SEED = 376;
    expect(weeklyPosition(SEED, ["ROLL"]).state.turn.dice).toEqual([3, 3, 3, 3, 2]);

    const pos = weeklyPosition(SEED, ["ROLL", "H3", "ROLL"]);
    expect(pos.state.turn.dice).toEqual([3, 3, 3, 3, 3]);
    expect(pos.state.turn.outcome).toBeNull();
    expect(pos.state.turn.turnScore).toBe(1000);

    // And it banks for what it is worth, since a score the server derives from
    // a replay is the only score there is.
    expect(scoreWeeklyRun(SEED, ["ROLL", "H3", "ROLL", "BANK"]).score).toBe(1000);
  });
});

describe("weeklyAllowance", () => {
  it("grants ten a day from the week the daily ration starts", () => {
    expect(weeklyAllowance(WEEKLY_DAILY_CAP_FROM)).toEqual({
      limit: WEEKLY_ATTEMPTS_PER_DAY,
      per: "day",
    });
    expect(weeklyAllowance("2026-09-28")).toEqual({ limit: WEEKLY_ATTEMPTS_PER_DAY, per: "day" });
    expect(weeklyAllowance("2027-01-04")).toEqual({ limit: WEEKLY_ATTEMPTS_PER_DAY, per: "day" });
  });

  it("keeps the one week that was played at fifty a week", () => {
    // That week was announced in an update log and played under it. It is over
    // by the time this reads it, but its board is still there to be read, and a
    // rule that forgot it would describe it wrongly.
    expect(weeklyAllowance(WEEKLY_CAP_FROM)).toEqual({ limit: WEEKLY_ATTEMPTS, per: "week" });
  });

  it("leaves every week before any cap unlimited", () => {
    // Weeks played under the old promise keep it. Someone part-way through the
    // week the cap was written in may already hold more than fifty attempts,
    // and taking those back is not something a rule change gets to do.
    expect(weeklyAllowance("2026-09-07")).toEqual({ limit: null, per: null });
    expect(weeklyAllowance("2026-08-31")).toEqual({ limit: null, per: null });
  });

  it("gives a period exactly when it gives a limit", () => {
    // The two are read together everywhere — a limit with no period cannot be
    // described, and a period with no limit describes nothing.
    for (const week of ["2026-08-31", WEEKLY_CAP_FROM, WEEKLY_DAILY_CAP_FROM, "2030-06-03"]) {
      const a = weeklyAllowance(week);
      expect(a.limit === null, week).toBe(a.per === null);
    }
  });

  it("turns over on a Monday, like everything else about a week", () => {
    // Both cutovers are week keys rather than dates, so they can only ever land
    // on a boundary — a rule that began mid-week would change the terms of a
    // week already being played.
    expect(weekKey(new Date(`${WEEKLY_CAP_FROM}T12:00:00Z`))).toBe(WEEKLY_CAP_FROM);
    expect(weekKey(new Date(`${WEEKLY_DAILY_CAP_FROM}T12:00:00Z`))).toBe(WEEKLY_DAILY_CAP_FROM);
  });

  it("changes the ration a week after introducing one, not in the same week", () => {
    expect(WEEKLY_DAILY_CAP_FROM > WEEKLY_CAP_FROM).toBe(true);
  });
});
