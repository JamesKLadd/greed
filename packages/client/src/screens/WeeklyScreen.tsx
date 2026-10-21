/**
 * The weekly challenge: the same ten-turn run as the daily, with a fresh seed
 * per attempt and the best attempt standing for the week.
 *
 * The differences from the daily screen are the ones that follow from that.
 * The board is on show from the first moment of the week rather than withheld
 * until you have played — with retries still to come, the score to beat is what
 * you are playing against, not something that spoils a single attempt. Another
 * go requires finishing the run already open and having attempts left under
 * the server's current allowance.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  WEEKLY_TURNS,
  dailyKey,
  msUntilNextDaily,
  msUntilNextWeek,
  weekKey,
  weeklyAllowance,
  type AttemptPeriod,
} from "@greed/core";
import { ChallengeRun } from "../components/ChallengeRun.js";
import { ChallengePersonalBest } from "../components/ChallengePersonalBest.js";
import {
  ChallengeClocks,
  ChallengeEntry,
  ChallengeEntryDetails,
  ChallengeResult,
  ChallengeStandings,
  ChallengeSummaryStats,
} from "../components/ChallengeLobby.js";
import type { RunView } from "../game/useChallengeRun.js";
import {
  claimChallengeTurnAchievement,
  recordChallengeBestTurn,
} from "../game/challengeProfile.js";
import { weeklyLobbyNeedsRefresh } from "../game/weeklyLobbyCalendar.js";
import {
  improvesPersonalBest,
  readScoreBaseline,
  weeklyScoreOutcome,
  type ScoreBaseline,
} from "../game/challengeScoreFeedback.js";
import { fetchWeeklyBest } from "../net/leaderboards.js";
import {
  fetchWeekly,
  playWeeklyMove,
  resumeWeekly,
  startWeekly,
  WeeklyUnavailable,
  type WeeklyEntry,
  type WeeklyRunView,
  type WeeklyStatus,
} from "../net/weekly.js";
import {
  awardAchievement,
  raiseBestTurn,
  setWeeklyWins,
  WEEKLY_STREAK_BADGES,
  type Achievement,
} from "../game/profile.js";
import { syncSteamAchievements } from "../game/steam.js";
import { claimHolidayDice } from "../game/holidayDice.js";
import { syncProfileUp } from "../net/auth.js";
import { Button, Icon } from "../ui/index.js";
import { ChallengeAvatar } from "../components/ChallengeAvatar.js";
import { useAuth } from "../game/auth.js";
import { loadSettings } from "../game/settings.js";
import { useI18n } from "../i18n/i18n.js";
import { apiErrorText } from "../i18n/apiError.js";
import { formatDay } from "../i18n/dates.js";
import type { MsgKey } from "../i18n/i18n.js";
import { recordGrowthEvent } from "../game/growth.js";

interface WeeklyScreenProps {
  onBack: () => void;
  onSignIn: () => void;
  onFriends: () => void;
}

/** A failed move is reconciled with a read, never by repeating the move. */
const resumeRun = async () => (await resumeWeekly()).run;
// Failure to load record history suppresses the marker, not the challenge.
const readPersonalBest = () => readScoreBaseline(fetchWeeklyBest);

