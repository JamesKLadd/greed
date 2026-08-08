import { useState } from "react";
import { HomeScreen } from "./screens/HomeScreen.js";
import { SetupScreen } from "./screens/SetupScreen.js";
import { GameScreen } from "./screens/GameScreen.js";
import { OnlineScreen } from "./screens/OnlineScreen.js";
import { StatsScreen } from "./screens/StatsScreen.js";
import { LockerScreen } from "./screens/LockerScreen.js";
import { SettingsScreen } from "./screens/SettingsScreen.js";
import { practiceSetup, type MatchSetup } from "./game/setup.js";

type Mode = "home" | "local" | "online" | "stats" | "locker" | "settings";

export function App() {
  const [mode, setMode] = useState<Mode>("home");
  const [match, setMatch] = useState<MatchSetup | null>(null);
  // Coaching hints for a guided practice game (the "Learn to play" flow).
  const [coach, setCoach] = useState(false);

  const leaveGame = () => {
    setMatch(null);
    setCoach(false);
  };

  const startPractice = () => {
    setMatch(practiceSetup());
    setCoach(true);
    setMode("local");
  };

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
      onLocal={() => setMode("local")}
      onOnline={() => setMode("online")}
      onPractice={startPractice}
      onStats={() => setMode("stats")}
      onLocker={() => setMode("locker")}
      onSettings={() => setMode("settings")}
    />
  );
}
