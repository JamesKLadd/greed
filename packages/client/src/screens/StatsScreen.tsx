import { useState } from "react";
import { ACHIEVEMENTS, averageBank, loadProfile, resetProfile } from "../game/profile.js";
import { useT } from "../i18n/i18n.js";
import type { MsgKey } from "../i18n/i18n.js";

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
  ];

  const reset = () => {
    resetProfile();
    setProfile(loadProfile());
    setConfirmReset(false);
  };

  return (
    <div className="setup">
      <div className="setup__hero">
        <h1 className="setup__logo">{t("stats.title")}</h1>
        <p className="setup__tagline">{t("stats.tagline")}</p>
      </div>

      <div className="setup__panel">
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
            </span>
          </h2>
        </div>
        <ul className="ach-grid">
          {ACHIEVEMENTS.map((a) => {
            const has = profile.achievements.includes(a.id);
            return (
              <li key={a.id} className={has ? "ach" : "ach ach--locked"}>
                <span className="ach__icon">{has ? a.icon : "🔒"}</span>
                <span className="ach__body">
                  <span className="ach__title">{t(`ach.${a.id}.title` as MsgKey)}</span>
                  <span className="ach__desc">{t(`ach.${a.id}.desc` as MsgKey)}</span>
                </span>
              </li>
            );
          })}
        </ul>

        <div className="setup__actions">
          <button className="btn btn--ghost" onClick={onBack}>
            {t("bar.home")}
          </button>
          {confirmReset ? (
            <span className="stats-reset">
              <span className="overlay__note">{t("stats.erasePrompt")}</span>
              <button className="btn btn--ghost" onClick={() => setConfirmReset(false)}>
                {t("stats.cancel")}
              </button>
              <button className="btn" onClick={reset}>
                {t("stats.erase")}
              </button>
            </span>
          ) : (
            <button className="btn btn--ghost" onClick={() => setConfirmReset(true)}>
              {t("stats.reset")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
