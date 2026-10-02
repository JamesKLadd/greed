/**
 * The daily challenge: one seeded run a day, ten turns, highest total.
 *
 * Your dice are yours: the seed comes from the day AND your account, so nobody
 * can play a route somebody else worked out — and the seed stays on the server,
 * which deals every throw. The run is claimed the moment it starts, so leaving
 * this screen and coming back resumes it rather than dealing a fresh board.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { DAILY_TURNS, dailyKey, msUntilNextDaily } from "@greed/core";
import { ChallengeRun } from "../components/ChallengeRun.js";
import {
  fetchDaily,
  playDailyMove,
  resumeDaily,
  startDaily,
  type DailyEntry,
  type DailyRunView,
  type DailyStatus,
} from "../net/daily.js";
import {
  awardAchievement,
  DAILY_STREAK_BADGES,
  raiseBestTurn,
  setDailyWins,
  type Achievement,
} from "../game/profile.js";
import { syncSteamAchievements } from "../game/steam.js";
import { syncProfileUp } from "../net/auth.js";

import { Button, Icon } from "../ui/index.js";
import { resolveAvatar } from "../game/avatars.js";
import { useAuth } from "../game/auth.js";
import { loadSettings } from "../game/settings.js";
import { useI18n } from "../i18n/i18n.js";
import {
  ChallengeClocks,
  ChallengeEntry,
  ChallengeEntryDetails,
  ChallengeResult,
  ChallengeStandings,
  ChallengeSummaryStats,
} from "../components/ChallengeLobby.js";
import { apiErrorText } from "../i18n/apiError.js";
import { formatDay } from "../i18n/dates.js";
import type { MsgKey } from "../i18n/i18n.js";

interface DailyScreenProps {
  onBack: () => void;
  onSignIn: () => void;
}

/** A failed move is reconciled with a read, never by repeating the move. */
const resumeRun = async () => (await resumeDaily()).run;

