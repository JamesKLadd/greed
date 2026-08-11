/**
 * The daily challenge: one seeded run a day, ten turns, highest total.
 *
 * Your dice are yours: the seed comes from the day AND your account, so nobody
 * can play a route somebody else worked out. The run plays locally; on
 * completion the recorded MOVES are submitted and the server replays them
 * against your seed to derive the score (see net/daily.ts).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { DAILY_TURNS, dailyKey, msUntilNextDaily } from "@greed/core";
import { useDailyRun } from "../game/useDailyRun.js";
import { fetchDaily, submitDaily, type DailyStatus } from "../net/daily.js";
import { ApiError } from "../net/auth.js";
import { Die } from "../components/Die.js";
import { Button, Icon } from "../ui/index.js";
import { useAuth } from "../game/auth.js";
import { loadSettings } from "../game/settings.js";
import { useGameSounds, useRollSound } from "../game/useGameSounds.js";
import { useT } from "../i18n/i18n.js";

interface DailyScreenProps {
  onBack: () => void;
  onSignIn: () => void;
}

export function DailyScreen({ onBack, onSignIn }: DailyScreenProps) {
  const t = useT();
  const { status: authStatus, user } = useAuth();
  // Read per render, like the in-game shell, so a change in Settings takes
  // effect on the way back rather than on the next run.
  const { dice3d } = loadSettings();
  const [day, setDay] = useState(() => dailyKey());
  const [status, setStatus] = useState<DailyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // The account id seeds the dice, so this must be the same id the server
  // replays the run with.
  const run = useDailyRun(day, user?.id ?? "");
  useGameSounds(run.state);
  useRollSound(run.isRolling);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await fetchDaily());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("daily.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (authStatus === "authed") void load();
    else setLoading(false);
  }, [authStatus, load]);

  // Submit as soon as the tenth turn resolves.
  useEffect(() => {
    if (!playing || !run.finished || submitting) return;
    setSubmitting(true);
    submitDaily(run.moves)
      .then((res) => {
        setStatus(res.status);
        setPlaying(false);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t("daily.submitFailed")))
      .finally(() => setSubmitting(false));
  }, [playing, run.finished, run.moves, submitting, t]);

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

  return (
    <div className="setup">
      <div className="setup__hero">
        <h1 className="setup__logo">{t("daily.title")}</h1>
        <p className="setup__tagline">{t("daily.tagline")}</p>
      </div>

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

        {loading && <p className="daily__note">{t("daily.loading")}</p>}

        {/* ---- the run itself ---- */}
        {!loading && playing && (
          <div className="daily__run">
            <div className="daily__meters">
              <div className="meter">
                <span className="meter__label">{t("daily.turn")}</span>
                <span className="meter__value">
                  {Math.min(run.turn + 1, DAILY_TURNS)}/{run.totalTurns}
                </span>
              </div>
              <div className="meter">
                <span className="meter__label">{t("daily.banked")}</span>
                <span className="meter__value">{run.state.players[0].total}</span>
              </div>
              <div className="meter">
                <span className="meter__label">{t("controls.turnPoints")}</span>
                <span className="meter__value">{run.state.turn.turnScore}</span>
              </div>
            </div>

            <div
              className={[
                "dice-tray",
                "daily__dice",
                run.state.turn.outcome === "busted" ? "dice-tray--busted" : "",
                run.state.turn.hotDice && !run.isRolling ? "dice-tray--hot" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {run.state.turn.dice.map((v, i) => (
                <Die
                  key={i}
                  value={v}
                  size={46}
                  locked={run.state.turn.locked[i] && !run.state.turn.hotDice}
                  rolling={run.isRolling && run.rollingIndices.includes(i)}
                  dim={run.state.turn.lastRoll === null && !run.isRolling}
                  dimensional={dice3d}
                  landing={
                    run.isRolling && run.rollingIndices.includes(i)
                      ? run.rollingDice?.[i]
                      : undefined
                  }
                />
              ))}
            </div>

            <p className="daily__status">
              {run.state.turn.outcome === "busted"
                ? t("daily.busted")
                : run.state.turn.hotDice
                  ? t("controls.hotDice")
                  : run.state.turn.lastRoll === null
                    ? t("controls.rollToStart")
                    : t("controls.rollOrBank")}
            </p>

            <div className="daily__actions">
              <Button variant="roll" size="lg" disabled={!run.canRoll} onClick={run.roll}>
                {t("controls.rollDice")}
              </Button>
              <Button variant="bank" size="lg" disabled={!run.canBank} onClick={run.bank}>
                {t("controls.bank")}
              </Button>
            </div>
            {submitting && <p className="daily__note">{t("daily.submitting")}</p>}
          </div>
        )}

        {/* ---- today's result ---- */}
        {!loading && !playing && played && status?.run && (
          <div className="daily__result">
            <div className="daily__score">{status.run.score}</div>
            <p className="daily__note">
              {status.yourRank
                ? t("daily.yourRank", { rank: status.yourRank, players: status.players })
                : t("daily.played")}
            </p>
            <div className="summary">
              <div className="summary__stat">
                <span className="summary__label">{t("gameOver.bestTurn")}</span>
                <span className="summary__value">{status.run.bestTurn}</span>
              </div>
              <div className="summary__stat">
                <span className="summary__label">{t("gameOver.busts")}</span>
                <span className="summary__value">{status.run.busts}</span>
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
        {!loading && !playing && !played && (
          <div className="daily__intro">
            <p className="daily__note">{t("daily.intro", { turns: DAILY_TURNS })}</p>
            <Button variant="roll" size="lg" onClick={() => setPlaying(true)}>
              {t("daily.play")}
            </Button>
          </div>
        )}

        {/* ---- leaderboard ---- */}
        {!loading && status && status.leaderboard.length > 0 && (
          <div className="daily__board">
            <h2 className="daily__boardTitle">{t("daily.leaderboard")}</h2>
            <ol className="standings">
              {status.leaderboard.map((e) => (
                <li
                  key={`${e.rank}-${e.username}`}
                  className={e.you ? "standings__row standings__row--win" : "standings__row"}
                >
                  <span>
                    <span className="daily__rank">#{e.rank}</span> {e.username}
                  </span>
                  <span>{e.score}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className="setup__actions">
          <Button variant="ghost" onClick={onBack}>
            {t("bar.home")}
          </Button>
        </div>
      </div>
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
