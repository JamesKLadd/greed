import { useEffect, useMemo, useState } from "react";
import { HomeScreen } from "./screens/HomeScreen.js";
import { SetupScreen } from "./screens/SetupScreen.js";
import { GameScreen } from "./screens/GameScreen.js";
import { OnlineScreen } from "./screens/OnlineScreen.js";
import { StatsScreen } from "./screens/StatsScreen.js";
import { LeaderboardScreen } from "./screens/LeaderboardScreen.js";
import { LockerScreen } from "./screens/LockerScreen.js";
import { UpdateLogScreen } from "./screens/UpdateLogScreen.js";
import { SettingsScreen } from "./screens/SettingsScreen.js";
import { AuthScreen } from "./screens/AuthScreen.js";
import { AccountScreen } from "./screens/AccountScreen.js";
import { UiGallery } from "./screens/UiGallery.js";
import { DailyScreen } from "./screens/DailyScreen.js";
import { FriendsScreen } from "./screens/FriendsScreen.js";
import { ChallengeInvite } from "./components/ChallengeInvite.js";
import { practiceSetup, type MatchSetup } from "./game/setup.js";
import { verifyEmail } from "./net/auth.js";
import { useChallenges } from "./net/challenges.js";
import { Toast } from "./components/Toast.js";
import type { ToastMessage } from "./game/useGreed.js";
import { useT } from "./i18n/i18n.js";

type Mode =
  | "home"
  | "local"
  | "online"
  | "daily"
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
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("ui")) {
    return <UiGallery />;
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
    <>
      {screen}
      {challenges.invite && (
        <ChallengeInvite
          invite={challenges.invite}
          onAccept={challenges.accept}
          onDecline={challenges.decline}
        />
      )}
      <Toast toast={challengeToast} />
    </>
  );
}
