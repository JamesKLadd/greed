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
  raiseDailyWins,
  type Achievement,
} from "../game/profile.js";
import { syncSteamAchievements } from "../game/steam.js";
import { syncProfileUp } from "../net/auth.js";

import { Button, Icon, Modal } from "../ui/index.js";
import { resolveAvatar } from "../game/avatars.js";
import { useAuth } from "../game/auth.js";
import { loadSettings } from "../game/settings.js";
import { useT } from "../i18n/i18n.js";
import { apiErrorText } from "../i18n/apiError.js";
import { formatDay } from "../i18n/dates.js";
import type { MsgKey } from "../i18n/i18n.js";

interface DailyScreenProps {
  onBack: () => void;
  onSignIn: () => void;
}

export function DailyScreen({ onBack, onSignIn }: DailyScreenProps) {
  const t = useT();
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
    const movedWins = raiseDailyWins(next.wins);

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
    setRunView(null);
    try {
      const next = await fetchDaily();
      setStatus(next);
      // A turn banked in the run counts toward the career best like any other.
      // The server has already folded it into the account (see daily.ts); this
      // is the local copy catching up so the Stats screen agrees now rather
      // than after the next sign-in.
      const improved = next.run ? raiseBestTurn(next.run.bestTurn) : false;
      if (improved) void syncProfileUp();
      claim(next);
    } catch (err) {
      setError(apiErrorText(t, err, "daily.loadFailed"));
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

  // Once today's run is in, there is nothing to do but wait — so show how long
  // the wait is, and when it's over pick the new challenge up in place rather
  // than leaving a spent screen behind.
  const nextIn = useDailyCountdown(day, played, () => {
    setDay(dailyKey());
    void load();
  });

  // Accounts are what make the board meaningful, so signed-out players see a
  // prompt rather than a run they couldn't submit.
  if (authStatus !== "authed") {
    return (
      <div className="setup">
        <div className="setup__hero">
          <h1 className="setup__logo">{t("daily.title")}</h1>
          <p className="setup__tagline">{t("daily.tagline")}</p>
        </div>
        <div className="setup__panel daily">
          <p className="daily__note">{t("daily.signInRequired")}</p>
          <div className="setup__actions">
            <Button variant="ghost" onClick={onBack}>
              {t("bar.home")}
            </Button>
            <Button variant="roll" onClick={onSignIn}>
              {t("home.signIn")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const champion = status?.champion ?? null;

  return (
    <div className="setup">
      <div className="setup__hero">
        <h1 className="setup__logo">{t("daily.title")}</h1>
        <p className="setup__tagline">{t("daily.tagline")}</p>
      </div>

      <div className="daily__layout">
        <div className="setup__panel daily">
          {error && (
            <div className="banner banner--sd online-error" onClick={() => setError(null)}>
              {error} <span className="online-error__x">✕</span>
            </div>
          )}

          <div className="daily__head">
            <span className="daily__day">{day}</span>
            {status && status.streak > 0 && (
              <span className="daily__streak">
                <Icon name="check" /> {t("daily.streak", { n: status.streak })}
              </span>
            )}
          </div>

          {/* Yesterday's result, announced. Drawn from days that have CLOSED,
              so it is safe to show before this player's own run — there is
              nothing in it about today. */}
          {champion && (
            <div className="daily__herald">
              <span className="daily__heraldFace">
                {resolveAvatar(champion.username, false, champion.avatar)}
                <span className="daily__crown" aria-hidden="true">
                  👑
                </span>
              </span>
              <span className="daily__heraldBody">
                <strong className="daily__heraldName">
                  {t("daily.wonTheDay", { name: champion.username })}
                </strong>
                <span className="daily__heraldSub">
                  {t("daily.wonWith", {
                    day: formatDay(champion.day),
                    score: champion.score,
                  })}
                </span>
              </span>
            </div>
          )}

          {loading && <p className="daily__note">{t("daily.loading")}</p>}

          {/* Badges settle when a DAY closes, so they usually arrive on a later
              visit than the run that earned them — which means they cannot live
              inside today's result panel. */}
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

          {/* ---- the run itself ---- */}
          {!loading && runView && (
            <ChallengeRun
              initial={runView}
              dice3d={dice3d}
              playMove={playDailyMove}
              onFinished={onFinished}
            />
          )}

          {/* ---- today's result ---- */}
          {!loading && !runView && played && status?.run && (
            <div className="daily__result">
              <div className="daily__score">{status.run.score}</div>
              <p className="daily__note">
                {status.yourRank
                  ? t("daily.yourRank", { rank: status.yourRank, players: status.players })
                  : t("daily.played")}
              </p>
              <div className="summary summary--quad">
                <div className="summary__stat">
                  <span className="summary__label">{t("gameOver.bestTurn")}</span>
                  <span className="summary__value">{status.run.bestTurn}</span>
                </div>
                <div className="summary__stat">
                  <span className="summary__label">{t("gameOver.busts")}</span>
                  <span className="summary__value">{status.run.busts}</span>
                </div>
                {/* A subset of the busts beside it, so the two read together:
                    of the turns you lost, how many died on a full cup. */}
                <div className="summary__stat" title={t("run.superBustsHint")}>
                  <span className="summary__label">{t("run.superBusts")}</span>
                  <span className="summary__value">{status.run.superBusts}</span>
                </div>
                <div className="summary__stat">
                  <span className="summary__label">{t("gameOver.hotDice")}</span>
                  <span className="summary__value">{status.run.hotDice}</span>
                </div>
              </div>
              {nextIn !== null && (
                <p className="daily__next">
                  <span className="daily__nextLabel">{t("daily.nextIn")}</span>
                  <span className="daily__nextClock">{formatCountdown(nextIn)}</span>
                </p>
              )}
            </div>
          )}

          {/* ---- not played yet ---- */}
          {!loading && !runView && !played && (
            <div className="daily__intro">
              <p className="daily__note">{t("daily.intro", { turns: DAILY_TURNS })}</p>
              <Button variant="roll" size="lg" disabled={starting} onClick={() => void begin()}>
                {starting ? t("daily.loading") : t("daily.play")}
              </Button>
              {/* Said out loud, because an absent board looks like a broken one.
                  The server sends no scores until the run is in (see dailyStatus),
                  so there is nothing here to reveal by explaining it. */}
              <p className="daily__note daily__note--locked">
                <Icon name="lock" /> {t("daily.boardLocked")}
              </p>
            </div>
          )}

          {/* ---- leaderboard ---- */}
          {/* Gated on having played as well as on having rows: the server withholds
              the board until then, and this says the same thing on the near side so
              a stale status can't flash it up. */}
          {!loading && played && status && status.leaderboard.length > 0 && (
            <div className="daily__board">
              <h2 className="daily__boardTitle">{t("daily.leaderboard")}</h2>
              <p className="daily__note daily__note--hint">{t("daily.tapRow")}</p>
              <ol className="standings">
                {status.leaderboard.map((e) => (
                  <li key={`${e.rank}-${e.username}`}>
                    <button
                      type="button"
                      className={
                        e.you
                          ? "standings__row standings__row--win daily__row"
                          : "standings__row daily__row"
                      }
                      onClick={() => setReading(e)}
                    >
                      <span className="daily__who">
                        <span className="daily__rank">#{e.rank}</span>
                        <span className="daily__face">
                          {resolveAvatar(e.username, false, e.avatar)}
                          {e.crown && (
                            <span
                              className="daily__crown"
                              title={t("daily.crownTip")}
                              aria-label={t("daily.crownTip")}
                            >
                              👑
                            </span>
                          )}
                        </span>
                        <span className="daily__name">{e.username}</span>
                      </span>
                      <span>{e.score}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        {/* ---- every past winner ---- */}
        {status && status.champions.length > 0 && (
          <aside className="setup__panel daily-hall">
            <h2 className="daily-hall__title">{t("daily.hall")}</h2>
            <ol className="daily-hall__list">
              {status.champions.map((c) => (
                <li className="daily-hall__row" key={c.day}>
                  <span className="daily-hall__face">
                    {resolveAvatar(c.username, false, c.avatar)}
                  </span>
                  <span className="daily-hall__body">
                    <span className="daily-hall__name">{c.username}</span>
                    <span className="daily-hall__when">{formatDay(c.day)}</span>
                  </span>
                  <span className="daily-hall__score">{c.score}</span>
                </li>
              ))}
            </ol>
          </aside>
        )}
      </div>

      {/* Outside the panels: with the roll of champions stacked underneath on a
          phone, a back button inside the run panel sat in the middle of the
          page and stopped reading as the end of it. */}
      <div className="setup__actions">
        <Button variant="ghost" onClick={onBack}>
          {t("bar.home")}
        </Button>
      </div>

      {reading && (
        <Modal
          onClose={() => setReading(null)}
          title={reading.username}
          actions={
            <Button variant="ghost" onClick={() => setReading(null)}>
              {t("common.close")}
            </Button>
          }
        >
          <div className="daily-detail">
            <span className="daily-detail__face">
              {resolveAvatar(reading.username, false, reading.avatar)}
              {reading.crown && (
                <span className="daily__crown" aria-hidden="true">
                  👑
                </span>
              )}
            </span>
            <div className="daily__score">{reading.score}</div>
            <p className="daily__note">
              {t("daily.theirRank", { rank: reading.rank, players: status?.players ?? 0 })}
            </p>
            <div className="stats-grid">
              <div className="stat-tile">
                <span className="stat-tile__value">{reading.bestTurn}</span>
                <span className="stat-tile__label">{t("gameOver.bestTurn")}</span>
              </div>
              <div className="stat-tile">
                <span className="stat-tile__value">{reading.busts}</span>
                <span className="stat-tile__label">{t("gameOver.busts")}</span>
              </div>
              <div className="stat-tile">
                <span className="stat-tile__value">{reading.hotDice}</span>
                <span className="stat-tile__label">{t("gameOver.hotDice")}</span>
              </div>
              <div className="stat-tile">
                <span className="stat-tile__value">{reading.wins}</span>
                <span className="stat-tile__label">{t("stats.dailyWins")}</span>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/**
 * Time left on `day`, ticking once a second while `active`; null when there is
 * nothing to wait for.
 *
 * Rollover is detected by re-deriving the day key rather than by watching the
 * countdown reach zero: `msUntilNextDaily` jumps straight from ~1s back up to a
 * full day at midnight, and the key is the thing that actually decides which
 * challenge you get. A tab left open overnight therefore lands on the new day
 * instead of on a stale one.
 */
function useDailyCountdown(day: string, active: boolean, onRollover: () => void): number | null {
  const [remaining, setRemaining] = useState(() => msUntilNextDaily());
  const rollover = useRef(onRollover);
  rollover.current = onRollover;

  useEffect(() => {
    if (!active) return;
    setRemaining(msUntilNextDaily());
    const id = window.setInterval(() => {
      if (dailyKey() !== day) rollover.current();
      else setRemaining(msUntilNextDaily());
    }, 1000);
    return () => window.clearInterval(id);
  }, [active, day]);

  return active ? remaining : null;
}

/** Remaining time as h:mm:ss. Rounded up, so the clock only reads 0:00:00 when
 *  the wait is genuinely over. */
function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
