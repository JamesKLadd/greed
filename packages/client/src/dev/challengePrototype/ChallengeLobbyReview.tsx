import { useLayoutEffect, useState } from "react";
import { DAILY_TURNS, dailyKey, weekKey } from "@greed/core";
import { BetaActiveContext } from "../../beta/BetaContext.js";
import {
  ChallengeClocks,
  ChallengeEntry,
  ChallengeEntryDetails,
  ChallengeResult,
  ChallengeStandings,
  ChallengeSummaryStats,
} from "../../components/ChallengeLobby.js";
import { useI18n } from "../../i18n/i18n.js";
import { formatDay } from "../../i18n/dates.js";
import type { WeeklyEntry } from "../../net/weekly.js";
import type { DailyEntry } from "../../net/daily.js";
import { Button, Icon } from "../../ui/index.js";
import "./challengeLobbyReview.css";

const SCENARIOS = [
  "daily-entry",
  "daily-result",
  "weekly-entry",
  "weekly-result",
  "weekly-exhausted",
  "weekly-empty",
  "loading",
  "error",
  "signed-out",
] as const;
type Scenario = (typeof SCENARIOS)[number];

const best = { score: 4850, bestTurn: 1200, busts: 3, superBusts: 1, hotDice: 2 };
const latest = { score: 2450, bestTurn: 800, busts: 5, superBusts: 2, hotDice: 1 };
const entries: WeeklyEntry[] = [
  {
    username: "MidnightTableChampion",
    avatar: "fox",
    score: 7350,
    turns: 10,
    bestTurn: 1550,
    busts: 2,
    superBusts: 1,
    hotDice: 4,
    attempts: 18,
    wins: 8,
    rank: 1,
    crown: true,
  },
  {
    username: "YouAtTheFamilyTable",
    avatar: "bear",
    ...best,
    turns: 10,
    attempts: 24,
    wins: 2,
    rank: 2,
    you: true,
  },
  {
    username: "UneTrèsLongueTableFamiliale",
    avatar: "owl",
    score: 4350,
    turns: 10,
    bestTurn: 1100,
    busts: 4,
    superBusts: 0,
    hotDice: 2,
    attempts: 7,
    wins: 0,
    rank: 3,
  },
];
const dailyEntries: DailyEntry[] = entries.map(({ attempts: _attempts, ...entry }) => entry);

