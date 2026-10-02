import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { BetaActiveContext, useBeta } from "./beta/BetaContext.js";
import { HomeScreen } from "./screens/HomeScreen.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { ScreenLoadState } from "./components/ScreenLoadState.js";
import { ChallengeInvite } from "./components/ChallengeInvite.js";
import { practiceSetup, type MatchSetup } from "./game/setup.js";
import { verifyEmail } from "./net/auth.js";
import { useChallenges } from "./net/challenges.js";
import { Toast } from "./components/Toast.js";
import type { ToastMessage } from "./game/useGreed.js";
import { useT } from "./i18n/i18n.js";

// Load mode-specific UI only when opened. The build-generated offline shell
// caches these chunks too, so deferred local play still works after install.
const SetupScreen = lazy(() =>
  import("./screens/SetupScreen.js").then((m) => ({ default: m.SetupScreen })),
);
const GameScreen = lazy(() =>
  import("./screens/GameScreen.js").then((m) => ({ default: m.GameScreen })),
);
const OnlineScreen = lazy(() =>
  import("./screens/OnlineScreen.js").then((m) => ({ default: m.OnlineScreen })),
);
const StatsScreen = lazy(() =>
  import("./screens/StatsScreen.js").then((m) => ({ default: m.StatsScreen })),
);
const LeaderboardScreen = lazy(() =>
  import("./screens/LeaderboardScreen.js").then((m) => ({ default: m.LeaderboardScreen })),
);
const LockerScreen = lazy(() =>
  import("./screens/LockerScreen.js").then((m) => ({ default: m.LockerScreen })),
);
const UpdateLogScreen = lazy(() =>
  import("./screens/UpdateLogScreen.js").then((m) => ({ default: m.UpdateLogScreen })),
);
const SettingsScreen = lazy(() =>
  import("./screens/SettingsScreen.js").then((m) => ({ default: m.SettingsScreen })),
);
const AuthScreen = lazy(() =>
  import("./screens/AuthScreen.js").then((m) => ({ default: m.AuthScreen })),
);
const AccountScreen = lazy(() =>
  import("./screens/AccountScreen.js").then((m) => ({ default: m.AccountScreen })),
);
const DailyScreen = lazy(() =>
  import("./screens/DailyScreen.js").then((m) => ({ default: m.DailyScreen })),
);
const WeeklyScreen = lazy(() =>
  import("./screens/WeeklyScreen.js").then((m) => ({ default: m.WeeklyScreen })),
);
const FriendsScreen = lazy(() =>
  import("./screens/FriendsScreen.js").then((m) => ({ default: m.FriendsScreen })),
);
const UiGallery = import.meta.env.DEV
  ? lazy(() => import("./screens/UiGallery.js").then((m) => ({ default: m.UiGallery })))
  : null;
const ScreenLoadReview = import.meta.env.DEV
  ? lazy(() => import("./dev/screenLoadReview/ScreenLoadReview.js"))
  : null;

// The composition study is deliberately excluded from shipped game code.
const TablePrototype = import.meta.env.DEV
  ? lazy(() => import("./dev/tablePrototype/TablePrototype.js"))
  : null;
const PlayableTableReview = import.meta.env.DEV
  ? lazy(() => import("./dev/tablePrototype/PlayableTableReview.js"))
  : null;
const TableEventReview = import.meta.env.DEV
  ? lazy(() => import("./dev/tablePrototype/TableEventReview.js"))
  : null;
const ChallengeReview = import.meta.env.DEV
  ? lazy(() => import("./dev/challengePrototype/ChallengeReview.js"))
  : null;
const MenuReview = import.meta.env.DEV
  ? lazy(() => import("./dev/challengePrototype/MenuReview.js"))
  : null;
const ChallengeLobbyReview = import.meta.env.DEV
  ? lazy(() => import("./dev/challengePrototype/ChallengeLobbyReview.js"))
  : null;
const PolishReview = import.meta.env.DEV
  ? lazy(() => import("./dev/polishReview/PolishReview.js"))
  : null;
const CharacterPilotReview = import.meta.env.DEV
  ? lazy(() => import("./dev/characterPilot/CharacterPilotReview.js"))
  : null;
const CastReview = import.meta.env.DEV
  ? lazy(() => import("./dev/characterPilot/CastReview.js"))
  : null;
const SupportReview = import.meta.env.DEV
  ? lazy(() => import("./dev/supportReview/SupportReview.js"))
  : null;

type Mode =
  | "home"
  | "local"
  | "online"
  | "daily"
  | "weekly"
  | "friends"
  | "stats"
  | "boards"
  | "locker"
  | "updates"
  | "settings"
  | "auth"
  | "account";

