import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { BetaActiveContext, useBeta } from "./beta/BetaContext.js";
import { HomeScreen } from "./screens/HomeScreen.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { ScreenLoadState } from "./components/ScreenLoadState.js";
import { HolidayGift } from "./components/HolidayGift.js";
import { HOLIDAY_GIFT_EVENT } from "./game/holidayDice.js";
import { ChallengeInvite } from "./components/ChallengeInvite.js";
import { type MatchSetup } from "./game/setup.js";
import { useAuth } from "./game/auth.js";
import { readRoomInvitation, clearRoomInvitation } from "./game/share.js";
import { flushGrowthEvents, recordGrowthEvent } from "./game/growth.js";
import { readPlayEntry, playEntryUrl } from "./game/entry.js";
import { refreshSeasonalTheme } from "./game/seasonal.js";
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
const GrowthReportScreen = lazy(() =>
  import("./screens/GrowthReportScreen.js").then((m) => ({ default: m.GrowthReportScreen })),
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
const PracticeChallengeScreen = lazy(() =>
  import("./screens/PracticeChallengeScreen.js").then((m) => ({
    default: m.PracticeChallengeScreen,
  })),
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
  | "practice"
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
  | "account"
  | "growth";

export function App() {
  const t = useT();
  const challenges = useChallenges();
  const { status: authStatus } = useAuth();
  const [roomInvitation, setRoomInvitation] = useState(readRoomInvitation);
  const invitationOpened = useRef(false);
  const invitationJoined = useRef(false);
  const [mode, setMode] = useState<Mode>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("growth") === "1" ? "growth" : readPlayEntry(window.location.search);
  });
  const [match, setMatch] = useState<MatchSetup | null>(null);
  // Holiday dice just earned (holidayDice.ts), by signing in or by finishing a
  // game or run on the day. The badge id, until the popup is dismissed.
  const [holidayGift, setHolidayGift] = useState<string | null>(null);
  useEffect(() => {
    const announce = (e: Event) => {
      const id = (e as CustomEvent<unknown>).detail;
      if (typeof id === "string") setHolidayGift(id);
    };
    window.addEventListener(HOLIDAY_GIFT_EVENT, announce);
    return () => window.removeEventListener(HOLIDAY_GIFT_EVENT, announce);
  }, []);
  useEffect(() => {
    const refresh = () => refreshSeasonalTheme();
    const resume = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);
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
  const [authInitialMode, setAuthInitialMode] = useState<"login" | "signup">("login");
  useEffect(() => {
    const destination = mode === "auth" ? authNext : mode;
    const entry =
      destination === "daily" || destination === "weekly" || destination === "practice"
        ? destination
        : "home";
    window.history.replaceState(
      window.history.state,
      "",
      playEntryUrl(window.location.href, entry),
    );
  }, [mode, authNext]);
  // A one-line banner shown on Home after handling a verify link.
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => {
    if (!roomInvitation || invitationOpened.current || authStatus === "loading") return;
    // Account recovery links take priority over an unrelated saved room.
    const params = new URLSearchParams(window.location.search);
    if (params.has("reset") || params.has("verify")) return;
    invitationOpened.current = true;
    recordGrowthEvent("room_invite_opened");
    if (authStatus === "authed") setMode("online");
    else {
      setAuthNext("online");
      setMode("auth");
    }
  }, [roomInvitation, authStatus]);
  const roomJoined = useCallback((inGame: boolean) => {
    if (!invitationJoined.current) {
      invitationJoined.current = true;
      recordGrowthEvent("room_invite_joined");
    }
    // Lobby seats are removed on disconnect. Keep the invitation until play
    // starts so refreshing a lobby rejoins it; active games use their token.
    if (inGame) clearRoomInvitation();
  }, []);

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
    if (joinCode) {
      clearRoomInvitation();
      setRoomInvitation(null);
      setMode("online");
    }
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

  const startPractice = () => {
    setMode("practice");
  };

  const openAuth = (next: Mode | null, initial: "login" | "signup" = "login") => {
    setAuthNext(next);
    setAuthInitialMode(initial);
    if (next === "daily") recordGrowthEvent("daily_signin_opened");
    setMode("auth");
  };

  const backHome = () => {
    setResetToken(undefined);
    setAuthNext(null);
    if (roomInvitation) {
      clearRoomInvitation();
      setRoomInvitation(null);
    }
    setMode("home");
  };

  const atTable = (mode === "local" && match !== null) || mode === "online";

  // Every screen renders inside the same shell so a friend's challenge can
  // interrupt whatever the player is doing, wherever they are.
  const screen = (() => {
    if (mode === "practice")
      return (
        <PracticeChallengeScreen
          onBack={backHome}
          onDaily={() => setMode("daily")}
          onCreateAccount={() => openAuth("daily", "signup")}
          onSignIn={() => openAuth("daily")}
        />
      );
    if (mode === "auth") {
      return (
        <AuthScreen
          onDone={() => {
            const next = authNext;
            if (next === "daily") {
              recordGrowthEvent("daily_signin_completed");
              flushGrowthEvents();
            }
            setResetToken(undefined);
            setAuthNext(null);
            setMode(next ?? "home");
          }}
          onBack={backHome}
          initialMode={resetToken ? "reset" : authInitialMode}
          resetToken={resetToken}
          contextHint={
            roomInvitation && authNext === "online"
              ? t("growth.joinRoom", { code: roomInvitation })
              : authNext === "daily"
                ? t("growth.dailyAccountHint")
                : undefined
          }
        />
      );
    }

    if (mode === "daily") {
      return (
        <DailyScreen
          onBack={backHome}
          onPractice={startPractice}
          onWeekly={() => setMode("weekly")}
          onFriends={() => setMode("friends")}
          onSignIn={() => openAuth("daily")}
          onCreateAccount={() => openAuth("daily", "signup")}
        />
      );
    }

    if (mode === "weekly") {
      return (
        <WeeklyScreen
          onBack={backHome}
          onFriends={() => setMode("friends")}
          onSignIn={() => openAuth("weekly")}
        />
      );
    }

    if (mode === "friends") {
      return <FriendsScreen onBack={() => setMode("home")} onSignIn={() => openAuth("friends")} />;
    }

    if (mode === "account")
      return <AccountScreen onBack={() => setMode("home")} onGrowth={() => setMode("growth")} />;
    if (mode === "growth") return <GrowthReportScreen onBack={() => setMode("account")} />;

    if (mode === "online") {
      return (
        // Keyed by the invited room: accepting a challenge while already online
        // remounts the screen so it leaves the old room and joins the new one.
        <OnlineScreen
          key={joinCode ?? roomInvitation ?? "online"}
          autoJoin={joinCode ?? roomInvitation}
          onJoined={roomInvitation && !joinCode ? roomJoined : undefined}
          onExit={() => {
            challenges.clearJoin();
            clearRoomInvitation();
            setRoomInvitation(null);
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
        onAuth={() => openAuth(null)}
        onAuthForOnline={() => openAuth("online")}
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
      {/* Never over a table: a game's own results come first, and the popup
          waits for the player to leave. Nor over a friend's invite, which is
          the one of the two that cannot wait. */}
      {holidayGift && !atTable && !challenges.invite && (
        <HolidayGift gift={holidayGift} onClose={() => setHolidayGift(null)} />
      )}
      <Toast toast={challengeToast} />
    </BetaActiveContext.Provider>
  );
}
