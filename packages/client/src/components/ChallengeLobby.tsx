import type { ReactNode } from "react";
import type { RunResult } from "@greed/core";
import type { DailyEntry } from "../net/daily.js";
import type { WeeklyEntry } from "../net/weekly.js";
import { resolveAvatar } from "../game/avatars.js";
import { useI18n } from "../i18n/i18n.js";
import { Button, Modal } from "../ui/index.js";
import { formatChallengeCountdown } from "../game/challengeCountdown.js";

export function ChallengeEntry({
  label,
  intro,
  onStart,
  disabled = false,
  busy = false,
  children,
}: {
  label: string;
  intro?: string;
  onStart: () => void;
  disabled?: boolean;
  busy?: boolean;
  children?: ReactNode;
}) {
  return (
    <section className="challenge-lobby__entry" aria-busy={busy}>
      <Button
        className="challenge-lobby__action"
        variant="roll"
        size="lg"
        disabled={disabled || busy}
        onClick={onStart}
      >
        {label}
      </Button>
      {children}
      {intro && <p className="daily__note challenge-lobby__intro">{intro}</p>}
    </section>
  );
}

export function ChallengeResult({
  label,
  score,
  rankText,
  children,
}: {
  label: string;
  score: number;
  rankText?: string;
  children?: ReactNode;
}) {
  const { t, n } = useI18n();
  return (
    <section className="challenge-lobby__result" aria-label={label}>
      <h2 className="challenge-lobby__resultLabel">{label}</h2>
      <div className="daily__score">{n(score)}</div>
      <span className="challenge-lobby__points">{t("challenge.points")}</span>
      {rankText && <p className="challenge-lobby__rank">{rankText}</p>}
      <p className="challenge-lobby__provisional">{t("challenge.standingsLive")}</p>
      {children}
    </section>
  );
}

export function ChallengeSummaryStats({
  result,
}: {
  result: Pick<RunResult, "bestTurn" | "busts" | "superBusts" | "hotDice">;
}) {
  const { t, n } = useI18n();
  return (
    <>
      <dl className="challenge-lobby__stats">
        <div>
          <dt>{t("gameOver.bestTurn")}</dt>
          <dd>{n(result.bestTurn)}</dd>
        </div>
        <div>
          <dt>{t("gameOver.busts")}</dt>
          <dd>{n(result.busts)}</dd>
        </div>
        <div>
          <dt>{t("run.superBusts")}</dt>
          <dd>{n(result.superBusts)}</dd>
        </div>
        <div>
          <dt>{t("gameOver.hotDice")}</dt>
          <dd>{n(result.hotDice)}</dd>
        </div>
      </dl>
      <details className="challenge-lobby__help">
        <summary>{t("challenge.superBustsExplain")}</summary>
        <p>{t("challenge.superBustsDetail")}</p>
      </details>
    </>
  );
}

/** Non-live clocks: announcing every second would bury the controls in a screen reader. */
export function ChallengeClocks({ items }: { items: { label: string; ms: number }[] }) {
  const { t } = useI18n();
  return (
    <dl className="challenge-lobby__clocks">
      {items.map(({ label, ms }) => {
        const { days, clock } = formatChallengeCountdown(ms);
        return (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{days > 0 ? t("challenge.countdownDays", { days, clock }) : clock}</dd>
          </div>
        );
      })}
    </dl>
  );
}

export function ChallengeStandings<T extends DailyEntry>({
  mode,
  entries,
  onRead,
}: {
  mode: "daily" | "weekly";
  entries: T[];
  onRead: (entry: T) => void;
}) {
  const { t, n } = useI18n();
  return (
    <section className="daily__board challenge-lobby__board">
      <h2 className="daily__boardTitle">
        {t(mode === "daily" ? "daily.leaderboard" : "weekly.leaderboard")}
      </h2>
      <p className="daily__note daily__note--hint">
        {t(mode === "daily" ? "daily.tapRow" : "weekly.tapRow")}
      </p>
      <details className="challenge-lobby__help">
        <summary>{t("challenge.tiebreakExplain")}</summary>
        <p>{t("challenge.tiebreakDetail")}</p>
      </details>
      {entries.length === 0 ? (
        <p className="daily__note">
          {t(mode === "daily" ? "challenge.noDailyRuns" : "weekly.noRuns")}
        </p>
      ) : (
        <ol className="standings">
          {entries.map((entry) => (
            <li key={`${entry.rank}-${entry.username}`}>
              <button
                type="button"
                className={`standings__row daily__row${entry.you ? " standings__row--win" : ""}`}
                onClick={() => onRead(entry)}
              >
                <span className="daily__rank">#{entry.rank}</span>
                <span className="daily__face" aria-hidden="true">
                  {resolveAvatar(entry.username, false, entry.avatar)}
                  {entry.crown && <span className="daily__crown">👑</span>}
                </span>
                <span className="daily__name">
                  {entry.username}
                  {entry.you && (
                    <small className="challenge-lobby__you">{t("common.youParen")}</small>
                  )}
                </span>
                <strong className="challenge-lobby__rowScore">{n(entry.score)}</strong>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function ChallengeEntryDetails({
  mode,
  entry,
  players,
  onClose,
}: {
  mode: "daily" | "weekly";
  entry: DailyEntry | WeeklyEntry;
  players: number;
  onClose: () => void;
}) {
  const { t, n } = useI18n();
  return (
    <Modal
      title={entry.username}
      onClose={onClose}
      scroll
      actions={
        <Button variant="ghost" onClick={onClose}>
          {t("common.close")}
        </Button>
      }
    >
      <div className="daily-detail challenge-lobby__detail">
        <span className="daily-detail__face" aria-hidden="true">
          {resolveAvatar(entry.username, false, entry.avatar)}
          {entry.crown && <span className="daily__crown">👑</span>}
        </span>
        {entry.crown && (
          <p className="daily__note">
            {t(mode === "daily" ? "daily.crownTip" : "weekly.crownTip")}
          </p>
        )}
        <div className="daily__score">{n(entry.score)}</div>
        <p className="daily__note">
          {t(mode === "daily" ? "daily.theirRank" : "weekly.theirRank", {
            rank: entry.rank,
            players,
          })}
        </p>
        <p className="challenge-lobby__provisional">{t("challenge.standingsLive")}</p>
        <ChallengeSummaryStats result={entry} />
        {"attempts" in entry && (
          <p className="daily__note">{t("weekly.theirAttempts", { n: entry.attempts })}</p>
        )}
        <p className="daily__note">
          {t(mode === "daily" ? "stats.dailyWins" : "stats.weeklyWins")}: {n(entry.wins)}
        </p>
      </div>
    </Modal>
  );
}
