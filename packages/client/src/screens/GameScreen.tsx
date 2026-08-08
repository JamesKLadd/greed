import { useEffect, useRef, useState } from "react";
import { useGreed } from "../game/useGreed.js";
import type { MatchSetup } from "../game/setup.js";
import {
  loadProfile,
  recordGame,
  summarize,
  type Achievement,
  type GameSummary,
} from "../game/profile.js";
import { cosmeticVars } from "../game/cosmetics.js";
import { syncSteamAchievements } from "../game/steam.js";
import { TableView } from "../components/TableView.js";
import { Controls } from "../components/Controls.js";
import { Toast } from "../components/Toast.js";
import { GameOver } from "../components/GameOver.js";
import { RulesModal } from "../components/RulesModal.js";
import { TurnHistory } from "../components/TurnHistory.js";
import { RollOffView } from "../components/RollOffView.js";
import { MuteButton } from "../components/MuteButton.js";
import { CoachBar } from "../components/CoachBar.js";
import { useGameSounds } from "../game/useGameSounds.js";
import { useKeyboardShortcuts } from "../game/useKeyboardShortcuts.js";
import { useT } from "../i18n/i18n.js";

interface GameScreenProps {
  setup: MatchSetup;
  /** Start with the coaching hint bar on (the "Learn to play" practice game). */
  coach?: boolean;
  onExit: () => void;
}

export function GameScreen({ setup, coach = false, onExit }: GameScreenProps) {
  const ctl = useGreed(setup);
  const { state } = ctl;
  const [showRules, setShowRules] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [hints, setHints] = useState(coach);
  const [summary, setSummary] = useState<GameSummary | null>(null);
  const [unlocked, setUnlocked] = useState<Achievement[]>([]);
  const recordedRef = useRef(false);

  useGameSounds(state);

  // Record a finished solo game (one human vs. bots) into the local profile.
  useEffect(() => {
    if (state.phase !== "game-over") {
      recordedRef.current = false;
      setSummary(null);
      setUnlocked([]);
      return;
    }
    if (recordedRef.current) return;
    recordedRef.current = true;
    const humans = state.players.filter((p) => !p.isBot);
    if (humans.length !== 1) return; // only solo progression is tracked
    const s = summarize(state, humans[0].id);
    const result = recordGame(s);
    setSummary(s);
    setUnlocked(result.unlocked);
    syncSteamAchievements(result.unlocked.map((a) => a.id));
  }, [state.phase, state]);

  const current = state.players[state.turn.playerIndex];
  const lastPlayer = state.players[state.order[state.order.length - 1]];
  const canAct = !current.isBot;
  const [cosmetics] = useState(() => cosmeticVars(loadProfile()));
  const t = useT();

  useKeyboardShortcuts({
    enabled: !showRules && !showHistory && !ctl.rollOffActive && state.phase !== "game-over",
    canRoll: canAct && ctl.legal.canRoll,
    canBank: canAct && ctl.legal.canBank,
    onRoll: ctl.roll,
    onBank: ctl.bank,
    onToggleHistory: () => setShowHistory((h) => !h),
  });

  return (
    <div className="game" style={cosmetics}>
      <header className="game__bar">
        <button className="btn btn--ghost" onClick={onExit}>
          {t("bar.menu")}
        </button>
        <h1 className="game__logo">GREED</h1>
        <div className="game__bar-right">
          <button
            className={hints ? "btn btn--ghost btn--on" : "btn btn--ghost"}
            onClick={() => setHints((h) => !h)}
            aria-pressed={hints}
          >
            {t("bar.hints")}
          </button>
          <MuteButton />
          <button
            className="btn btn--ghost"
            onClick={() => setShowHistory(true)}
            title="Turn history (H)"
          >
            {t("bar.history")}
          </button>
          <button className="btn btn--ghost" onClick={() => setShowRules(true)}>
            {t("bar.rules")}
          </button>
          <button className="btn btn--ghost" onClick={() => ctl.restart()}>
            {t("bar.restart")}
          </button>
        </div>
      </header>

      {state.endgame.triggered && state.phase === "playing" && (
        <div className="banner banner--final">
          {t("banner.finalRoundPre")}
          <strong>{lastPlayer.name}</strong>
          {t("banner.finalRoundPost")}
        </div>
      )}
      {state.phase === "sudden-death" && (
        <div className="banner banner--sd">{t("banner.suddenDeath")}</div>
      )}

      {hints && <CoachBar state={state} canAct={canAct} />}

      <main className="game__main game__main--table">
        <TableView state={state} rollingIndices={ctl.rollingIndices} isRolling={ctl.isRolling} />

        <Controls
          state={state}
          legal={ctl.legal}
          isRolling={ctl.isRolling}
          canAct={canAct}
          onRoll={ctl.roll}
          onBank={ctl.bank}
        />
      </main>

      <Toast toast={ctl.toast} />

      {ctl.rollOffActive && <RollOffView entries={ctl.rollOff} onContinue={ctl.beginPlay} />}
      {state.phase === "game-over" && (
        <GameOver
          state={state}
          summary={summary}
          unlocked={unlocked}
          onPlayAgain={() => ctl.restart()}
          onMenu={onExit}
        />
      )}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
      {showHistory && <TurnHistory state={state} onClose={() => setShowHistory(false)} />}
    </div>
  );
}
