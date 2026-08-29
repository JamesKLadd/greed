import { useState } from "react";
import {
  ACHIEVEMENTS,
  achievementScore,
  averageBank,
  loadProfile,
  maxAchievementScore,
  resetProfile,
} from "../game/profile.js";
import { useT } from "../i18n/i18n.js";
import type { MsgKey } from "../i18n/i18n.js";
import { Button, Screen } from "../ui/index.js";

export function StatsScreen({ onBack }: { onBack: () => void }) {
  const t = useT();
  const [profile, setProfile] = useState(() => loadProfile());
  const [confirmReset, setConfirmReset] = useState(false);

  const winRate =
    profile.gamesPlayed > 0 ? Math.round((profile.wins / profile.gamesPlayed) * 100) : 0;
  const unlockedCount = profile.achievements.length;

  const tiles: { label: string; value: string | number }[] = [
    { label: t("stats.games"), value: profile.gamesPlayed },
    { label: t("stats.wins"), value: profile.wins },
    { label: t("stats.winRate"), value: `${winRate}%` },
    { label: t("stats.winStreak"), value: profile.currentStreak },
    { label: t("stats.bestStreak"), value: profile.bestStreak },
    { label: t("stats.bestTurn"), value: profile.bestTurn },
    { label: t("stats.bestTotal"), value: profile.bestTotal },
    { label: t("stats.avgBank"), value: averageBank(profile) },
    // Won on the server, where the whole day's board is visible; the profile
    // carries the count back (see raiseDailyWins).
    { label: t("stats.dailyWins"), value: profile.dailyWins },
  ];

  const reset = () => {
    resetProfile();
    setProfile(loadProfile());
    setConfirmReset(false);
  };

  return (
    <Screen title={t("stats.title")} tagline={t("stats.tagline")}>
      <div className="stats-grid">
        {tiles.map((t) => (
          <div key={t.label} className="stat-tile">
            <span className="stat-tile__value">{t.value}</span>
            <span className="stat-tile__label">{t.label}</span>
          </div>
        ))}
      </div>

      <div className="setup__row setup__row--head" style={{ marginTop: 22 }}>
        <h2>
          {t("stats.achievements")}{" "}
          <span className="ach-count">
            {unlockedCount}/{ACHIEVEMENTS.length}
          </span>{" "}
          {/* One number for "how far along am I": a bronze and a gold are not
                the same achievement, so a raw count flatters a shallow profile. */}
          <span className="ach-score" title={t("stats.score")}>
            {t("stats.scoreOf", { score: achievementScore(profile), max: maxAchievementScore() })}
          </span>
        </h2>
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
              <span className="ach__icon">{has ? a.icon : "🔒"}</span>
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

      <div className="setup__actions">
        <Button variant="ghost" onClick={onBack}>
          {t("bar.home")}
        </Button>
        {confirmReset ? (
          <span className="stats-reset">
            <span className="overlay__note">{t("stats.erasePrompt")}</span>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              {t("stats.cancel")}
            </Button>
            <Button onClick={reset}>{t("stats.erase")}</Button>
          </span>
        ) : (
          <Button variant="ghost" onClick={() => setConfirmReset(true)}>
            {t("stats.reset")}
          </Button>
        )}
      </div>
    </Screen>
  );
}
