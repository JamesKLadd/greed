import { useBetaActive } from "../beta/BetaContext.js";
import { useAppearance } from "../beta/AppearanceContext.js";
import { appearanceVars } from "../beta/appearance.js";
import { useEffect, useMemo, useState } from "react";
import { getLegalActions } from "@greed/core";
import type { OnlineController } from "../net/useOnlineGame.js";
import { GameShell } from "./GameShell.js";
import { GameOver } from "../components/GameOver.js";
import { RulesModal } from "../components/RulesModal.js";
import { TurnHistory } from "../components/TurnHistory.js";
import { EmoteBar } from "../components/EmoteBar.js";
import { VolumeControls } from "../components/VolumeControls.js";
import { useGameChrome } from "../game/useGameChrome.js";
import { diceVarsById, tableVars } from "../game/cosmetics.js";
import { loadProfile } from "../game/profile.js";
import { loadSettings } from "../game/settings.js";
import { BarButton } from "../ui/index.js";
import { useT } from "../i18n/i18n.js";
import { LocalTableGame, type SceneOverlay } from "../beta/LocalTableGame.js";
import { canActOnline, onlineAppearance } from "../beta/onlineScene.js";

/** Online play: the server is authoritative and every seat is somebody else. */
export function OnlineGameScreen({
  net,
  recordResults = true,
}: {
  net: OnlineController;
  recordResults?: boolean;
}) {
  const t = useT();
  const beta = useBetaActive();
  const { appearance } = useAppearance();
  const [sceneOverlay, setSceneOverlay] = useState<SceneOverlay>(null);
  const sceneActive =
    beta && !(import.meta.env.DEV && new URLSearchParams(window.location.search).has("old-table"));
  const state = net.game!;
  const current = state.players[state.turn.playerIndex];
  const canAct = canActOnline(state, net.youId, net.isSpectator, net.reconnecting);
  const legal = getLegalActions(state);
  const isHost = net.lobby?.seats.find((s) => s.id === net.youId)?.isHost ?? false;
  const votes = net.rematchState?.votes.length ?? 0;
  const needed = net.rematchState?.needed ?? 0;
  const votedRematch = net.youId != null && (net.rematchState?.votes.includes(net.youId) ?? false);
  // Online, the two halves of a cosmetic answer different questions. The dice in
  // the centre belong to whoever is throwing them, so every viewer renders the
  // CURRENT player's equipped skin (broadcast by the server). The mat is the
  // viewer's own and holds still for the whole game — it is never broadcast, so
  // nobody else's screen changes with it.
  const [myTable] = useState(() => tableVars(loadProfile()));
  const diceVars = diceVarsById(net.skins[current.id] ?? "ivory");
  const classicCosmetics = useMemo(() => ({ ...myTable, ...diceVars }), [myTable, diceVars]);
  const cosmetics = beta
    ? appearanceVars(onlineAppearance(appearance, current.id, net.skins, net.betaLooks))
    : classicCosmetics;

  const chrome = useGameChrome({
    state,
    legal,
    canAct,
    isRolling: net.isRolling,
    youId: recordResults && !net.isSpectator ? net.youId : null,
    blockingOverlayActive: sceneActive && sceneOverlay !== null,
    onRoll: net.roll,
    onBank: net.bank,
    onToggleDie: net.toggleDie,
  });
  const mandatoryOverlayActive = state.phase === "game-over";
  const externalOverlayActive = mandatoryOverlayActive || chrome.showRules || chrome.showHistory;
  const { setShowRules, setShowHistory } = chrome;
  useEffect(() => {
    if (externalOverlayActive) setSceneOverlay(null);
  }, [externalOverlayActive]);
  useEffect(() => {
    if (mandatoryOverlayActive) {
      setShowRules(false);
      setShowHistory(false);
    }
  }, [mandatoryOverlayActive, setShowRules, setShowHistory]);
  const Shell = sceneActive ? LocalTableGame : GameShell;

  return (
    <Shell
      sceneOverlay={externalOverlayActive ? null : sceneOverlay}
      onSceneOverlay={setSceneOverlay}
      online
      roomCode={net.code}
      presentationEpoch={net.presentationEpoch}
      state={state}
      legal={legal}
      isRolling={net.isRolling}
      rollingIndices={net.rollingIndices}
      rollingDice={net.rollingDice}
      canAct={canAct}
      onRoll={net.roll}
      onBank={net.bank}
      onToggleDie={net.toggleDie}
      toast={net.toast}
      cosmetics={cosmetics}
      perspectiveId={net.youId}
      presence={net.presence}
      emotes={net.emotes}
      avatars={net.avatars}
      betaLooks={net.betaLooks}
      turnTimer={net.turnTimer}
      spectating={net.isSpectator}
      // The board keeps showing the last position it had while the connection
      // is being re-made, and a frozen board with no explanation is exactly what
      // this is here to prevent. The scene already owns its notice live region;
      // only Classic needs the banner itself to announce the change.
      notice={
        net.reconnecting ? (
          <div
            className="banner banner--sd"
            role={sceneActive ? undefined : "status"}
            aria-live={sceneActive ? undefined : "polite"}
          >
            {t("net.reconnecting")}
          </div>
        ) : null
      }
      barLeft={
        <BarButton
          name="menu"
          onClick={net.leave}
          className={sceneActive ? "scene-back" : undefined}
          aria-label={sceneActive ? t("bar.leave") : undefined}
        >
          {t("bar.leave")}
        </BarButton>
      }
      barTitle={
        <h1 className="game__logo">
          {loadSettings().hideRoomCode ? "GREED" : `GREED · ${net.code}`}
        </h1>
      }
      barRight={
        <>
          <VolumeControls />
          <BarButton
            name="history"
            onClick={() => {
              setSceneOverlay(null);
              chrome.setShowHistory(true);
            }}
            title={t("history.title")}
          >
            {t("bar.history")}
          </BarButton>
          <BarButton
            name="rules"
            onClick={() => {
              setSceneOverlay(null);
              chrome.setShowRules(true);
            }}
            title={t("bar.rules")}
          >
            {t("bar.rules")}
          </BarButton>
        </>
      }
      floating={!net.isSpectator && <EmoteBar onSend={net.sendEmote} />}
      overlays={
        <>
          {state.phase === "game-over" && (
            <GameOver
              state={state}
              youId={net.youId}
              summary={chrome.summary}
              unlocked={chrome.unlocked}
              // Running it back is a vote now, open to every seat — the table
              // restarts in place as soon as everyone still here has said yes.
              onPlayAgain={net.isSpectator ? undefined : net.rematch}
              playAgainLabel={
                votedRematch
                  ? t("gameOver.rematchWaiting", { have: votes, need: needed })
                  : t("gameOver.rematch")
              }
              playAgainActive={votedRematch}
              // The host keeps a way back to the lobby to change goal or sides.
              onSecondary={!net.isSpectator && isHost ? net.toLobby : undefined}
              secondaryLabel={t("gameOver.backToLobby")}
              onMenu={net.leave}
              menuLabel={t("common.leavePlain")}
            />
          )}
          {!mandatoryOverlayActive && chrome.showRules && (
            <RulesModal onClose={() => chrome.setShowRules(false)} />
          )}
          {!mandatoryOverlayActive && chrome.showHistory && (
            <TurnHistory
              state={state}
              youId={net.youId ?? undefined}
              onClose={() => chrome.setShowHistory(false)}
            />
          )}
        </>
      }
    />
  );
}
