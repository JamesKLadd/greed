import { useId, useState } from "react";
import {
  ACHIEVEMENTS,
  achievementScore,
  averageBank,
  loadProfile,
  maxAchievementScore,
  resetProfile,
  type Profile,
} from "../game/profile.js";
import { useI18n } from "../i18n/i18n.js";
import type { MsgKey } from "../i18n/i18n.js";
import { Button, Modal, Screen } from "../ui/index.js";

export function StatsScreen({ onBack }: { onBack: () => void }) {
  const [profile, setProfile] = useState(() => loadProfile());
  const reset = () => {
    resetProfile();
    setProfile(loadProfile());
  };
  return <StatsScreenView profile={profile} onReset={reset} onBack={onBack} />;
}

/** The same view accepts a read-only sample profile in the DEV review screen. */
export function StatsScreenView({
  profile,
  onReset,
  onBack,
}: {
  profile: Profile;
  onReset: () => void;
  onBack: () => void;
}) {
  const { t, n } = useI18n();
  const ids = useId();
  const [confirmReset, setConfirmReset] = useState(false);
  const winRate =
    profile.gamesPlayed > 0 ? Math.round((profile.wins / profile.gamesPlayed) * 100) : 0;
  const unlockedCount = profile.achievements.length;
  const groups: { title: MsgKey; tiles: { label: MsgKey; value: string }[] }[] = [
    {
      title: "stats.section.matches",
      tiles: [
        { label: "stats.games", value: n(profile.gamesPlayed) },
        { label: "stats.wins", value: n(profile.wins) },
        { label: "stats.winRate", value: `${n(winRate)}%` },
        { label: "stats.winStreak", value: n(profile.currentStreak) },
        { label: "stats.bestStreak", value: n(profile.bestStreak) },
      ],
    },
    {
      title: "stats.section.points",
      tiles: [
        { label: "stats.bestTotal", value: n(profile.bestTotal) },
        { label: "stats.bestTurn", value: n(profile.bestTurn) },
        { label: "stats.avgBank", value: n(averageBank(profile)) },
      ],
    },
    {
      title: "stats.section.challenges",
      // These wins arrive from the server's closed-period ledger. Presentation
      // must not derive a different count from the locally displayed runs.
      tiles: [
        { label: "stats.dailyWins", value: n(profile.dailyWins) },
        { label: "stats.weeklyWins", value: n(profile.weeklyWins) },
      ],
    },
  ];

  return (
    <Screen
      hero={false}
      className="support-screen"
      panelClassName="support-panel support-stats"
      actions={
        <Button variant="ghost" onClick={onBack}>
          {t("bar.home")}
        </Button>
      }
    >
      <header className="support-panel__heading">
        <h1>{t("stats.title")}</h1>
        <p className="support-panel__intro">{t("stats.tagline")}</p>
      </header>

      <div className="stats-sections">
        {groups.map((group, index) => (
          <section
            key={group.title}
            className="support-section stats-section"
            aria-labelledby={`${ids}-group-${index}`}
          >
            <h2 id={`${ids}-group-${index}`}>{t(group.title)}</h2>
            <dl className="stats-grid">
              {group.tiles.map((tile) => (
                <div key={tile.label} className="stat-tile">
                  <dt className="stat-tile__label">{t(tile.label)}</dt>
                  <dd className="stat-tile__value">{tile.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      <section
        className="support-section stats-achievements"
        aria-labelledby={`${ids}-achievements`}
      >
        <div className="stats-achievements__heading">
          <h2 id={`${ids}-achievements`}>{t("stats.achievements")}</h2>
          <p className="ach-count">
            {t("stats.unlocked", { count: n(unlockedCount), total: n(ACHIEVEMENTS.length) })}
          </p>
          <p className="ach-score">
            {t("stats.score")}:{" "}
            {t("stats.scoreOf", {
              score: n(achievementScore(profile)),
              max: n(maxAchievementScore()),
            })}
          </p>
        </div>
        <ul className="ach-grid">
          {ACHIEVEMENTS.map((a) => {
            const has = profile.achievements.includes(a.id);
            return (
              <li
                key={a.id}
                className={has ? "ach" : "ach ach--locked"}
                data-tier={has ? a.tier : undefined}
              >
                <span
                  className="ach__icon"
                  role="img"
                  aria-label={t(has ? "stats.statusUnlocked" : "stats.statusLocked")}
                >
                  {has ? a.icon : "🔒"}
                </span>
                <span className="ach__body">
                  <span className="ach__title">
                    {t(`ach.${a.id}.title` as MsgKey)}
                    <span className="ach__tier" data-tier={a.tier}>
                      {t(`ach.tier.${a.tier}` as MsgKey)}
                    </span>
                  </span>
                  <span className="ach__desc">{t(`ach.${a.id}.desc` as MsgKey)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="stats-reset-panel" aria-labelledby={`${ids}-reset`}>
        <h2 id={`${ids}-reset`}>{t("stats.localProfile")}</h2>
        <p id={`${ids}-reset-hint`}>{t("stats.resetHint")}</p>
        <Button
          variant="ghost"
          aria-describedby={`${ids}-reset-hint`}
          onClick={() => setConfirmReset(true)}
        >
          {t("stats.resetProfile")}
        </Button>
      </section>

      {confirmReset && (
        <Modal
          className="support-reset-modal"
          title={t("stats.resetQuestion")}
          onClose={() => setConfirmReset(false)}
          scroll
          actions={
            <>
              <Button variant="ghost" onClick={() => setConfirmReset(false)}>
                {t("stats.cancel")}
              </Button>
              <Button
                className="btn--danger"
                onClick={() => {
                  onReset();
                  setConfirmReset(false);
                }}
              >
                {t("stats.eraseProfile")}
              </Button>
            </>
          }
        >
          <p className="support-panel__intro">{t("stats.resetHint")}</p>
        </Modal>
      )}
    </Screen>
  );
}
