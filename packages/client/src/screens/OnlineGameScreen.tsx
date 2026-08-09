import { useEffect, useRef, useState } from "react";
import { getLegalActions } from "@greed/core";
import type { OnlineController } from "../net/useOnlineGame.js";
import { TableView } from "../components/TableView.js";
import { Controls } from "../components/Controls.js";
import { Toast } from "../components/Toast.js";
import { RulesModal } from "../components/RulesModal.js";
import { TurnHistory } from "../components/TurnHistory.js";
import { GameOver } from "../components/GameOver.js";
import { useGameSounds } from "../game/useGameSounds.js";
import { useTurnCue } from "../game/useTurnCue.js";
import { useKeyboardShortcuts } from "../game/useKeyboardShortcuts.js";
import { recordGame, summarize, type Achievement, type GameSummary } from "../game/profile.js";
import { diceVarsById } from "../game/cosmetics.js";
import { loadSettings } from "../game/settings.js";
import { VolumeControls } from "../components/VolumeControls.js";
import { syncSteamAchievements } from "../game/steam.js";
import { syncProfileUp } from "../net/auth.js";
import { BarButton } from "../ui/index.js";
import { useT } from "../i18n/i18n.js";

export function OnlineGameScreen({ net }: { net: OnlineController }) {
  const t = useT();
  const state = net.game!;
  const [showRules, setShowRules] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [summary, setSummary] = useState<GameSummary | null>(null);
  const [unlocked, setUnlocked] = useState<Achievement[]>([]);
  const recordedRef = useRef(false);

  useGameSounds(state);
  // Chime when it becomes this client's turn (not for spectators).
  useTurnCue(state, state.players[state.turn.playerIndex].id === net.youId);

  // Record a finished online game into the local profile (this client's seat).
  useEffect(() => {
    if (state.phase !== "game-over") {
      recordedRef.current = false;
      setSummary(null);
      setUnlocked([]);
      return;
    }
    if (recordedRef.current || !net.youId) return;
    recordedRef.current = true;
    const s = summarize(state, net.youId);
    const result = recordGame(s);
    setSummary(s);
    setUnlocked(result.unlocked);
    syncSteamAchievements(result.unlocked.map((a) => a.id));
    void syncProfileUp(); // push updated stats to the account if signed in
  }, [state.phase, state, net.youId]);

  const current = state.players[state.turn.playerIndex];
  const lastPlayer = state.players[state.order[state.order.length - 1]];
  const canAct = current.id === net.youId && state.phase !== "game-over";
  const legal = getLegalActions(state);
  const isHost = net.lobby?.seats.find((s) => s.id === net.youId)?.isHost ?? false;
  // Online: the dice in the center belong to whoever's turn it is, so render the
  // CURRENT player's equipped skin (broadcast by the server) for every viewer.
  // Never a table theme — the felt stays shared/identical for everyone.
  const diceVars = diceVarsById(net.skins[current.id] ?? "ivory");

  useKeyboardShortcuts({
    enabled: !showRules && !showHistory && state.phase !== "game-over",
    blockedByDialog: showRules || state.phase === "game-over",
    canRoll: canAct && legal.canRoll,
    canBank: canAct && legal.canBank,
    onRoll: net.roll,
    onBank: net.bank,
    onToggleHistory: () => setShowHistory((h) => !h),
  });

  return (
    <div className="game" style={diceVars}>
      <header className="game__bar">
        <BarButton name="menu" onClick={net.leave}>
          {t("bar.leave")}
        </BarButton>
        <h1 className="game__logo">
          {loadSettings().hideRoomCode ? "GREED" : `GREED · ${net.code}`}
        </h1>
        <div className="game__bar-right">
          <VolumeControls />
          <BarButton name="history" onClick={() => setShowHistory(true)} title={t("history.title")}>
            {t("bar.history")}
          </BarButton>
          <BarButton name="rules" onClick={() => setShowRules(true)} title={t("bar.rules")}>
            {t("bar.rules")}
          </BarButton>
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

      <main className="game__main game__main--table">
        <TableView
          state={state}
          rollingIndices={net.rollingIndices}
          isRolling={net.isRolling}
          perspectiveId={net.youId}
          presence={net.presence}
        />

        {net.isSpectator ? (
          <div className="spectator-bar">{t("spectate.watching")}</div>
        ) : (
          <Controls
            state={state}
            legal={legal}
            isRolling={net.isRolling}
            canAct={canAct}
            onRoll={net.roll}
            onBank={net.bank}
          />
        )}
      </main>

      <Toast toast={net.toast} />

      {state.phase === "game-over" && (
        <GameOver
          state={state}
          youId={net.youId}
          summary={summary}
          unlocked={unlocked}
          // Only the host can restart; other seats see a note, spectators neither.
          onPlayAgain={!net.isSpectator && isHost ? net.rematch : undefined}
          waitingNote={!net.isSpectator && !isHost ? t("gameOver.waitingRematch") : undefined}
          onMenu={net.leave}
          menuLabel={t("common.leavePlain")}
        />
      )}

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
      {showHistory && (
        <TurnHistory
          state={state}
          youId={net.youId ?? undefined}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}
