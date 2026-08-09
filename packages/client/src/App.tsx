import { useEffect, useState } from "react";
import { HomeScreen } from "./screens/HomeScreen.js";
import { SetupScreen } from "./screens/SetupScreen.js";
import { GameScreen } from "./screens/GameScreen.js";
import { OnlineScreen } from "./screens/OnlineScreen.js";
import { StatsScreen } from "./screens/StatsScreen.js";
import { LockerScreen } from "./screens/LockerScreen.js";
import { SettingsScreen } from "./screens/SettingsScreen.js";
import { AuthScreen } from "./screens/AuthScreen.js";
import { AccountScreen } from "./screens/AccountScreen.js";
import { UiGallery } from "./screens/UiGallery.js";
import { practiceSetup, type MatchSetup } from "./game/setup.js";
import { verifyEmail } from "./net/auth.js";

type Mode = "home" | "local" | "online" | "stats" | "locker" | "settings" | "auth" | "account";

export function App() {
  const [mode, setMode] = useState<Mode>("home");
  const [match, setMatch] = useState<MatchSetup | null>(null);
  // Coaching hints for a guided practice game (the "Learn to play" flow).
  const [coach, setCoach] = useState(false);
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
        .then(({ verified }) =>
          setFlash(
            verified ? "✓ Email verified — you're all set!" : "That verification link has expired.",
          ),
        )
        .catch(() => setFlash("Couldn't verify that link. Please try again."));
    }
    params.delete("verify");
    params.delete("reset");
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
  }, []);

  // Dev-only visual reference for the design system (see UiGallery.tsx). Guarded
  // by import.meta.env.DEV so it is dropped from production builds entirely.
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("ui")) {
    return <UiGallery />;
  }

  const leaveGame = () => {
    setMatch(null);
    setCoach(false);
  };

  const startPractice = () => {
    setMatch(practiceSetup());
    setCoach(true);
    setMode("local");
  };

  const backHome = () => {
    setResetToken(undefined);
    setAuthNext(null);
    setMode("home");
  };

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

  if (mode === "account") {
    return <AccountScreen onBack={() => setMode("home")} />;
  }

  if (mode === "online") {
    return <OnlineScreen onExit={() => setMode("home")} />;
  }

  if (mode === "stats") {
    return <StatsScreen onBack={() => setMode("home")} />;
  }

  if (mode === "locker") {
    return <LockerScreen onBack={() => setMode("home")} />;
  }

  if (mode === "settings") {
    return <SettingsScreen onBack={() => setMode("home")} />;
  }

  if (mode === "local") {
    if (!match) {
      return (
        <SetupScreen
          onStart={(s) => {
            setCoach(false);
            setMatch(s);
          }}
          onBack={() => setMode("home")}
        />
      );
    }
    return <GameScreen setup={match} coach={coach} onExit={leaveGame} />;
  }

  return (
    <HomeScreen
      flash={flash}
      onDismissFlash={() => setFlash(null)}
      onLocal={() => setMode("local")}
      onOnline={() => setMode("online")}
      onPractice={startPractice}
      onStats={() => setMode("stats")}
      onLocker={() => setMode("locker")}
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
}
