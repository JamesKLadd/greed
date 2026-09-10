import { useState } from "react";
import { useGreed } from "../game/useGreed.js";
import type { MatchSetup } from "../game/setup.js";
import { loadProfile } from "../game/profile.js";
import { cosmeticVars } from "../game/cosmetics.js";
import { useGameChrome } from "../game/useGameChrome.js";
import { GameShell } from "./GameShell.js";
import { GameOver } from "../components/GameOver.js";
import { RulesModal } from "../components/RulesModal.js";
import { TurnHistory } from "../components/TurnHistory.js";
import { RollOffView } from "../components/RollOffView.js";
import { VolumeControls } from "../components/VolumeControls.js";
import { BarButton } from "../ui/index.js";
import { useT } from "../i18n/i18n.js";
import { useBetaActive } from "../beta/BetaContext.js";

interface GameScreenProps {
  setup: MatchSetup;
  onExit: () => void;
}

/** Offline play: local pass-and-play, or one human against bots. */
export function GameScreen({ setup, onExit }: GameScreenProps) {
  const ctl = useGreed(setup);
  const { state } = ctl;
  const t = useT();
  const betaActive = useBetaActive();

  const canAct = !state.players[state.turn.playerIndex].isBot;
  // Seat the human at the bottom of the table. Without this the bottom seat is
  // whoever the roll-off put first, so in a solo game "your" seat wanders — and
  // in the portrait layout the bottom seat is emphatically read as yours.
  // Pass-and-play (several humans) has no single viewer, so it keeps turn order,
  // and progression isn't recorded for it either.
  const humans = state.players.filter((p) => !p.isBot);
  const viewerId = humans.length === 1 ? humans[0].id : null;

  const [profile] = useState(loadProfile);
  const [cosmetics] = useState(() => cosmeticVars(profile));
  // Offline there's only one profile to read from, so only the local human's
  // avatar is an explicit pick; every bot's face comes from its name.
  const avatars = viewerId ? { [viewerId]: profile.avatar } : undefined;

  const chrome = useGameChrome({
    state,
    legal: ctl.legal,
    canAct,
    isRolling: ctl.isRolling,
    youId: viewerId,
    rollOffActive: ctl.rollOffActive,
    onRoll: ctl.roll,
    onBank: ctl.bank,
    onToggleDie: ctl.toggleDie,
  });

  return (
    <GameShell
      state={state}
      legal={ctl.legal}
      isRolling={ctl.isRolling}
      rollingIndices={ctl.rollingIndices}
      rollingDice={ctl.rollingDice}
      canAct={canAct}
      onRoll={ctl.roll}
      onBank={ctl.bank}
      onToggleDie={ctl.toggleDie}
      toast={ctl.toast}
      cosmetics={
        betaActive && profile.table === "classic"
          ? ({
              ...cosmetics,
              "--felt-1": "#10523f",
              "--felt-2": "#07352e",
              "--felt-edge": "#051d20",
            } as React.CSSProperties)
          : cosmetics
      }
      perspectiveId={viewerId}
      avatars={avatars}
      barLeft={
        <BarButton name="menu" onClick={onExit}>
          {t("bar.menu")}
        </BarButton>
      }
      barTitle={<h1 className="game__logo game__logo--decor">GREED</h1>}
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
          <BarButton name="restart" onClick={() => ctl.restart()} title={t("bar.restart")}>
            {t("bar.restart")}
          </BarButton>
        </>
      }
      overlays={
        <>
          {ctl.rollOffActive && <RollOffView entries={ctl.rollOff} onContinue={ctl.beginPlay} />}
          {state.phase === "game-over" && (
            <GameOver
              state={state}
              summary={chrome.summary}
              unlocked={chrome.unlocked}
              onPlayAgain={() => ctl.restart()}
              onMenu={onExit}
            />
          )}
          {chrome.showRules && <RulesModal onClose={() => chrome.setShowRules(false)} />}
          {chrome.showHistory && (
            <TurnHistory state={state} onClose={() => chrome.setShowHistory(false)} />
          )}
        </>
      }
    />
  );
}