export function App() {
  const t = useT();
  const challenges = useChallenges();
  const [mode, setMode] = useState<Mode>("home");
  const [match, setMatch] = useState<MatchSetup | null>(null);
  const beta = useBeta();
  // All game modes share the default presentation or the chosen Classic fallback.
  const betaActive = beta.enabled;
  useEffect(() => {
    if (betaActive) window.scrollTo({ top: 0, left: 0 });
  }, [mode, betaActive]);
  useLayoutEffect(() => {
    document.documentElement.dataset.presentation = betaActive ? "beta" : "classic";
    return () => {
      delete document.documentElement.dataset.presentation;
    };
  }, [betaActive]);
  // A password-reset token pulled from the email link (?reset=…).
  const [resetToken, setResetToken] = useState<string | undefined>(undefined);
  // Where to land after a successful sign-in (e.g. straight into online play when
  // the user signed in from the gated Online button).
  const [authNext, setAuthNext] = useState<Mode | null>(null);
  // A one-line banner shown on Home after handling a verify link.
  const [flash, setFlash] = useState<string | null>(null);

  // Handle account links arriving in the URL (?verify=… / ?reset=…), then strip
  // them so a refresh doesn't re-trigger the flow.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const verify = params.get("verify");
    const reset = params.get("reset");
    if (!verify && !reset) return;
    if (reset) {
      setResetToken(reset);
      setMode("auth");
    } else if (verify) {
      verifyEmail(verify)
        .then(({ verified }) => setFlash(verified ? t("auth.verifiedOk") : t("auth.verifyExpired")))
        .catch(() => setFlash(t("auth.verifyFailed")));
    }
    params.delete("verify");
    params.delete("reset");
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    // Runs once on mount; `t` is only read for the one-off flash message.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A challenge (sent or accepted) names a private room to go to: switch to
  // online play and let OnlineScreen join it.
  const joinCode = challenges.joinCode;
  useEffect(() => {
    if (joinCode) setMode("online");
  }, [joinCode]);

  // Challenge feedback ("waiting for X", "X declined", connection trouble) as a
  // toast, since it can arrive on any screen.
  const { notice, error: challengeError, dismissNotice, dismissError } = challenges;
  const challengeToast = useMemo<ToastMessage | null>(() => {
    if (challengeError) return { id: Date.now(), text: challengeError, tone: "bad" };
    if (!notice) return null;
    return {
      id: Date.now(),
      text: t(`challenge.${notice.kind}`, { name: notice.name }),
      tone: notice.kind === "waiting" ? "good" : "bad",
    };
  }, [notice, challengeError, t]);

  useEffect(() => {
    if (!challengeToast) return;
    const id = window.setTimeout(() => {
      dismissNotice();
      dismissError();
    }, 3500);
    return () => window.clearTimeout(id);
  }, [challengeToast, dismissNotice, dismissError]);

  // Dev-only visual reference for the design system (see UiGallery.tsx). Guarded
  // by import.meta.env.DEV so it is dropped from production builds entirely.
  if (ScreenLoadReview && new URLSearchParams(window.location.search).has("load-review")) {
    return (
      <Suspense fallback={<p>Opening loading review…</p>}>
        <ScreenLoadReview />
      </Suspense>
    );
  }
  if (SupportReview && new URLSearchParams(window.location.search).has("support-review")) {
    return (
      <Suspense fallback={<p>Opening supporting-screen review…</p>}>
        <SupportReview />
      </Suspense>
    );
  }
  if (CastReview && new URLSearchParams(window.location.search).has("cast-review")) {
    return (
      <Suspense fallback={<p>Opening cast and material review…</p>}>
        <CastReview />
      </Suspense>
    );
  }
  if (CharacterPilotReview && new URLSearchParams(window.location.search).has("character-pilot")) {
    return (
      <Suspense fallback={<p>Opening character pilot…</p>}>
        <CharacterPilotReview />
      </Suspense>
    );
  }
  if (PolishReview && new URLSearchParams(window.location.search).has("polish-review")) {
    return (
      <Suspense fallback={<p>Opening table and match polish samples…</p>}>
        <PolishReview />
      </Suspense>
    );
  }
  if (ChallengeLobbyReview && new URLSearchParams(window.location.search).has("challenge-lobby")) {
    return (
      <Suspense fallback={<p>Opening challenge lobby fixture…</p>}>
        <ChallengeLobbyReview />
      </Suspense>
    );
  }
  if (MenuReview && new URLSearchParams(window.location.search).has("menu-preview")) {
    return (
      <Suspense fallback={<p>Opening menu fixture…</p>}>
        <MenuReview />
      </Suspense>
    );
  }
  if (ChallengeReview && new URLSearchParams(window.location.search).has("challenge-play")) {
    return (
      <Suspense fallback={<p>Opening challenge fixture…</p>}>
        <ChallengeReview />
      </Suspense>
    );
  }
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("table-online")) {
    return (
      <BetaActiveContext.Provider value={betaActive}>
        <Suspense fallback={<ScreenLoadState onBack={() => (window.location.href = "/")} />}>
          <OnlineScreen
            recordResults={false}
            onExit={() => {
              window.location.href = "/";
            }}
          />
        </Suspense>
      </BetaActiveContext.Provider>
    );
  }
  if (TableEventReview && new URLSearchParams(window.location.search).has("table-events")) {
    return (
      <Suspense fallback={<p>Opening table events…</p>}>
        <TableEventReview />
      </Suspense>
    );
  }
  if (PlayableTableReview && new URLSearchParams(window.location.search).has("table-play")) {
    return (
      <Suspense fallback={<p>Opening local table…</p>}>
        <PlayableTableReview />
      </Suspense>
    );
  }
  if (TablePrototype && new URLSearchParams(window.location.search).has("table-preview")) {
    return (
      <Suspense fallback={<p>Opening table preview…</p>}>
        <TablePrototype />
      </Suspense>
    );
  }
  if (UiGallery && new URLSearchParams(window.location.search).has("ui")) {
    return (
      <Suspense fallback={<p>Opening UI gallery…</p>}>
        <UiGallery />
      </Suspense>
    );
  }

  const leaveGame = () => {
    setMatch(null);
  };

  // "Learn to play" is now just a gentle table (one easy bot). It used to also
  // switch on a coaching hint bar; that guidance is on in every game now.
  const startPractice = () => {
    setMatch(practiceSetup());
    setMode("local");
  };

  const backHome = () => {
    setResetToken(undefined);
    setAuthNext(null);
    setMode("home");
  };

  // Every screen renders inside the same shell so a friend's challenge can
  // interrupt whatever the player is doing, wherever they are.
  const screen = (() => {
    if (mode === "auth") {
      return (
        <AuthScreen
          onDone={() => {
            const next = authNext;
            setResetToken(undefined);
            setAuthNext(null);
            setMode(next ?? "home");
          }}
          onBack={backHome}
          initialMode={resetToken ? "reset" : "login"}
          resetToken={resetToken}
        />
      );
    }

    if (mode === "daily") {
      return (
        <DailyScreen
          onBack={() => setMode("home")}
          onSignIn={() => {
            setAuthNext("daily");
            setMode("auth");
          }}
        />
      );
    }

    if (mode === "weekly") {
      return (
        <WeeklyScreen
          onBack={() => setMode("home")}
          onSignIn={() => {
            setAuthNext("weekly");
            setMode("auth");
          }}
        />
      );
    }

    if (mode === "friends") {
      return (
        <FriendsScreen
          onBack={() => setMode("home")}
          onSignIn={() => {
            setAuthNext("friends");
            setMode("auth");
          }}
        />
      );
    }

    if (mode === "account") return <AccountScreen onBack={() => setMode("home")} />;

    if (mode === "online") {
      return (
        // Keyed by the invited room: accepting a challenge while already online
        // remounts the screen so it leaves the old room and joins the new one.
        <OnlineScreen
          key={joinCode ?? "online"}
          autoJoin={joinCode}
          onExit={() => {
            challenges.clearJoin();
            setMode("home");
          }}
        />
      );
    }

    if (mode === "stats") return <StatsScreen onBack={() => setMode("home")} />;
    if (mode === "boards") return <LeaderboardScreen onBack={() => setMode("home")} />;
    if (mode === "locker") return <LockerScreen onBack={() => setMode("home")} />;
    if (mode === "updates") return <UpdateLogScreen onBack={() => setMode("home")} />;
    if (mode === "settings") return <SettingsScreen onBack={() => setMode("home")} />;

    if (mode === "local") {
      if (!match) {
        return <SetupScreen onStart={setMatch} onBack={() => setMode("home")} />;
      }
      return <GameScreen setup={match} onExit={leaveGame} />;
    }

    return (
      <HomeScreen
        flash={flash}
        onDismissFlash={() => setFlash(null)}
        onDaily={() => setMode("daily")}
        onWeekly={() => setMode("weekly")}
        onLocal={() => setMode("local")}
        onOnline={() => setMode("online")}
        onPractice={startPractice}
        onFriends={() => setMode("friends")}
        onStats={() => setMode("stats")}
        onBoards={() => setMode("boards")}
        onLocker={() => setMode("locker")}
        onUpdates={() => setMode("updates")}
        onSettings={() => setMode("settings")}
        onAuth={() => {
          setAuthNext(null);
          setMode("auth");
        }}
        onAuthForOnline={() => {
          setAuthNext("online");
          setMode("auth");
        }}
        onAccount={() => setMode("account")}
      />
    );
  })();

  return (
    <BetaActiveContext.Provider value={betaActive}>
      {mode === "home" ? (
        screen
      ) : (
        <ErrorBoundary key={mode} fallback={<ScreenLoadState failed onBack={backHome} />}>
          <Suspense fallback={<ScreenLoadState onBack={backHome} />}>{screen}</Suspense>
        </ErrorBoundary>
      )}
      {challenges.invite && (
        <ChallengeInvite
          invite={challenges.invite}
          onAccept={challenges.accept}
          onDecline={challenges.decline}
        />
      )}
      <Toast toast={challengeToast} />
    </BetaActiveContext.Provider>
  );
}
