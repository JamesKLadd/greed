import { useCallback, useLayoutEffect, useState } from "react";
import { weeklyAllowance } from "@greed/core";
import { BetaActiveContext } from "../../beta/BetaContext.js";
import { ChallengeRun } from "../../components/ChallengeRun.js";
import { loadSettings } from "../../game/settings.js";
import { useT } from "../../i18n/i18n.js";
import {
  CHALLENGE_SCENARIOS,
  createChallengeFixture,
  type ChallengeScenario,
  type ReplyFailure,
} from "./challengeFixtures.js";
import "./challengeReview.css";

function delayParam(params: URLSearchParams): number {
  return Math.max(0, Math.min(10_000, Number(params.get("delay")) || 0));
}

/** Ordinary ChallengeRun, served only by a local fixture: no account or earned progression. */
export default function ChallengeReview() {
  const t = useT();
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const [scenario, setScenario] = useState<ChallengeScenario>(
    CHALLENGE_SCENARIOS.find((item) => item === params.get("scenario")) ?? "initial",
  );
  const [beta, setBeta] = useState(!params.has("classic"));
  const [fixture, setFixture] = useState(() => {
    const created = createChallengeFixture(scenario);
    created.delay = delayParam(params);
    created.failNext =
      params.get("fail") === "lost" ? "lost" : params.get("fail") === "before" ? "before" : "none";
    created.failNextRead = params.has("read-fail");
    return created;
  });
  const [revision, setRevision] = useState(0);
  const [finished, setFinished] = useState(false);
  const [replyFailure, setReplyFailure] = useState<ReplyFailure>(fixture.failNext);
  const [readFailure, setReadFailure] = useState(fixture.failNextRead);
  const [delay, setDelay] = useState(fixture.delay);
  const [requests, setRequests] = useState(0);
  const [accepted, setAccepted] = useState(fixture.moves.length);
  const settings = loadSettings();
  const weekly = params.get("mode") === "weekly";
  const allowance = weeklyAllowance();
  const tagline = !weekly
    ? t("daily.tagline")
    : allowance.limit === null
      ? t("weekly.tagline")
      : t(allowance.per === "day" ? "weekly.tagline.capped.day" : "weekly.tagline.capped", {
          n: allowance.limit,
        });

  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.dataset.presentation;
    root.dataset.presentation = beta ? "beta" : "classic";
    return () => {
      if (previous === undefined) delete root.dataset.presentation;
      else root.dataset.presentation = previous;
    };
  }, [beta]);

  const reset = (nextScenario: ChallengeScenario = scenario) => {
    const next = createChallengeFixture(nextScenario);
    next.delay = delay;
    setScenario(nextScenario);
    setFixture(next);
    setFinished(false);
    setReplyFailure("none");
    setReadFailure(false);
    setRequests(0);
    setAccepted(next.moves.length);
    setRevision((current) => current + 1);
  };
  const playMove = useCallback(
    async (...args: Parameters<typeof fixture.playMove>) => {
      setRequests((current) => current + 1);
      try {
        return await fixture.playMove(...args);
      } finally {
        setReplyFailure(fixture.failNext);
        setAccepted(fixture.moves.length);
      }
    },
    [fixture],
  );
  const resumeRun = useCallback(async () => {
    try {
      return await fixture.resumeRun();
    } finally {
      setReadFailure(fixture.failNextRead);
    }
  }, [fixture]);
  const onFinished = useCallback(() => setFinished(true), []);

  return (
    <BetaActiveContext.Provider value={beta}>
      <main className="setup challenge-review">
        <header className="setup__hero">
          <h1 className="setup__logo">{t(weekly ? "weekly.title" : "daily.title")}</h1>
          <p className="setup__tagline">{tagline}</p>
        </header>
        <div className="daily__layout">
          <section className="setup__panel daily" aria-label="Challenge gameplay fixture">
            {!finished ? (
              <ChallengeRun
                key={revision}
                initial={fixture.initial}
                dice3d={!params.has("flat") && settings.dice3d}
                playMove={playMove}
                resumeRun={resumeRun}
                onFinished={onFinished}
              />
            ) : (
              <div className="daily__result" role="status">
                <div className="daily__score">{fixture.result.score}</div>
                <p className="daily__note">Fixture complete — no results recorded.</p>
                <p className="daily__note">
                  {fixture.result.turns} turns · {fixture.result.banks} banks ·{" "}
                  {fixture.result.busts} busts
                </p>
              </div>
            )}
          </section>
        </div>
        <details className="challenge-review__tools" open={params.has("tools")}>
          <summary>Development fixture controls</summary>
          <p>Real engine/controller; no API, attempt allowance, leaderboard or profile writes.</p>
          <div className="challenge-review__controls">
            <label>
              Scenario
              <select
                value={scenario}
                onChange={(event) => reset(event.target.value as ChallengeScenario)}
              >
                {CHALLENGE_SCENARIOS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Presentation
              <select
                value={beta ? "beta" : "classic"}
                onChange={(event) => setBeta(event.target.value === "beta")}
              >
                <option value="beta">Visual beta</option>
                <option value="classic">Classic</option>
              </select>
            </label>
            <label>
              Response delay (ms)
              <input
                type="number"
                min={0}
                max={10_000}
                step={100}
                value={delay}
                onChange={(event) => {
                  const value = Math.max(0, Math.min(10_000, Number(event.target.value) || 0));
                  setDelay(value);
                  fixture.delay = value;
                }}
              />
            </label>
            <label>
              Next move response
              <select
                value={replyFailure}
                onChange={(event) => {
                  const value = event.target.value as ReplyFailure;
                  setReplyFailure(value);
                  fixture.failNext = value;
                }}
              >
                <option value="none">Normal</option>
                <option value="before">Fail before acceptance</option>
                <option value="lost">Accept move, then lose reply</option>
              </select>
            </label>
          </div>
          <label className="challenge-review__check">
            <input
              type="checkbox"
              checked={readFailure}
              onChange={(event) => {
                setReadFailure(event.target.checked);
                fixture.failNextRead = event.target.checked;
              }}
            />
            Fail the next recovery read
          </label>
          <p data-fixture-requests={requests} data-fixture-accepted={accepted}>
            Move requests: {requests} · Accepted fixture moves: {accepted}
          </p>
          <button type="button" className="btn btn--ghost" onClick={() => reset()}>
            Restart fixture
          </button>
          <a href="/">Back to Greed</a>
        </details>
      </main>
    </BetaActiveContext.Provider>
  );
}