export function DailyScreen({ onBack, onSignIn }: DailyScreenProps) {
  const { t, n } = useI18n();
  const { status: authStatus } = useAuth();
  // Read per render, like the in-game shell, so a change in Settings takes
  // effect on the way back rather than on the next run.
  const { dice3d } = loadSettings();
  const [day, setDay] = useState(() => dailyKey());
  const [status, setStatus] = useState<DailyStatus | null>(null);
  const [unlocked, setUnlocked] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The position the server dealt, or null when no run is open. This is the
  // only handle on a run the client gets — there is no local game to fall back
  // on, by design.
  const [runView, setRunView] = useState<DailyRunView | null>(null);
  const [starting, setStarting] = useState(false);
  /** The board row being read in close-up, if any. */
  const [reading, setReading] = useState<DailyEntry | null>(null);

  /**
   * Fold everything the daily can earn into the profile: the podium badge, the
   * streak badges, and the count of days won.
   *
   * The podium one used to be granted from where you stood the moment you
   * finished, which a board fills up over the course of its day — so playing in
   * the first hour after the reset placed you against almost nobody, and the
   * badge (and the laurel dice behind it) fell out of being early rather than
   * being good. It settles when the day does now, which means it can arrive on
   * a later visit than the run that earned it. The streak badges have the same
   * shape: the streak is the server's count of consecutive finished days, so
   * neither of these can be won by moving a clock.
   */
  const claim = useCallback((next: DailyStatus) => {
    const ids: string[] = [];
    if (next.eliteEarned) ids.push("daily-elite");
    for (const b of DAILY_STREAK_BADGES) {
      if (next.streak >= b.days) ids.push(b.id);
    }
    const won = ids.map(awardAchievement).filter((a): a is Achievement => a !== null);

    // The wins figure is the server's — only it can see where everyone else
    // finished. This is the local copy catching up, so the Stats screen agrees
    // now rather than after the next sign-in.
    const movedWins = setDailyWins(next.wins);

    if (won.length > 0) {
      setUnlocked((prev) => [...prev, ...won]);
      syncSteamAchievements(won.map((a) => a.id));
    }
    if (won.length > 0 || movedWins) void syncProfileUp();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [next, open] = await Promise.all([fetchDaily(), resumeDaily()]);
      setStatus(next);
      setDay(next.day);
      // Yesterday's board may have closed since the last visit.
      claim(next);
      // A run left half-played picks up exactly where it was left.
      setRunView(open.run);
    } catch (err) {
      setError(apiErrorText(t, err, "daily.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t, claim]);

  useEffect(() => {
    if (authStatus === "authed") void load();
    else setLoading(false);
  }, [authStatus, load]);

  /** The run is over: the server already has the score, so just re-read it. */
  const onFinished = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRunView(null);
    try {
      const next = await fetchDaily();
      setStatus(next);
      setDay(next.day);
      // A turn banked in the run counts toward the career best like any other.
      // The server has already folded it into the account (see daily.ts); this
      // is the local copy catching up so the Stats screen agrees now rather
      // than after the next sign-in.
      const improved = next.run ? raiseBestTurn(next.run.bestTurn) : false;
      if (improved) void syncProfileUp();
      claim(next);
    } catch (err) {
      setError(apiErrorText(t, err, "daily.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t, claim]);

  /** Claim today's run. The server creates it, so this cannot be undone. */
  const begin = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      setRunView(await startDaily());
    } catch (err) {
      setError(apiErrorText(t, err, "daily.loadFailed"));
    } finally {
      setStarting(false);
    }
  }, [t]);

  const played = status?.run != null;
  // Watch every entry state, but let an in-flight run reconcile with the server
  // before replacing it. Starting yesterday's entry after midnight is stale too.
  const nextIn = useDailyCountdown(day, () => {
    if (authStatus !== "authed" || runView || loading || starting) return;
    setDay(dailyKey());
    void load();
  });
  const champion = status?.champion ?? null;
  const inRun = runView !== null;

  return (
    <div
      className={
        "setup setup--challenge challenge-lobby" + (inRun ? " challenge-lobby--playing" : "")
      }
    >
      <header className="setup__hero">
        <div className="challenge-lobby__nav">
          <Button variant="ghost" onClick={onBack}>
            {t("bar.home")}
          </Button>
          <span className="daily__day">{formatDay(status?.day ?? day)}</span>
        </div>
        <h1 className="setup__logo">{t("daily.title")}</h1>
        {!inRun && <p className="setup__tagline">{t("daily.tagline")}</p>}
      </header>
      <div className="daily__layout">
        <div className="setup__panel daily" aria-busy={loading || starting}>
          {authStatus === "loading" ? (
            <p className="daily__note" role="status">
              {t("daily.loading")}
            </p>
          ) : authStatus !== "authed" ? (
            <>
              <p className="daily__note">{t("daily.signInRequired")}</p>
              <ChallengeEntry label={t("home.signIn")} onStart={onSignIn} />
            </>
          ) : (
            <>
              {error && (
                <div className="challenge-lobby__error">
                  <p role="alert">{error}</p>
                  <Button onClick={() => void load()} disabled={loading}>
                    {t("challenge.retry")}
                  </Button>
                </div>
              )}
              {loading && (
                <p className="daily__note" role="status">
                  {t("daily.loading")}
                </p>
              )}
              {!loading && runView && (
                <ChallengeRun
                  initial={runView}
                  dice3d={dice3d}
                  playMove={playDailyMove}
                  resumeRun={resumeRun}
                  onFinished={onFinished}
                />
              )}
              {!loading && !runView && !error && status && (
                <>
                  {played && status.run ? (
                    <>
                      <ChallengeResult
                        label={t("challenge.dailyResult")}
                        score={status.run.score}
                        rankText={
                          status.yourRank
                            ? t("daily.yourRank", {
                                rank: status.yourRank,
                                players: status.players,
                              })
                            : undefined
                        }
                      >
                        <ChallengeSummaryStats result={status.run} />
                      </ChallengeResult>
                      <p className="daily__note challenge-lobby__complete">{t("daily.played")}</p>
                    </>
                  ) : (
                    <ChallengeEntry
                      label={starting ? t("challenge.starting") : t("daily.play")}
                      busy={starting}
                      onStart={() => void begin()}
                      intro={t("daily.intro", { turns: DAILY_TURNS })}
                    >
                      <p className="daily__note daily__note--locked">
                        <Icon name="lock" /> {t("daily.boardLocked")}
                      </p>
                    </ChallengeEntry>
                  )}
                  <ChallengeClocks items={[{ label: t("daily.nextIn"), ms: nextIn }]} />
                  {played && (
                    <ChallengeStandings
                      mode="daily"
                      entries={status.leaderboard}
                      onRead={setReading}
                    />
                  )}
                </>
              )}
              {!inRun && !loading && status && (
                <div className="challenge-lobby__extras">
                  {status.streak > 0 && (
                    <p className="daily__streak">
                      <Icon name="check" /> {t("daily.streak", { n: status.streak })}
                    </p>
                  )}
                  {unlocked.length > 0 && (
                    <div className="unlocks">
                      <div className="unlocks__head">
                        {unlocked.length > 1
                          ? t("gameOver.unlockedMany")
                          : t("gameOver.unlockedOne")}
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
                      <span className="daily__heraldFace" aria-hidden="true">
                        {resolveAvatar(champion.username, false, champion.avatar)}
                        <span className="daily__crown">👑</span>
                      </span>
                      <span className="daily__heraldBody">
                        <strong className="daily__heraldName">
                          {t("daily.wonTheDay", { name: champion.username })}
                        </strong>
                        <span className="daily__heraldSub">
                          {t("daily.wonWith", {
                            day: formatDay(champion.day),
                            score: n(champion.score),
                          })}
                        </span>
                      </span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        {authStatus === "authed" && !inRun && !loading && status && status.champions.length > 0 && (
          <aside className="setup__panel daily-hall">
            <details className="challenge-lobby__history">
              <summary>{t("daily.hall")}</summary>
              <ol className="daily-hall__list">
                {status.champions.map((c) => (
                  <li className="daily-hall__row" key={c.day}>
                    <span className="daily-hall__face" aria-hidden="true">
                      {resolveAvatar(c.username, false, c.avatar)}
                    </span>
                    <span className="daily-hall__body">
                      <span className="daily-hall__name">{c.username}</span>
                      <span className="daily-hall__when">{formatDay(c.day)}</span>
                    </span>
                    <span className="daily-hall__score">{n(c.score)}</span>
                  </li>
                ))}
              </ol>
            </details>
          </aside>
        )}
      </div>
      {reading && (
        <ChallengeEntryDetails
          mode="daily"
          entry={reading}
          players={status?.players ?? 0}
          onClose={() => setReading(null)}
        />
      )}
    </div>
  );
}

/** A key change, rather than a zero countdown, detects Chicago midnight/DST. */
function useDailyCountdown(day: string, onRollover: () => void): number {
  const [remaining, setRemaining] = useState(() => msUntilNextDaily());
  const rollover = useRef(onRollover);
  rollover.current = onRollover;
  useEffect(() => {
    const tick = () => {
      setRemaining(msUntilNextDaily());
      if (dailyKey() !== day) rollover.current();
    };
    tick();
    const id = window.setInterval(tick, 1000);
    // A suspended phone tab catches up as soon as it becomes visible.
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [day]);
  return remaining;
}
