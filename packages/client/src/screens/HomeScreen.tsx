import { useEffect, useState } from "react";
import { RulesModal } from "../components/RulesModal.js";
import { useInstallPrompt } from "../game/pwa.js";
import { useT } from "../i18n/i18n.js";

interface HomeScreenProps {
  onLocal: () => void;
  onOnline: () => void;
  onPractice: () => void;
  onStats: () => void;
  onLocker: () => void;
  onSettings: () => void;
}

const SEEN_KEY = "greed:onboarded";

export function HomeScreen({
  onLocal,
  onOnline,
  onPractice,
  onStats,
  onLocker,
  onSettings,
}: HomeScreenProps) {
  const t = useT();
  const [showRules, setShowRules] = useState(false);
  const { canInstall, promptInstall } = useInstallPrompt();
  // First-time visitors get the practice button gently highlighted.
  const [firstRun, setFirstRun] = useState(false);
  useEffect(() => {
    try {
      setFirstRun(localStorage.getItem(SEEN_KEY) !== "1");
    } catch {
      /* ignore */
    }
  }, []);

  const markSeen = () => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
    setFirstRun(false);
  };

  const practice = () => {
    markSeen();
    onPractice();
  };

  return (
    <div className="setup">
      <div className="setup__hero">
        <h1 className="setup__logo">GREED</h1>
        <p className="setup__tagline">{t("home.tagline")}</p>
      </div>

      <div className="home-menu">
        <button
          className={`btn btn--big home-menu__btn home-menu__learn${firstRun ? " home-menu__learn--pulse" : ""}`}
          onClick={practice}
        >
          {t("home.learn")}
          <span className="home-menu__sub">
            {firstRun ? t("home.learn.subNew") : t("home.learn.sub")}
          </span>
        </button>
        <button className="btn btn--roll btn--big home-menu__btn" onClick={onLocal}>
          {t("home.local")}
          <span className="home-menu__sub">{t("home.local.sub")}</span>
        </button>
        <button className="btn btn--bank btn--big home-menu__btn" onClick={onOnline}>
          {t("home.online")}
          <span className="home-menu__sub">{t("home.online.sub")}</span>
        </button>
        <div className="home-menu__foot">
          <button
            className="btn btn--ghost"
            onClick={() => {
              markSeen();
              setShowRules(true);
            }}
          >
            {t("home.howToPlay")}
          </button>
          <button className="btn btn--ghost" onClick={onStats}>
            {t("home.stats")}
          </button>
          <button className="btn btn--ghost" onClick={onLocker}>
            {t("home.locker")}
          </button>
          <button className="btn btn--ghost" onClick={onSettings}>
            {t("home.settings")}
          </button>
        </div>

        {canInstall && (
          <button className="btn btn--ghost home-menu__install" onClick={promptInstall}>
            {t("home.install")}
          </button>
        )}
      </div>

      <p className="home-version">v{__APP_VERSION__}</p>

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  );
}
