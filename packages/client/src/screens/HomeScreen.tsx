import { lazy, Suspense, useEffect, useState } from "react";
import { useBetaActive } from "../beta/BetaContext.js";
import { BetaGate } from "../beta/BetaGate.js";
const BetaHome = lazy(() => import("../beta/BetaHome.js"));
import { RulesModal } from "../components/RulesModal.js";
import { weeklyAttemptLimit } from "@greed/core";
import { useInstallPrompt } from "../game/pwa.js";
import { ONLINE_ENABLED } from "../game/online.js";
import { useAuth } from "../game/auth.js";
import { hasUnreadRelease, markReleaseSeen } from "../game/changelog.js";
import { Button, Icon } from "../ui/index.js";
import { useT } from "../i18n/i18n.js";

export interface HomeScreenProps {
  onDaily: () => void;
  onWeekly: () => void;
  onLocal: () => void;
  onOnline: () => void;
  onPractice: () => void;
  onFriends: () => void;
  onStats: () => void;
  onBoards: () => void;
  onLocker: () => void;
  onUpdates: () => void;
  onSettings: () => void;
  onAuth: () => void;
  onAuthForOnline: () => void;
  onAccount: () => void;
  flash?: string | null;
  onDismissFlash?: () => void;
}

const SEEN_KEY = "greed:onboarded";

