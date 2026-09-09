/**
 * The weekly challenge: the same ten-turn run as the daily, played as often as
 * you like, with your best attempt standing for the week.
 *
 * The differences from the daily screen are the ones that follow from that.
 * The board is on show from the first moment of the week rather than withheld
 * until you have played — with retries still to come, the score to beat is what
 * you are playing against, not something that spoils a single attempt. And
 * there is no "come back tomorrow": the only thing between a player and another
 * go is finishing the run they have open.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { WEEKLY_TURNS, msUntilNextWeek, weekKey, weeklyAttemptLimit } from "@greed/core";
import { ChallengeRun } from "../components/ChallengeRun.js";
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
  raiseWeeklyWins,
  WEEKLY_STREAK_BADGES,
  type Achievement,
} from "../game/profile.js";
import { syncSteamAchievements } from "../game/steam.js";
import { ApiError, syncProfileUp } from "../net/auth.js";
import { Button, Icon, Modal } from "../ui/index.js";
import { resolveAvatar } from "../game/avatars.js";
import { useAuth } from "../game/auth.js";
import { loadSettings } from "../game/settings.js";
import { useT } from "../i18n/i18n.js";
import { formatDay } from "../i18n/dates.js";
import type { MsgKey } from "../i18n/i18n.js";

interface WeeklyScreenProps {
  onBack: () => void;
  onSignIn: () => void;
}

export function WeeklyScreen({ onBack, onSignIn }: WeeklyScreenProps) {
  const t = useT();
  const { status: authStatus } = useAuth();
  // Read per render, like the in-game shell, so a change in Settings takes
  // effect on the way back rather than on the next attempt.
  const { dice3d } = loadSettings();
  const [week, setWeek] = useState(() => weekKey());
  /**
   * What the MODE grants this week, worked out from the week itself.
   *
   * Separate from the limit the status reports, and used only for the tagline —
   * which is drawn on screens that have no status to read at all: signed out,
   * or talking to an API that has never heard of the weekly. The rule is a pure
   * function of the calendar, so those screens can still say what the mode is.
   * Anything about what THIS player has left comes from the server instead.
   */
  const weekLimit = weeklyAttemptLimit(week);
  const [status, setStatus] = useState<WeeklyStatus | null>(null);
  const [unlocked, setUnlocked] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Set when the deployed server has no weekly at all — see WeeklyUnavailable. */
  const [unavailable, setUnavailable] = useState(false);
  const [runView, setRunView] = useState<WeeklyRunView | null>(null);
  const [starting, setStarting] = useState(false);
  /** The board row being read in close-up, if any. */
  const [reading, setReading] = useState<WeeklyEntry | null>(null);

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

    // The wins figure is the server's — only it can see where everyone else
    // finished. This is the local copy catching up, so the Stats screen agrees
    // now rather than after the next sign-in.
    const movedWins = raiseWeeklyWins(next.wins);

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
      setError(err instanceof ApiError ? err.message : t("weekly.loadFailed"));
    },
    [t],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [next, open] = await Promise.all([fetchWeekly(), resumeWeekly()]);
      setStatus(next);
      // Last week's board may have closed since the last visit.
      claim(next);
      // An attempt left half-played picks up exactly where it was left.
      setRunView(open.run);
    } catch (err) {
      fail(err);
    } finally {
      setLoading(false);
    }
  }, [claim, fail]);

  useEffect(() => {
    if (authStatus === "authed") void load();
    else setLoading(false);
  }, [authStatus, load]);

  /** An attempt is over: the server already has the score, so re-read it. */
  const onFinished = useCallback(async () => {
    setRunView(null);
    try {
      const next = await fetchWeekly();
      setStatus(next);
      // A turn banked in an attempt counts toward the career best like any
      // other. The server has already folded it into the account (see
      // weekly.ts); this is the local copy catching up.
      const improved = next.best ? raiseBestTurn(next.best.bestTurn) : false;
      if (improved) void syncProfileUp();
      claim(next);
    } catch (err) {
      fail(err);
    }
  }, [claim, fail]);

  /** Open an attempt. With one already open the server returns THAT one. */
  const begin = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      setRunView(await startWeekly());
    } catch (err) {
      fail(err);
    } finally {
      setStarting(false);
    }
  }, [fail]);

  // The week's clock runs whether or not this player has played, since there is
  // always another attempt to be had — so unlike the daily's, it is always on.
  const nextIn = useWeeklyCountdown(week, () => {
    setWeek(weekKey());
    void load();
  });

  // Accounts are what make the board meaningful, so signed-out players see a
  // prompt rather than a run they couldn't submit.
  if (authStatus !== "authed") {
    return (
      <div className="setup">
        <div className="setup__hero">
          <h1 className="setup__logo">{t("weekly.title")}</h1>
          <p className="setup__tagline">
            {weekLimit === null
              ? t("weekly.tagline")
              : t("weekly.tagline.capped", { n: weekLimit })}
          </p>
        </div>
        <div className="setup__panel daily">
          <p className="daily__note">{t("weekly.signInRequired")}</p>
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

  // Both halves auto-deploy on a push, but the client lands first — so for a few
  // minutes after a release this screen is talking to an API that has never
  // heard of it. Said plainly rather than as an error, because nothing is wrong.
  if (unavailable) {
    return (
      <div className="setup">
        <div className="setup__hero">
          <h1 className="setup__logo">{t("weekly.title")}</h1>
          <p className="setup__tagline">
            {weekLimit === null
              ? t("weekly.tagline")
              : t("weekly.tagline.capped", { n: weekLimit })}
          </p>
        </div>
        <div className="setup__panel daily">
          <p className="daily__note">{t("weekly.notReady")}</p>
          <div className="setup__actions">
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

  // What the week grants, as the SERVER reports it — null on a week with no
  // cap, which is every week before the limit began and any server that
  // predates it. `left` is only meaningful alongside a limit.
  const limit = status?.attemptLimit ?? null;
  const used = status?.attempts ?? 0;
  const left = limit === null ? null : Math.max(0, limit - used);
  const spent = left === 0;

  return (
    <div className="setup">
      <div className="setup__hero">
        <h1 className="setup__logo">{t("weekly.title")}</h1>
        <p className="setup__tagline">
          {weekLimit === null ? t("weekly.tagline") : t("weekly.tagline.capped", { n: weekLimit })}
        </p>
      </div>

      <div className="daily__layout">
        <div className="setup__panel daily">
          {error && (
            <div className="banner banner--sd online-error" onClick={() => setError(null)}>
              {error} <span className="online-error__x">✕</span>
            </div>
          )}

          <div className="daily__head">
            <span className="daily__day">{t("weekly.weekOf", { week: formatDay(week) })}</span>
            {status && status.streak > 0 && (
              <span className="daily__streak">
                <Icon name="check" /> {t("weekly.streak", { n: status.streak })}
              </span>
            )}
          </div>

          {/* Last week's result, announced. Drawn from weeks that have CLOSED,
              so there is nothing in it about this one. */}
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
                  {t("weekly.wonTheWeek", { name: champion.username })}
                </strong>
                <span className="daily__heraldSub">
                  {t("weekly.wonWith", {
                    week: formatDay(champion.week),
                    score: champion.score,
                  })}
                </span>
              </span>
            </div>
          )}

          {loading && <p className="daily__note">{t("weekly.loading")}</p>}

          {/* Badges settle when a WEEK closes, so they usually arrive on a later
              visit than the attempt that earned them. */}
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

          {/* ---- the attempt itself ---- */}
          {!loading && runView && (
            <ChallengeRun
              initial={runView}
              dice3d={dice3d}
              playMove={playWeeklyMove}
              onFinished={onFinished}
            />
          )}

          {/* ---- where you stand, and the way back in ---- */}
          {!loading && !runView && (
            <div className="daily__intro">
              {best ? (
                <div className="daily__result">
                  <p className="daily__note">{t("weekly.yourBest")}</p>
                  <div className="daily__score">{best.score}</div>
                  <p className="daily__note">
                    {status?.yourRank
                      ? t("weekly.yourRank", {
                          rank: status.yourRank,
                          players: status.players,
                        })
                      : limit === null
                        ? t("weekly.attemptsMade", { n: used })
                        : t("weekly.attemptsMadeOf", { n: used, total: limit })}
                  </p>
                  <div className="summary">
                    <div className="summary__stat">
                      <span className="summary__label">{t("gameOver.bestTurn")}</span>
                      <span className="summary__value">{best.bestTurn}</span>
                    </div>
                    <div className="summary__stat">
                      <span className="summary__label">{t("gameOver.busts")}</span>
                      <span className="summary__value">{best.busts}</span>
                    </div>
                    <div className="summary__stat">
                      <span className="summary__label">{t("weekly.attempts")}</span>
                      {/* Numerals and a slash read the same in every language,
                          so this needs no catalog entry of its own. */}
                      <span className="summary__value">
                        {limit === null ? used : `${used}/${limit}`}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <p className="daily__note">
                    {limit === null
                      ? t("weekly.intro", { turns: WEEKLY_TURNS })
                      : t("weekly.intro.capped", { turns: WEEKLY_TURNS, n: limit })}
                  </p>
                  <p className="daily__note daily__note--hint">{t("weekly.freshDice")}</p>
                </>
              )}

              {/* What is left, said once, wherever the player is in the week —
                  under the result when they have one, under the intro when they
                  do not. The button below reads the same state, so the count and
                  whether it can be pressed can never disagree. */}
              {limit !== null && (
                <p
                  className={
                    spent ? "daily__note daily__note--warn" : "daily__note daily__note--hint"
                  }
                >
                  {spent
                    ? t("weekly.attemptsGone", { total: limit })
                    : left === 1
                      ? t("weekly.attemptsLast")
                      : t("weekly.attemptsLeft", { n: left ?? 0, total: limit })}
                </p>
              )}

              {/* Disabled rather than hidden once the attempts are gone: the
                  button is where a player looks to find out whether they may
                  play, and a missing one reads as a broken screen. The server
                  refuses either way — this is only so the press is not wasted. */}
              <Button
                variant="roll"
                size="lg"
                disabled={starting || spent}
                onClick={() => void begin()}
              >
                {starting ? t("weekly.loading") : best ? t("weekly.playAgain") : t("weekly.play")}
              </Button>

              {nextIn !== null && (
                <p className="daily__next">
                  <span className="daily__nextLabel">{t("weekly.nextIn")}</span>
                  <span className="daily__nextClock">{formatCountdown(nextIn)}</span>
                </p>
              )}
            </div>
          )}

          {/* ---- leaderboard ---- */}
          {/* Not gated on having played: this board is public all week, which is
              the one place the weekly deliberately differs from the daily. */}
          {!loading && status && (
            <div className="daily__board">
              <h2 className="daily__boardTitle">{t("weekly.leaderboard")}</h2>
              {status.leaderboard.length === 0 ? (
                <p className="daily__note">{t("weekly.noRuns")}</p>
              ) : (
                <>
                  <p className="daily__note daily__note--hint">{t("weekly.tapRow")}</p>
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
                                  title={t("weekly.crownTip")}
                                  aria-label={t("weekly.crownTip")}
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
                </>
              )}
            </div>
          )}
        </div>

        {/* ---- every past winner ---- */}
        {status && status.champions.length > 0 && (
          <aside className="setup__panel daily-hall">
            <h2 className="daily-hall__title">{t("weekly.hall")}</h2>
            <ol className="daily-hall__list">
              {status.champions.map((c) => (
                <li className="daily-hall__row" key={c.week}>
                  <span className="daily-hall__face">
                    {resolveAvatar(c.username, false, c.avatar)}
                  </span>
                  <span className="daily-hall__body">
                    <span className="daily-hall__name">{c.username}</span>
                    <span className="daily-hall__when">{formatDay(c.week)}</span>
                  </span>
                  <span className="daily-hall__score">{c.score}</span>
                </li>
              ))}
            </ol>
          </aside>
        )}
      </div>

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
              {t("weekly.theirRank", { rank: reading.rank, players: status?.players ?? 0 })}
            </p>
            {/* What the score cost them. On a board where everyone may retry,
                this is the figure that says whether a run was a stroke of luck
                or the twentieth time of asking. */}
            <p className="daily__note daily__note--hint">
              {t("weekly.theirAttempts", { n: reading.attempts })}
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
                <span className="stat-tile__label">{t("stats.weeklyWins")}</span>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/**
 * Time left in `week`, ticking once a second.
 *
 * Rollover is detected by re-deriving the week key rather than by watching the
 * countdown reach zero: `msUntilNextWeek` jumps straight from ~1s back up to a
 * full week at Monday midnight, and the key is the thing that actually decides
 * which challenge you get. A tab left open over the weekend therefore lands on
 * the new week instead of on a stale one.
 *
 * Unlike the daily's, this runs unconditionally: there is always another
 * attempt to be had, so the clock is counting down to a new board rather than
 * to the player's next go.
 */
function useWeeklyCountdown(week: string, onRollover: () => void): number | null {
  const [remaining, setRemaining] = useState(() => msUntilNextWeek());
  const rollover = useRef(onRollover);
  rollover.current = onRollover;

  useEffect(() => {
    setRemaining(msUntilNextWeek());
    const id = window.setInterval(() => {
      if (weekKey() !== week) rollover.current();
      else setRemaining(msUntilNextWeek());
    }, 1000);
    return () => window.clearInterval(id);
  }, [week]);

  return remaining;
}

/** Remaining time as d:hh:mm:ss, dropping the days once inside the last one. */
function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const hh = days > 0 ? String(hours).padStart(2, "0") : String(hours);
  const clock = `${hh}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return days > 0 ? `${days}d ${clock}` : clock;
}
