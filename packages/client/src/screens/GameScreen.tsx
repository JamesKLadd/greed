import { useEffect, useState } from "react";
import { useGreed } from "../game/useGreed.js";
import { useSeasonalGame } from "../game/useSeasonalGame.js";
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
import { useAppearance } from "../beta/AppearanceContext.js";
import { appearanceVars } from "../beta/appearance.js";
import { LocalTableGame, type SceneOverlay } from "../beta/LocalTableGame.js";

interface GameScreenProps {
  setup: MatchSetup;
  onExit: () => void;
  /** Development match fixtures must not write earned progression. */
  recordResults?: boolean;
}

/** Offline play: local pass-and-play, or one human against bots. */
export function GameScreen({ setup, onExit, recordResults = true }: GameScreenProps) {
  const ctl = useGreed(setup);
  useSeasonalGame(ctl.rollOff);
  const { state } = ctl;
  const t = useT();
  const betaActive = useBetaActive();
  const { appearance } = useAppearance();
  const [sceneOverlay, setSceneOverlay] = useState<SceneOverlay>(null);
  // Development rollback for comparing the previous beta table with Table C.
  const sceneActive =
    betaActive &&
    !(import.meta.env.DEV && new URLSearchParams(window.location.search).has("old-table"));

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
    youId: recordResults ? viewerId : null,
    playedHere: recordResults && humans.length > 0,
    throwsFor: ctl.throwsFor,
    rollOffActive: ctl.rollOffActive,
    blockingOverlayActive: sceneActive && sceneOverlay !== null,
    onRoll: ctl.roll,
    onBank: ctl.bank,
    onToggleDie: ctl.toggleDie,
  });

  const mandatoryOverlayActive = ctl.rollOffActive || state.phase === "game-over";
  const { setShowRules, setShowHistory } = chrome;
  const externalOverlayActive = mandatoryOverlayActive || chrome.showRules || chrome.showHistory;
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
      cosmetics={betaActive ? { ...cosmetics, ...appearanceVars(appearance) } : cosmetics}
      seasonalDefaultTable={betaActive ? appearance.table === "club" : profile.table === "classic"}
      perspectiveId={viewerId}
      avatars={avatars}
      barLeft={
        <BarButton
          name="menu"
          onClick={onExit}
          className={sceneActive ? "scene-back" : undefined}
          aria-label={sceneActive ? t("scene.back") : undefined}
        >
          {t("bar.menu")}
        </BarButton>
      }
      barTitle={<h1 className="game__logo game__logo--decor">GREED</h1>}
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
          <BarButton
            name="restart"
            onClick={() => {
              setSceneOverlay(null);
              ctl.restart();
            }}
            title={t("bar.restart")}
          >
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
              youId={viewerId}
              summary={chrome.summary}
              unlocked={chrome.unlocked}
              onPlayAgain={() => ctl.restart()}
              onMenu={onExit}
            />
          )}
          {!mandatoryOverlayActive && chrome.showRules && (
            <RulesModal onClose={() => chrome.setShowRules(false)} />
          )}
          {!mandatoryOverlayActive && chrome.showHistory && (
            <TurnHistory state={state} onClose={() => chrome.setShowHistory(false)} />
          )}
        </>
      }
    />
  );
}
