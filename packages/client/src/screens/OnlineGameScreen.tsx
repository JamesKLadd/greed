import { getLegalActions } from "@greed/core";
import type { OnlineController } from "../net/useOnlineGame.js";
import { GameShell } from "./GameShell.js";
import { GameOver } from "../components/GameOver.js";
import { RulesModal } from "../components/RulesModal.js";
import { TurnHistory } from "../components/TurnHistory.js";
import { EmoteBar } from "../components/EmoteBar.js";
import { VolumeControls } from "../components/VolumeControls.js";
import { useGameChrome } from "../game/useGameChrome.js";
import { diceVarsById } from "../game/cosmetics.js";
import { loadSettings } from "../game/settings.js";
import { BarButton } from "../ui/index.js";
import { useT } from "../i18n/i18n.js";

/** Online play: the server is authoritative and every seat is somebody else. */
export function OnlineGameScreen({ net }: { net: OnlineController }) {
  const t = useT();
  const state = net.game!;
  const current = state.players[state.turn.playerIndex];
  const canAct = current.id === net.youId && state.phase !== "game-over";
  const legal = getLegalActions(state);
  const isHost = net.lobby?.seats.find((s) => s.id === net.youId)?.isHost ?? false;
  // Online: the dice in the center belong to whoever's turn it is, so render the
  // CURRENT player's equipped skin (broadcast by the server) for every viewer.
  // Never a table theme — the felt stays shared/identical for everyone.
  const diceVars = diceVarsById(net.skins[current.id] ?? "ivory");

  const chrome = useGameChrome({
    state,
    legal,
    canAct,
    isRolling: net.isRolling,
    youId: net.youId,
    onRoll: net.roll,
    onBank: net.bank,
  });

  return (
    <GameShell
      state={state}
      legal={legal}
      isRolling={net.isRolling}
      rollingIndices={net.rollingIndices}
      rollingDice={net.rollingDice}
      canAct={canAct}
      onRoll={net.roll}
      onBank={net.bank}
      toast={net.toast}
      cosmetics={diceVars}
      perspectiveId={net.youId}
      presence={net.presence}
      emotes={net.emotes}
      avatars={net.avatars}
      turnTimer={net.turnTimer}
      spectating={net.isSpectator}
      barLeft={
        <BarButton name="menu" onClick={net.leave}>
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
            onClick={() => chrome.setShowHistory(true)}
            title={t("history.title")}
          >
            {t("bar.history")}
          </BarButton>
          <BarButton name="rules" onClick={() => chrome.setShowRules(true)} title={t("bar.rules")}>
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
              // Only the host can restart; other seats see a note, spectators neither.
              onPlayAgain={!net.isSpectator && isHost ? net.rematch : undefined}
              waitingNote={!net.isSpectator && !isHost ? t("gameOver.waitingRematch") : undefined}
              onMenu={net.leave}
              menuLabel={t("common.leavePlain")}
            />
          )}
          {chrome.showRules && <RulesModal onClose={() => chrome.setShowRules(false)} />}
          {chrome.showHistory && (
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
