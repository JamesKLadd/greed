import { useState } from "react";
import type { HomeScreenProps } from "../screens/HomeScreen.js";
import { useT } from "../i18n/i18n.js";
import { useAuth } from "../game/auth.js";
import { Die } from "../components/Die.js";
import { RulesModal } from "../components/RulesModal.js";
import { Icon } from "../ui/index.js";
import { Brand } from "./Brand.js";
import { BetaGate } from "./BetaGate.js";
import { CelebrationDemo } from "./CelebrationDemo.js";

export default function BetaHome(p: HomeScreenProps) {
  const t = useT();
  const { status, user } = useAuth();
  const [rules, setRules] = useState(false);
  const [demo, setDemo] = useState(false);
  return (
    <main className="beta-home">
      <header className="beta-home__top">
        <span className="beta-pill">
          <i />
          {t("beta.label")}
        </span>
        <button className="beta-account" onClick={status === "authed" ? p.onAccount : p.onAuth}>
          <Icon name="user" />
          {user?.username ?? t("home.signIn")}
        </button>
      </header>
      {p.flash && (
        <button className="banner" onClick={p.onDismissFlash}>
          {p.flash}
        </button>
      )}
      <div className="beta-home__layout">
        <section className="beta-hero" aria-label="Greed">
          <p className="beta-eyebrow">{t("beta.gameNight")}</p>
          <h1>
            <Brand />
          </h1>
          <p className="beta-hero__tagline">{t("beta.tagline")}</p>
          <div className="beta-display" aria-hidden="true">
            <div className="beta-display__rail" />
            <span className="beta-display__stamp">G / 5</span>
            <div className="beta-display__dice">
              <Die value={3} dimensional size={66} />
              <Die value={5} dimensional size={82} />
              <Die value={1} dimensional size={66} />
            </div>
            <span className="beta-display__star beta-display__star--one">✦</span>
            <span className="beta-display__star beta-display__star--two">✦</span>
            <span className="beta-display__caption">{t("beta.fiveDice")}</span>
          </div>
        </section>
        <section className="beta-play" aria-label={t("beta.play")}>
          <div className="beta-section-heading">
            <span>{t("beta.takeSeat")}</span>
            <span>01 — 05</span>
          </div>
          <button className="beta-play__primary" onClick={p.onLocal}>
            <span className="beta-play__icon">
              <Icon name="dice" />
            </span>
            <span>
              <strong>{t("home.local")}</strong>
              <small>{t("home.local.sub")}</small>
            </span>
            <span aria-hidden="true">↗</span>
          </button>
          <button className="beta-play__learn" onClick={p.onPractice}>
            <Icon name="graduate" />
            <span>{t("home.learn")}</span>
            <span aria-hidden="true">→</span>
          </button>
          <div className="beta-play__cards">
            <button onClick={status === "authed" ? p.onOnline : p.onAuthForOnline}>
              <Icon name="globe" />
              <strong>{t("home.online")}</strong>
              <small>{t("beta.classicMode")}</small>
            </button>
            <button onClick={p.onDaily}>
              <Icon name="check" />
              <strong>{t("daily.home")}</strong>
              <small>{t("beta.classicMode")}</small>
            </button>
            <button onClick={p.onWeekly}>
              <Icon name="trophy" />
              <strong>{t("weekly.home")}</strong>
              <small>{t("beta.classicMode")}</small>
            </button>
          </div>
          <nav className="beta-nav" aria-label={t("beta.explore")}>
            <button onClick={p.onLocker}>
              <Icon name="palette" />
              {t("home.locker")}
            </button>
            <button onClick={p.onFriends}>
              <Icon name="user" />
              {t("social.home")}
            </button>
            <button onClick={p.onBoards}>
              <Icon name="chart" />
              {t("board.home")}
            </button>
            <button onClick={p.onStats}>
              <Icon name="chart" />
              {t("home.stats")}
            </button>
          </nav>
          <button className="beta-demo-link" onClick={() => setDemo(true)}>
            <span aria-hidden="true">✦</span>
            {t("beta.previewEffects")}
            <span aria-hidden="true">→</span>
          </button>
        </section>
      </div>
      <footer className="beta-home__footer">
        <div>
          <button onClick={() => setRules(true)}>{t("home.howToPlay")}</button>
          <button onClick={p.onSettings}>{t("home.settings")}</button>
          <button onClick={p.onUpdates}>{t("home.updates")}</button>
        </div>
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
