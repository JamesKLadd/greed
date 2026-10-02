import { useEffect, useState } from "react";
import { weeklyAllowance } from "@greed/core";
import type { HomeScreenProps } from "../screens/HomeScreen.js";
import { useT } from "../i18n/i18n.js";
import { useAuth } from "../game/auth.js";
import { ONLINE_ENABLED } from "../game/online.js";
import { hasUnreadRelease, markReleaseSeen } from "../game/changelog.js";
import { Die } from "../components/Die.js";
import { RulesModal } from "../components/RulesModal.js";
import { Icon } from "../ui/index.js";
import { Brand } from "./Brand.js";
import { BetaGate } from "./BetaGate.js";
import { CelebrationDemo } from "./CelebrationDemo.js";
import "../styles/beta-home-polish.css";

export default function BetaHome(p: HomeScreenProps) {
  const t = useT();
  const { status, user } = useAuth();
  const [rules, setRules] = useState(false);
  const [demo, setDemo] = useState(false);
  const [newRelease, setNewRelease] = useState(false);
  const weeklyRation = weeklyAllowance();

  useEffect(() => setNewRelease(hasUnreadRelease()), []);

  // This is the mode's published rule, not an estimate of this player's
  // remaining attempts. The home menu needs no challenge-status request.
  const weeklySubtitle =
    weeklyRation.limit === null
      ? t("weekly.home.sub")
      : weeklyRation.per === "day"
        ? t("weekly.home.subCapped.day", { n: weeklyRation.limit })
        : t("weekly.home.subCapped", { n: weeklyRation.limit });

  return (
    <main className="beta-home beta-home--polished">
      <header className="beta-hub__top">
        <span className="beta-pill">
          <i />
          {t("beta.label")}
        </span>
        <button
          className="beta-hub__account"
          onClick={status === "authed" ? p.onAccount : p.onAuth}
        >
          <Icon name="user" size={20} />
          <span>{user?.username ?? t("home.signIn")}</span>
        </button>
      </header>
      {p.flash && (
        <button className="banner beta-hub__flash" onClick={p.onDismissFlash}>
          <span>{p.flash}</span>
          <Icon name="close" size={20} />
        </button>
      )}
      <div className="beta-hub__layout">
        <section className="beta-hub__hero" aria-label="Greed">
          <p className="beta-hub__eyebrow">{t("beta.gameNight")}</p>
          <h1>
            <Brand compact />
          </h1>
          <p className="beta-hub__tagline">{t("beta.tagline")}</p>
          <div className="beta-hub__ornament" aria-hidden="true">
            <Die value={3} dimensional size={32} />
            <Die value={5} dimensional size={40} />
            <Die value={1} dimensional size={32} />
          </div>
        </section>
        <div className="beta-hub__body">
          <section className="beta-hub__play" aria-labelledby="beta-play-heading">
            <h2 id="beta-play-heading" className="beta-hub__heading">
              {t("beta.takeSeat")}
            </h2>
            <div className="beta-hub__challenges">
              <button className="beta-hub__mode beta-hub__mode--daily" onClick={p.onDaily}>
                <span className="beta-hub__mode-icon">
                  <Icon name="check" size={27} />
                </span>
                <span className="beta-hub__mode-copy">
                  <strong>{t("daily.home")}</strong>
                  <small>{t("daily.home.sub")}</small>
                </span>
                <span className="beta-hub__arrow" aria-hidden="true">
                  →
                </span>
              </button>
              <button className="beta-hub__mode beta-hub__mode--weekly" onClick={p.onWeekly}>
                <span className="beta-hub__mode-icon">
                  <Icon name="trophy" size={27} />
                </span>
                <span className="beta-hub__mode-copy">
                  <strong>{t("weekly.home")}</strong>
                  <small>{weeklySubtitle}</small>
                </span>
                <span className="beta-hub__arrow" aria-hidden="true">
                  →
                </span>
              </button>
            </div>
            <div className="beta-hub__games">
              <button className="beta-hub__mode beta-hub__mode--local" onClick={p.onLocal}>
                <span className="beta-hub__mode-icon">
                  <Icon name="dice" size={25} />
                </span>
                <span className="beta-hub__mode-copy">
                  <strong>{t("home.local")}</strong>
                  <small>{t("home.local.sub")}</small>
                </span>
                <span className="beta-hub__arrow" aria-hidden="true">
                  →
                </span>
              </button>
              {ONLINE_ENABLED && (
                <button
                  className="beta-hub__mode beta-hub__mode--online"
                  onClick={status === "authed" ? p.onOnline : p.onAuthForOnline}
                >
                  <span className="beta-hub__mode-icon">
                    <Icon name={status === "authed" ? "globe" : "lock"} size={25} />
                  </span>
                  <span className="beta-hub__mode-copy">
                    <strong>{t("home.online")}</strong>
                    <small>
                      {t(status === "authed" ? "home.online.sub" : "home.online.signInSub")}
                    </small>
                  </span>
                  <span className="beta-hub__arrow" aria-hidden="true">
                    →
                  </span>
                </button>
              )}
            </div>
            <button className="beta-hub__learn" onClick={p.onPractice}>
              <Icon name="graduate" size={25} />
              <span>
                <strong>{t("home.learn")}</strong>
                <small>{t("home.learn.subNew")}</small>
              </span>
              <span className="beta-hub__arrow" aria-hidden="true">
                →
              </span>
            </button>
          </section>
          <nav className="beta-hub__explore" aria-label={t("beta.explore")}>
            <button onClick={p.onLocker}>
              <Icon name="palette" size={23} />
              <span>{t("home.locker")}</span>
            </button>
            <button onClick={p.onFriends}>
              <Icon name="user" size={23} />
              <span>{t("social.home")}</span>
            </button>
            <button onClick={p.onBoards}>
              <Icon name="trophy" size={23} />
              <span>{t("board.home")}</span>
            </button>
            <button onClick={p.onStats}>
              <Icon name="chart" size={23} />
              <span>{t("home.stats")}</span>
            </button>
          </nav>
          <nav className="beta-hub__utilities" aria-label={t("home.settings")}>
            <button onClick={() => setRules(true)}>
              <Icon name="book" size={19} />
              <span>{t("home.howToPlay")}</span>
            </button>
            <button onClick={p.onSettings}>
              <Icon name="gear" size={19} />
              <span>{t("home.settings")}</span>
            </button>
            <button
              onClick={() => {
                markReleaseSeen();
                setNewRelease(false);
                p.onUpdates();
              }}
            >
              <Icon name="scroll" size={19} />
              <span>{t("home.updates")}</span>
              {newRelease && (
                <span className="beta-hub__new" role="img" aria-label={t("home.updates.new")} />
              )}
            </button>
          </nav>
        </div>
      </div>
      <footer className="beta-hub__footer">
        <button className="beta-hub__preview" onClick={() => setDemo(true)}>
          <Icon name="eye" size={19} />
          {t("beta.previewEffects")}
        </button>
        <BetaGate />
        <small>
          {t("beta.scope")} · v{__APP_VERSION__}
        </small>
      </footer>
      {rules && <RulesModal onClose={() => setRules(false)} />}
      {demo && <CelebrationDemo onClose={() => setDemo(false)} />}
    </main>
  );
}