/** Shared lobby widgets with static sample data; no API, score submission, or progression. */
export default function ChallengeLobbyReview() {
  const { t, n, locale, setLocale } = useI18n();
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const [scenario, setScenario] = useState<Scenario>(
    SCENARIOS.find((item) => item === params.get("scenario")) ?? "daily-entry",
  );
  const [beta, setBeta] = useState(!params.has("classic"));
  const [selection, setSelection] = useState<string | null>(null);
  const [reading, setReading] = useState<WeeklyEntry | null>(null);
  const weekly = scenario.startsWith("weekly-") || params.get("mode") === "weekly";
  const mode = weekly ? "weekly" : "daily";
  const exhausted = scenario === "weekly-exhausted";
  const result = scenario === "daily-result" || scenario === "weekly-result" || exhausted;
  const loading = scenario === "loading";
  const error = scenario === "error";
  const signedOut = scenario === "signed-out";

  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.dataset.presentation;
    root.dataset.presentation = beta ? "beta" : "classic";
    return () => {
      if (previous === undefined) delete root.dataset.presentation;
      else root.dataset.presentation = previous;
    };
  }, [beta]);

  return (
    <BetaActiveContext.Provider value={beta}>
      <main className="setup setup--challenge challenge-lobby">
        {weekly && (
          <div className="challenge-lobby__top">
            <Button variant="ghost" onClick={() => setSelection(t("bar.home"))}>
              {t("bar.home")}
            </Button>
          </div>
        )}
        <header className="setup__hero">
          {!weekly && (
            <div className="challenge-lobby__nav">
              <Button variant="ghost" onClick={() => setSelection(t("bar.home"))}>
                {t("bar.home")}
              </Button>
              <span className="daily__day">{formatDay(dailyKey())}</span>
            </div>
          )}
          <h1 className="setup__logo">{t(weekly ? "weekly.title" : "daily.title")}</h1>
          <p className="setup__tagline">
            {weekly ? t("weekly.tagline.capped.day", { n: 10 }) : t("daily.tagline")}
          </p>
        </header>
        <div className="daily__layout">
          <section className="setup__panel daily" aria-label="Challenge lobby fixture">
            {weekly && (
              <div className="daily__head">
                <span className="daily__day">
                  {weekly
                    ? t("weekly.weekOf", { week: formatDay(weekKey()) })
                    : formatDay(dailyKey())}
                </span>
                {!signedOut && !loading && !error && (
                  <span className="daily__streak">
                    <Icon name="check" />
                    {t(weekly ? "weekly.streak" : "daily.streak", { n: weekly ? 3 : 7 })}
                  </span>
                )}
              </div>
            )}

            {loading ? (
              <p className="daily__note" role="status" aria-busy="true">
                {t(weekly ? "weekly.loading" : "daily.loading")}
              </p>
            ) : error ? (
              <div className="challenge-lobby__error" role="alert">
                <p>{t(weekly ? "weekly.loadFailed" : "daily.loadFailed")}</p>
                <Button
                  variant="ghost"
                  onClick={() => setScenario(weekly ? "weekly-entry" : "daily-entry")}
                >
                  {t("challenge.retry")}
                </Button>
              </div>
            ) : signedOut ? (
              <>
                <p className="daily__note">
                  {t(weekly ? "weekly.signInRequired" : "daily.signInRequired")}
                </p>
                <ChallengeEntry
                  label={t("home.signIn")}
                  onStart={() => setSelection(t("home.signIn"))}
                />
              </>
            ) : (
              <>
                {(weekly || !result) && (
                  <ChallengeEntry
                    label={
                      weekly ? t(result ? "weekly.playAgain" : "weekly.play") : t("daily.play")
                    }
                    intro={
                      result
                        ? undefined
                        : weekly
                          ? t("weekly.intro.capped.day", { turns: 10, n: 10 })
                          : t("daily.intro", { turns: DAILY_TURNS })
                    }
                    disabled={exhausted}
                    onStart={() => setSelection("Start selected; no attempt was opened.")}
                  >
                    {weekly ? (
                      <div className="challenge-lobby__allowance">
                        <p className={exhausted ? "daily__note daily__note--warn" : "daily__note"}>
                          {exhausted
                            ? t("weekly.attemptsGone.day", { total: 10 })
                            : t("weekly.attemptsLeft.day", { n: 3, total: 10 })}
                        </p>
                        <p className="daily__note daily__note--hint">
                          {t("weekly.attemptsMade", { n: n(result ? 24 : 17) })}
                        </p>
                      </div>
                    ) : (
                      <p className="daily__note daily__note--locked">
                        <Icon name="lock" /> {t("daily.boardLocked")}
                      </p>
                    )}
                    {weekly && (
                      <ChallengeClocks
                        items={[
                          { label: t("challenge.attemptsReset"), ms: 7_860_000 },
                          { label: t("challenge.weekCloses"), ms: 352_800_000 },
                        ]}
                      />
                    )}
                  </ChallengeEntry>
                )}

                {scenario === "weekly-result" && (
                  <div className="challenge-lobby__latest" role="status">
                    <span>{t("challenge.latestAttempt")}</span>
                    <strong>
                      {n(latest.score)} {t("challenge.points")}
                    </strong>
                    <p className="daily__note daily__note--hint">
                      {t("challenge.weeklyBestStands")}
                    </p>
                  </div>
                )}

                {result && (
                  <ChallengeResult
                    label={t(weekly ? "weekly.yourBest" : "challenge.dailyResult")}
                    score={best.score}
                    rankText={t(weekly ? "weekly.yourRank" : "daily.yourRank", {
                      rank: 2,
                      players: 128,
                    })}
                  >
                    <ChallengeSummaryStats result={best} />
                  </ChallengeResult>
                )}
                {result && !weekly && (
                  <p className="daily__note challenge-lobby__complete">{t("daily.played")}</p>
                )}

                {!weekly && (
                  <ChallengeClocks items={[{ label: t("daily.nextIn"), ms: 7_860_000 }]} />
                )}

                {(weekly || result) && (
                  <ChallengeStandings
                    mode={mode}
                    entries={scenario === "weekly-empty" ? [] : weekly ? entries : dailyEntries}
                    onRead={(entry) =>
                      setReading(
                        entries.find((sample) => sample.username === entry.username) ?? null,
                      )
                    }
                  />
                )}
              </>
            )}
            {!weekly && !signedOut && !loading && !error && (
              <div className="challenge-lobby__extras">
                <p className="daily__streak">
                  <Icon name="check" />
                  {t("daily.streak", { n: 7 })}
                </p>
              </div>
            )}
          </section>
        </div>
        {selection && (
          <p className="daily__note" role="status">
            {selection}
          </p>
        )}
      </main>

      <details className="lobby-review__tools">
        <summary>Lobby fixture controls</summary>
        <p>Static sample data through the real lobby components; no account or challenge writes.</p>
        <label>
          Scenario
          <select
            value={scenario}
            onChange={(event) => {
              setScenario(event.target.value as Scenario);
              setSelection(null);
              setReading(null);
            }}
          >
            {SCENARIOS.map((item) => (
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
          Language
          <select
            value={locale}
            onChange={(event) => setLocale(event.target.value as typeof locale)}
          >
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="fr">Français</option>
          </select>
        </label>
        <a href="?menu-preview">Beta menu preview</a>
        <a href="?challenge-play">Challenge gameplay preview</a>
        <a href="/">Return to game</a>
      </details>

      {reading && (
        <ChallengeEntryDetails
          mode={mode}
          entry={
            weekly
              ? reading
              : (dailyEntries.find((entry) => entry.username === reading.username) ?? reading)
          }
          players={128}
          onClose={() => setReading(null)}
        />
      )}
    </BetaActiveContext.Provider>
  );
}