export function WeeklyScreen({ onBack, onSignIn, onFriends }: WeeklyScreenProps) {
  const { t, n } = useI18n();
  const { status: authStatus, user } = useAuth();
  // Read per render, like the in-game shell, so a change in Settings takes
  // effect on the way back rather than on the next attempt.
  const { dice3d } = loadSettings();
  const [week, setWeek] = useState(() => weekKey());
  const loadedWeek = useRef(week);
  const [day, setDay] = useState(() => dailyKey());
  /**
   * What the MODE grants this week, worked out from the week itself.
   *
   * Separate from the limit the status reports, and used only for the tagline —
   * which is drawn on screens that have no status to read at all: signed out,
   * or talking to an API that has never heard of the weekly. The rule is a pure
   * function of the calendar, so those screens can still say what the mode is.
   * Anything about what THIS player has left comes from the server instead.
   */
  const weekRation = weeklyAllowance(week);
  /** The mode's own description, said the same way in all three places it appears. */
  const tagline =
    weekRation.limit === null
      ? t("weekly.tagline")
      : weekRation.per === "day"
        ? t("weekly.tagline.capped.day", { n: weekRation.limit })
        : t("weekly.tagline.capped", { n: weekRation.limit });
  const [status, setStatus] = useState<WeeklyStatus | null>(null);
  const [unlocked, setUnlocked] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Set when the deployed server has no weekly at all — see WeeklyUnavailable. */
  const [unavailable, setUnavailable] = useState(false);
  const [runView, setRunView] = useState<WeeklyRunView | null>(null);
  const [starting, setStarting] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  // Keep the just-finished score apart from the standing best. A weaker retry
  // remains a completed attempt even though it never replaces the board row.
  const [latestAttemptScore, setLatestAttemptScore] = useState<number | null>(null);
  const weeklyBestBeforeRun = useRef<number | null>(null);
  const personalBestBeforeRun = useRef<ScoreBaseline>(undefined);
  const [latestWeeklyBestBefore, setLatestWeeklyBestBefore] = useState<number | null>(null);
  const [latestPersonalBest, setLatestPersonalBest] = useState(false);
  const requestSession = useRef(0);
  /** The board row being read in close-up, if any. */
  const [reading, setReading] = useState<(WeeklyEntry & { friendsRank?: boolean }) | null>(null);

  /**
   * Fold everything the weekly can earn into the profile: the champion badge,
   * the podium badge, the streak badges and the count of weeks won.
   *
   * All of them settle when a WEEK does, not when an attempt does — a board
   * fills up over its week and everyone on it may still improve, so where you
   * stand on Tuesday is not a result. They therefore usually arrive on a later
   * visit than the run that earned them, which is why this runs on load rather
   * than only when an attempt finishes.
   */
  const claim = useCallback((next: WeeklyStatus) => {
    const ids: string[] = [];
    if (next.wins > 0) ids.push("weekly-champion");
    if (next.eliteEarned) ids.push("weekly-elite");
    for (const b of WEEKLY_STREAK_BADGES) {
      if (next.streak >= b.weeks) ids.push(b.id);
    }
    const won = ids.map(awardAchievement).filter((a): a is Achievement => a !== null);
    const turnAward = claimChallengeTurnAchievement(next.best?.bestTurn ?? 0);
    if (turnAward) won.push(turnAward);

    // The wins figure is the server's — only it can see where everyone else
    // finished. This is the local copy catching up, so the Stats screen agrees
    // now rather than after the next sign-in.
    const movedWins = setWeeklyWins(next.wins);

    if (won.length > 0) {
      setUnlocked((prev) => [...prev, ...won]);
      syncSteamAchievements(won.map((a) => a.id));
    }
    if (won.length > 0 || movedWins) void syncProfileUp();
  }, []);

  const fail = useCallback(
    (err: unknown) => {
      if (err instanceof WeeklyUnavailable) {
        setUnavailable(true);
        return;
      }
      setError(apiErrorText(t, err, "weekly.loadFailed"));
    },
    [t],
  );

  const load = useCallback(async () => {
    const session = requestSession.current;
    setLoading(true);
    setError(null);
    try {
      const [next, open, priorBest] = await Promise.all([
        fetchWeekly(),
        resumeWeekly(),
        readPersonalBest(),
      ]);
      if (session !== requestSession.current) return;
      if (next.week !== loadedWeek.current) {
        setLatestAttemptScore(null);
        setLatestPersonalBest(false);
      }
      weeklyBestBeforeRun.current = next.best?.score ?? null;
      personalBestBeforeRun.current = open.run?.complete ? undefined : priorBest;
      loadedWeek.current = next.week;
      setStatus(next);
      setWeek(next.week);
      setDay(dailyKey());
      setRefreshFailed(false);
      // Last week's board may have closed since the last visit.
      claim(next);
      // An attempt left half-played picks up exactly where it was left.
      setRunView(open.run);
    } catch (err) {
      if (session === requestSession.current) {
        setRefreshFailed(true);
        fail(err);
      }
    } finally {
      if (session === requestSession.current) setLoading(false);
    }
  }, [claim, fail]);

  useEffect(() => {
    requestSession.current += 1;
    setLatestPersonalBest(false);
    setLatestAttemptScore(null);
    setStarting(false);
    personalBestBeforeRun.current = undefined;
    if (authStatus === "authed") void load();
    else {
      setLoading(false);
      setStatus(null);
      setRunView(null);
      setLatestAttemptScore(null);
    }
    return () => {
      requestSession.current += 1;
    };
  }, [authStatus, user?.id, load]);

  /** An attempt is over: the server already has the score, so re-read it. */
  const onFinished = useCallback(
    async (final: RunView | null) => {
      const session = requestSession.current;
      if (final?.complete) recordGrowthEvent("weekly_completed");
      const improvedTurn = recordChallengeBestTurn(final);
      // A finished run is a game played, so on a holiday it earns the dice.
      const won = final?.complete
        ? [claimChallengeTurnAchievement(0), claimHolidayDice()].filter(
            (a): a is Achievement => a !== null,
          )
        : [];
      if (won.length > 0) {
        setUnlocked((prev) => [...prev, ...won]);
        syncSteamAchievements(won.map((a) => a.id));
      }
      if (improvedTurn || won.length > 0) void syncProfileUp();
      setRunView(null);
      setLatestAttemptScore(final?.complete ? final.state.players[0].total : null);
      setLatestWeeklyBestBefore(weeklyBestBeforeRun.current);
      setLatestPersonalBest(
        final?.complete
          ? improvesPersonalBest(final.state.players[0].total, personalBestBeforeRun.current)
          : false,
      );
      setLoading(true);
      setError(null);
      try {
        const next = await fetchWeekly();
        if (session !== requestSession.current) return;
        loadedWeek.current = next.week;
        setStatus(next);
        setWeek(next.week);
        setDay(dailyKey());
        setRefreshFailed(false);
        if (next.week !== week) {
          setLatestAttemptScore(null);
          setLatestPersonalBest(false);
        } else if (next.best?.score !== final?.state.players[0].total) {
          setLatestPersonalBest(false);
        }
        // A turn banked in an attempt counts toward the career best like any
        // other. The server has already folded it into the account (see
        // weekly.ts); this is the local copy catching up.
        const improved = next.best ? raiseBestTurn(next.best.bestTurn) : false;
        if (improved) void syncProfileUp();
        claim(next);
      } catch (err) {
        if (session === requestSession.current) {
          setRefreshFailed(true);
          fail(err);
        }
      } finally {
        if (session === requestSession.current) setLoading(false);
      }
    },
    [claim, fail, week],
  );

  /** Open an attempt. With one already open the server returns THAT one. */
  const begin = useCallback(async () => {
    const session = requestSession.current;
    setStarting(true);
    setError(null);
    try {
      const priorBest = await readPersonalBest();
      if (session !== requestSession.current) return;
      personalBestBeforeRun.current = priorBest;
      weeklyBestBeforeRun.current = status?.best?.score ?? null;
      const next = await startWeekly();
      if (session !== requestSession.current) return;
      setLatestAttemptScore(null);
      setLatestPersonalBest(false);
      setRunView(next);
      recordGrowthEvent("weekly_started");
    } catch (err) {
      if (session === requestSession.current) fail(err);
    } finally {
      if (session === requestSession.current) setStarting(false);
    }
  }, [fail, status?.best?.score]);

  const clocks = useWeeklyClocks(
    { week, day, period: status ? status.attemptPeriod : weekRation.per },
    runView !== null || starting,
    authStatus === "authed" && !loading,
    () => {
      setWeek(weekKey());
      setDay(dailyKey());
      setLatestAttemptScore(null);
      setLatestPersonalBest(false);
      void load();
    },
  );

  // Accounts are what make the board meaningful, so signed-out players see a
  // prompt rather than a run they couldn't submit.
  if (authStatus !== "authed") {
    return (
      <div className="setup setup--challenge challenge-lobby">
        <div className="setup__hero">
          <h1 className="setup__logo">{t("weekly.title")}</h1>
          <p className="setup__tagline">{tagline}</p>
        </div>
        <div className="setup__panel daily">
          <p className="daily__note" role={authStatus === "loading" ? "status" : undefined}>
            {t(authStatus === "loading" ? "weekly.loading" : "weekly.signInRequired")}
          </p>
          <div className="setup__actions">
            <Button variant="ghost" onClick={onBack}>
              {t("bar.home")}
            </Button>
            <Button variant="roll" disabled={authStatus === "loading"} onClick={onSignIn}>
              {t("home.signIn")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Both halves auto-deploy on a push, but the client lands first — so for a few
  // minutes after a release this screen is talking to an API that has never
  // heard of it. Said plainly rather than as an error, because nothing is wrong.
  if (unavailable) {
    return (
      <div className="setup setup--challenge challenge-lobby">
        <div className="setup__hero">
          <h1 className="setup__logo">{t("weekly.title")}</h1>
          <p className="setup__tagline">{tagline}</p>
        </div>
        <div className="setup__panel daily">
          <p className="daily__note">{t("weekly.notReady")}</p>
          <div className="setup__actions">
            <Button
              variant="roll"
              disabled={loading}
              onClick={() => {
                setUnavailable(false);
                void load();
              }}
            >
              {t("challenge.retry")}
            </Button>
            <Button variant="ghost" onClick={onBack}>
              {t("bar.home")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const champion = status?.champion ?? null;
  const best = status?.best ?? null;
  // Limits and consumption come from the server, including older weekly rules.
  const limit = status?.attemptLimit ?? null;
  const used = status?.attemptsUsed ?? 0;
  const perDay = status?.attemptPeriod === "day";
  const left = limit === null ? null : Math.max(0, limit - used);
  const spent = left === 0;
  const allowanceText =
    limit === null
      ? null
      : spent
        ? perDay
          ? t("weekly.attemptsGone.day", { total: limit })
          : t("weekly.attemptsGone", { total: limit })
        : perDay
          ? t("weekly.attemptsLeft.day", { n: left ?? 0, total: limit })
          : t("weekly.attemptsLeft", { n: left ?? 0, total: limit });
  const latestOutcome =
    latestAttemptScore !== null && best && !refreshFailed
      ? weeklyScoreOutcome(latestAttemptScore, latestWeeklyBestBefore, best.score)
      : null;

  return (
    <div className="setup setup--challenge challenge-lobby">
      <div className="challenge-lobby__top">
        <Button variant="ghost" onClick={onBack}>
          {t("bar.home")}
        </Button>
      </div>
      <div className="setup__hero">
        <h1 className="setup__logo">{t("weekly.title")}</h1>
        {!runView && <p className="setup__tagline">{tagline}</p>}
      </div>

      <div className="daily__layout">
        <div className="setup__panel daily">
          <div className="daily__head">
            <span className="daily__day">
              {t("weekly.weekOf", { week: formatDay(status?.week ?? week) })}
            </span>
            {!runView && status && status.streak > 0 && (
              <span className="daily__streak">
                <Icon name="check" /> {t("weekly.streak", { n: status.streak })}
              </span>
            )}
          </div>

          {error && (
            <div className="challenge-lobby__error" role="alert">
              <p>{error}</p>
              <Button variant="ghost" disabled={loading || starting} onClick={() => void load()}>
                {t("challenge.retry")}
              </Button>
            </div>
          )}
          {loading && (
            <p className="daily__note" role="status">
              {t("weekly.loading")}
            </p>
          )}

          {!loading && runView && (
            <ChallengeRun
              initial={runView}
              dice3d={dice3d}
              playMove={playWeeklyMove}
              resumeRun={resumeRun}
              onFinished={onFinished}
            />
          )}

          {!loading && !runView && (
            <>
              <ChallengeEntry
                label={
                  starting
                    ? t("challenge.starting")
                    : best
                      ? t("weekly.playAgain")
                      : t("weekly.play")
                }
                onStart={() => void begin()}
                disabled={spent || refreshFailed || status === null || error !== null}
                busy={starting}
                intro={
                  !best && status
                    ? limit === null
                      ? t("weekly.intro", { turns: WEEKLY_TURNS })
                      : perDay
                        ? t("weekly.intro.capped.day", { turns: WEEKLY_TURNS, n: limit })
                        : t("weekly.intro.capped", { turns: WEEKLY_TURNS, n: limit })
                    : undefined
                }
              >
                {status && !refreshFailed && (
                  <div className="challenge-lobby__allowance">
                    {allowanceText && (
                      <p className={spent ? "daily__note daily__note--warn" : "daily__note"}>
                        {allowanceText}
                      </p>
                    )}
                    <p className="daily__note daily__note--hint">
                      {t("weekly.attemptsMade", { n: n(status.attempts) })}
                    </p>
                  </div>
                )}
                <ChallengeClocks
                  items={[
                    ...(perDay ? [{ label: t("challenge.attemptsReset"), ms: clocks.daily }] : []),
                    { label: t("challenge.weekCloses"), ms: clocks.weekly },
                  ]}
                />
              </ChallengeEntry>

              {latestAttemptScore !== null && (
                <div className="challenge-lobby__latest" role="status">
                  <span>{t("challenge.latestAttempt")}</span>
                  <strong
                    className={latestPersonalBest ? "challenge-score-record__score" : undefined}
                  >
                    {n(latestAttemptScore)} {t("challenge.points")}
                  </strong>
                  {latestOutcome && (
                    <p className="daily__note daily__note--hint">
                      {latestOutcome.kind === "improved"
                        ? t("weekly.bestImproved", { gain: n(latestOutcome.gain) })
                        : latestOutcome.kind === "first"
                          ? t("weekly.bestSet")
                          : t("weekly.bestStands", { score: n(latestOutcome.score) })}
                    </p>
                  )}
                  {latestPersonalBest && !refreshFailed && <ChallengePersonalBest />}
                </div>
              )}

              {best && !refreshFailed && (
                <ChallengeResult
                  label={t("weekly.yourBest")}
                  score={best.score}
                  rankText={
                    status?.yourRank
                      ? t("weekly.yourRank", { rank: status.yourRank, players: status.players })
                      : undefined
                  }
                >
                  <ChallengeSummaryStats result={best} />
                </ChallengeResult>
              )}
            </>
          )}

          {!loading && status && !refreshFailed && (
            <ChallengeStandings
              mode="weekly"
              entries={status.leaderboard}
              friends={status.friendsLeaderboard}
              onFriends={onFriends}
              onRead={(entry, friendsRank) => setReading({ ...entry, friendsRank })}
            />
          )}

          {!loading && !runView && (
            <>
              {unlocked.length > 0 && (
                <div className="unlocks">
                  <div className="unlocks__head">
                    {unlocked.length > 1 ? t("gameOver.unlockedMany") : t("gameOver.unlockedOne")}
                  </div>
                  {unlocked.map((a) => (
                    <div className="unlocks__row" key={a.id}>
                      <span className="unlocks__icon">{a.icon}</span>
                      <span>
                        <strong>{t(`ach.${a.id}.title` as MsgKey)}</strong> —{" "}
                        {t(`ach.${a.id}.desc` as MsgKey)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {champion && (
                <div className="daily__herald">
                  <span className="daily__heraldFace">
                    <ChallengeAvatar {...champion} />
                    <span className="daily__crown" aria-hidden="true">
                      👑
                    </span>
                  </span>
                  <span className="daily__heraldBody">
                    <strong className="daily__heraldName">
                      {t("weekly.wonTheWeek", { name: champion.username })}
                    </strong>
                    <span className="daily__heraldSub">
                      {champion.score === null
                        ? formatDay(champion.week)
                        : t("weekly.wonWith", {
                            week: formatDay(champion.week),
                            score: n(champion.score),
                          })}
                    </span>
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {!loading && !runView && status && !refreshFailed && status.champions.length > 0 && (
          <aside className="setup__panel daily-hall">
            <h2 className="daily-hall__title">{t("weekly.hall")}</h2>
            <ol className="daily-hall__list">
              {status.champions.map((c) => (
                <li className="daily-hall__row" key={c.week}>
                  <span className="daily-hall__face" aria-hidden="true">
                    <ChallengeAvatar {...c} />
                  </span>
                  <span className="daily-hall__body">
                    <span className="daily-hall__name">{c.username}</span>
                    <span className="daily-hall__when">{formatDay(c.week)}</span>
                  </span>
                  <span className="daily-hall__score">{c.score === null ? "—" : n(c.score)}</span>
                </li>
              ))}
            </ol>
          </aside>
        )}
      </div>

      {reading && (
        <ChallengeEntryDetails
          mode="weekly"
          entry={reading}
          friendsRank={reading.friendsRank}
          players={status?.players ?? 0}
          onClose={() => setReading(null)}
        />
      )}
    </div>
  );
}

/** Both Chicago clocks tick without live announcements. The daily allowance
 * can refill Tuesday–Sunday while the same weekly competition continues.
 * Reads wait until the run controller is unmounted so a timer cannot interrupt
 * an accepted move that is still reconciling with the server. */
function useWeeklyClocks(
  current: { week: string; day: string; period: AttemptPeriod | null },
  runOpen: boolean,
  enabled: boolean,
  onRollover: () => void,
): { daily: number; weekly: number } {
  const [clocks, setClocks] = useState(() => ({
    daily: msUntilNextDaily(),
    weekly: msUntilNextWeek(),
  }));
  const rollover = useRef(onRollover);
  rollover.current = onRollover;
  const { week, day, period } = current;

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClocks({ daily: msUntilNextDaily(now), weekly: msUntilNextWeek(now) });
      if (enabled && weeklyLobbyNeedsRefresh({ week, day, period }, runOpen, now))
        rollover.current();
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [week, day, period, runOpen, enabled]);
  return clocks;
}
