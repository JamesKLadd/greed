import { useEffect, useRef, useState } from "react";
import { getLegalActions } from "@greed/core";
import type { OnlineController } from "../net/useOnlineGame.js";
import { TableView } from "../components/TableView.js";
import { Controls } from "../components/Controls.js";
import { Toast } from "../components/Toast.js";
import { RulesModal } from "../components/RulesModal.js";
import { TurnHistory } from "../components/TurnHistory.js";
import { MuteButton } from "../components/MuteButton.js";
import { useGameSounds } from "../game/useGameSounds.js";
import { useKeyboardShortcuts } from "../game/useKeyboardShortcuts.js";
import { recordGame, summarize, type Achievement, type GameSummary } from "../game/profile.js";
import { diceVarsById } from "../game/cosmetics.js";
import { VolumeControls } from "../components/VolumeControls.js";
import { syncSteamAchievements } from "../game/steam.js";
import { useT } from "../i18n/i18n.js";
import type { MsgKey } from "../i18n/i18n.js";

export function OnlineGameScreen({ net }: { net: OnlineController }) {
  const t = useT();
  const state = net.game!;
  const [showRules, setShowRules] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [summary, setSummary] = useState<GameSummary | null>(null);
  const [unlocked, setUnlocked] = useState<Achievement[]>([]);
  const recordedRef = useRef(false);

  useGameSounds(state);

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
  }, [state.phase, state, net.youId]);

  const current = state.players[state.turn.playerIndex];
  const lastPlayer = state.players[state.order[state.order.length - 1]];
  const canAct = current.id === net.youId && state.phase !== "game-over";
  const legal = getLegalActions(state);
  const isHost = net.lobby?.seats.find((s) => s.id === net.youId)?.isHost ?? false;
  const winner = state.players.find((p) => p.id === state.winnerId);
  const youWon = state.winnerId === net.youId;
  const standings = [...state.players].sort((a, b) => b.total - a.total);
  // Online: the dice in the center belong to whoever's turn it is, so render the
  // CURRENT player's equipped skin (broadcast by the server) for every viewer.
  // Never a table theme — the felt stays shared/identical for everyone.
  const diceVars = diceVarsById(net.skins[current.id] ?? "ivory");

  useKeyboardShortcuts({
    enabled: !showRules && !showHistory && state.phase !== "game-over",
    canRoll: canAct && legal.canRoll,
    canBank: canAct && legal.canBank,
    onRoll: net.roll,
    onBank: net.bank,
    onToggleHistory: () => setShowHistory((h) => !h),
  });

  return (
    <div className="game" style={diceVars}>
      <header className="game__bar">
        <button className="btn btn--ghost" onClick={net.leave}>
          {t("bar.leave")}
        </button>
        <h1 className="game__logo">GREED · {net.code}</h1>
        <div className="game__bar-right">
          <MuteButton />
          <VolumeControls />
          <button
            className="btn btn--ghost"
            onClick={() => setShowHistory(true)}
            title={t("history.title")}
          >
            {t("bar.history")}
          </button>
          <button className="btn btn--ghost" onClick={() => setShowRules(true)}>
            {t("bar.rules")}
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
        <div className="overlay">
          <div className="overlay__card overlay__card--scroll">
            <div className="overlay__crown">{youWon ? "🏆" : "🏁"}</div>
            <h2 className="overlay__title">
              {youWon ? t("gameOver.youWin") : t("gameOver.wins", { name: winner?.name ?? "" })}
            </h2>
            <ol className="standings">
              {standings.map((p) => (
                <li
                  key={p.id}
                  className={
                    p.id === state.winnerId
                      ? "standings__row standings__row--win"
                      : "standings__row"
                  }
                >
                  <span>
                    {p.name}
                    {p.id === net.youId ? ` ${t("common.youParen")}` : ""}
                    {p.isBot ? ` (${t(`diff.${p.botDifficulty ?? "easy"}`)})` : ""}
                  </span>
                  <span>{p.total}</span>
                </li>
              ))}
            </ol>

            {summary && (
              <div className="summary">
                <div className="summary__stat">
                  <span className="summary__label">{t("gameOver.bestTurn")}</span>
                  <span className="summary__value">{summary.bestTurn}</span>
                </div>
                <div className="summary__stat">
                  <span className="summary__label">{t("gameOver.hotDice")}</span>
                  <span className="summary__value">{summary.hotDice}</span>
                </div>
                <div className="summary__stat">
                  <span className="summary__label">{t("gameOver.busts")}</span>
                  <span className="summary__value">{summary.busts}</span>
                </div>
              </div>
            )}

            {unlocked.length > 0 && (
              <div className="unlocks">
                <div className="unlocks__head">
                  {unlocked.length > 1 ? t("gameOver.unlockedMany") : t("gameOver.unlockedOne")}
                </div>
                {unlocked.map((a) => (
                  <div key={a.id} className="unlocks__row">
                    <span className="unlocks__icon">{a.icon}</span>
                    <span>
                      <strong>{t(`ach.${a.id}.title` as MsgKey)}</strong> —{" "}
                      {t(`ach.${a.id}.desc` as MsgKey)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="overlay__actions">
              {!net.isSpectator &&
                (isHost ? (
                  <button className="btn btn--roll" onClick={net.rematch}>
                    {t("gameOver.playAgain")}
                  </button>
                ) : (
                  <span className="overlay__note">{t("gameOver.waitingRematch")}</span>
                ))}
              <button className="btn" onClick={net.leave}>
                {t("common.leavePlain")}
              </button>
            </div>
          </div>
        </div>
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