export function HomeScreen(props: HomeScreenProps) {
  const {
    onDaily,
    onWeekly,
    onLocal,
    onOnline,
    onPractice,
    onFriends,
    onStats,
    onBoards,
    onLocker,
    onUpdates,
    onSettings,
    onAuth,
    onAuthForOnline,
    onAccount,
    flash,
    onDismissFlash,
  } = props;
  const betaActive = useBetaActive();
  const t = useT();
  const { status, user } = useAuth();
  const weeklyLimit = weeklyAttemptLimit();
  const [showRules, setShowRules] = useState(false);
  const { canInstall, promptInstall } = useInstallPrompt();
  // First-time visitors get the practice button gently highlighted.
  const [firstRun, setFirstRun] = useState(false);
  // And everyone gets the update log highlighted after a release they haven't
  // read. Read in an effect rather than in the initial state so the storage
  // access happens off the first paint, like the onboarding flag above.
  const [newRelease, setNewRelease] = useState(false);
  useEffect(() => {
    try {
      setFirstRun(localStorage.getItem(SEEN_KEY) !== "1");
    } catch {
      /* ignore */
    }
    setNewRelease(hasUnreadRelease());
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

  if (betaActive)
    return (
      <Suspense
        fallback={
          <div className="setup">
            <BetaGate />
          </div>
        }
      >
        <BetaHome {...props} />
      </Suspense>
    );

  return (
    <div className="setup">
      <div className="home-account">
        {status === "authed" && user ? (
          <button className="home-account__chip" onClick={onAccount} title="Account">
            <span className="home-account__avatar">{user.username.slice(0, 2).toUpperCase()}</span>
            <span className="home-account__name">{user.username}</span>
          </button>
        ) : status === "anon" ? (
          <button className="btn btn--ghost home-account__signin" onClick={onAuth}>
            {t("home.signIn")}
          </button>
        ) : null}
      </div>

      <div className="setup__hero">
        <h1 className="setup__logo">GREED</h1>
        <p className="setup__tagline">{t("home.tagline")}</p>
      </div>

      {flash && (
        <div className="banner home-flash" onClick={onDismissFlash}>
          {flash} <span className="online-error__x">✕</span>
        </div>
      )}

      <div className="home-menu">
        <button
          className={`btn btn--big home-menu__btn home-menu__learn${firstRun ? " home-menu__learn--pulse" : ""}`}
          onClick={practice}
        >
          <span className="home-menu__label">
            <Icon name="graduate" />
            {t("home.learn")}
          </span>
          <span className="home-menu__sub">
            {firstRun ? t("home.learn.subNew") : t("home.learn.sub")}
          </span>
        </button>
        <button className="btn btn--big home-menu__btn home-menu__daily" onClick={onDaily}>
          <span className="home-menu__label">
            <Icon name="check" />
            {t("daily.home")}
          </span>
          <span className="home-menu__sub">{t("daily.home.sub")}</span>
        </button>
        <button className="btn btn--big home-menu__btn home-menu__weekly" onClick={onWeekly}>
          <span className="home-menu__label">
            <Icon name="trophy" />
            {t("weekly.home")}
          </span>
          {/* The mode's own promise, not this player's remaining attempts —
              the home menu holds no weekly status and fetching one for a
              subtitle would put a round trip in front of the front door. The
              rule is a pure function of the week, so it can be answered here. */}
          <span className="home-menu__sub">
            {weeklyLimit === null
              ? t("weekly.home.sub")
              : t("weekly.home.subCapped", { n: weeklyLimit })}
          </span>
        </button>
        <button className="btn btn--roll btn--big home-menu__btn" onClick={onLocal}>
          <span className="home-menu__label">
            <Icon name="dice" />
            {t("home.local")}
          </span>
          <span className="home-menu__sub">{t("home.local.sub")}</span>
        </button>
        {ONLINE_ENABLED && (
          <button
            className={`btn btn--bank btn--big home-menu__btn${
              status === "authed" ? "" : " home-menu__btn--locked"
            }`}
            // Online play requires an account: signed-out clicks go to sign-in,
            // then drop the player straight into online once they're in.
            onClick={status === "authed" ? onOnline : onAuthForOnline}
          >
            <span className="home-menu__label">
              <Icon name={status === "authed" ? "globe" : "lock"} />
              {t("home.online")}
            </span>
            <span className="home-menu__sub">
              {status === "authed" ? t("home.online.sub") : t("home.online.signInSub")}
            </span>
          </button>
        )}
        <div className="home-menu__foot">
          <Button
            variant="ghost"
            onClick={() => {
              markSeen();
              setShowRules(true);
            }}
          >
            <Icon name="book" />
            {t("home.howToPlay")}
          </Button>
          <Button variant="ghost" onClick={onFriends}>
            <Icon name="user" />
            {t("social.home")}
          </Button>
          <Button variant="ghost" onClick={onBoards}>
            <Icon name="chart" />
            {t("board.home")}
          </Button>
          <Button variant="ghost" onClick={onStats}>
            <Icon name="chart" />
            {t("home.stats")}
          </Button>
          <Button variant="ghost" onClick={onLocker}>
            <Icon name="palette" />
            {t("home.locker")}
          </Button>
          <Button variant="ghost" onClick={onSettings}>
            <Icon name="gear" />
            {t("home.settings")}
          </Button>
          {/* Last in the row: it is the one thing here you read once per
              release rather than per session — which is also why it is the one
              thing that asks to be noticed when it changes. */}
          <Button
            variant="ghost"
            className={newRelease ? "home-menu__updates--new" : undefined}
            onClick={() => {
              // Opening it is what counts as reading it, so the highlight goes
              // now and does not come back until the next release.
              markReleaseSeen();
              setNewRelease(false);
              onUpdates();
            }}
          >
            <Icon name="book" />
            {t("home.updates")}
            {newRelease && (
              /* A dot as well as the pulse: the pulse is what catches the eye,
                 but reduced motion collapses every animation in the sheet, and
                 the notice has to survive that. Labelled rather than hidden, so
                 it is announced too — the whole point is that it says
                 something. */
              <span className="home-menu__newDot" role="img" aria-label={t("home.updates.new")} />
            )}
          </Button>
        </div>

        {canInstall && (
          <button className="btn btn--ghost home-menu__install" onClick={promptInstall}>
            <Icon name="download" />
            {t("home.install")}
          </button>
        )}
      </div>

      <p className="home-version">v{__APP_VERSION__}</p>
      <BetaGate />

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  );
}
