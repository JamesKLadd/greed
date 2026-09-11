import { teamTotal } from "@greed/core";
import type { GameShellProps } from "../screens/GameShell.js";
import { TableScene, type ScenePlayer } from "./TableScene.js";
import { DiceTray } from "../components/DiceTray.js";
import { ActionBar } from "../components/ActionBar.js";
import { GuidanceLine } from "../components/GuidanceLine.js";
import { Placings } from "../components/Placings.js";
import { Toast } from "../components/Toast.js";
import { Modal } from "../ui/Modal.js";
import { GameMenuDrawer } from "./GameMenuDrawer.js";
import { GameCelebration } from "./Celebration.js";
import { useAppearance } from "./AppearanceContext.js";
import { DEFAULT_APPEARANCE, MASCOTS } from "./appearance.js";
import { Mascot } from "./Mascot.js";
import { loadSettings } from "../game/settings.js";
import { teamName } from "../game/teams.js";
import { useI18n, type MsgKey } from "../i18n/i18n.js";
import { ACHIEVEMENTS } from "../game/profile.js";

export type SceneOverlay = { kind: "menu" } | { kind: "player"; id: string } | null;
interface LocalTableGameProps extends GameShellProps {
  sceneOverlay: SceneOverlay;
  onSceneOverlay: (overlay: SceneOverlay) => void;
}

/** Local controller adapter only. Online keeps GameShell until Table E. */
export function LocalTableGame(props: LocalTableGameProps) {
  const { state, perspectiveId, isRolling, canAct, sceneOverlay, onSceneOverlay } = props;
  const { t, n } = useI18n();
  const { appearance } = useAppearance();
  const settings = loadSettings();
  const active = state.players[state.turn.playerIndex];
  const last = state.players[state.order[state.order.length - 1]];
  const players: ScenePlayer[] = state.players.map((p, i) => ({
    id: p.id,
    name: p.name,
    score: p.total,
    characterId: p.id === perspectiveId ? appearance.mascot : MASCOTS[i % MASCOTS.length],
    nameplate: p.id === perspectiveId ? appearance.nameplate : undefined,
  }));
  const selected =
    sceneOverlay?.kind === "player"
      ? state.players.find((p) => p.id === sceneOverlay.id)
      : undefined;
  const selectedLook =
    selected?.id === perspectiveId
      ? appearance
      : {
          ...DEFAULT_APPEARANCE,
          mascot: players.find((p) => p.id === selected?.id)?.characterId ?? "fox",
        };
  const selectedBadge = ACHIEVEMENTS.find((a) => a.id === selectedLook.badge);
  return (
    <div
      className="tp-screen scene-game"
      style={props.cosmetics}
      data-notices={Boolean(
        settings.showGuidance ||
        state.teams ||
        state.endgame.triggered ||
        state.phase === "sudden-death",
      )}
    >
      <header className="tp-header">
        {props.barLeft}
        <span className="tp-wordmark">GREED</span>
        <button
          className="tp-icon"
          type="button"
          aria-label={t("bar.menu")}
          aria-expanded={sceneOverlay?.kind === "menu"}
          onClick={() => onSceneOverlay({ kind: "menu" })}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </header>
      <TableScene
        players={players}
        order={state.order.map((i) => state.players[i].id)}
        perspectiveId={perspectiveId ?? undefined}
        viewerId={perspectiveId ?? undefined}
        activePlayerId={state.phase === "game-over" ? undefined : active.id}
        onPlayerDetails={(player) => onSceneOverlay({ kind: "player", id: player.id })}
      >
        <div className="scene-announcements">
          {state.endgame.triggered && state.phase === "playing" && (
            <div className="scene-final">
              {t("banner.finalRoundPre")}
              <strong>{last.name}</strong>
              {t("banner.finalRoundPost")}
            </div>
          )}
          {state.phase === "sudden-death" && (
            <div className="scene-final">{t("banner.suddenDeath")}</div>
          )}
          {state.teams && (
            <div className="scene-teams">
              {state.teams.map((_, i) => (
                <span key={i} data-team={i}>
                  {teamName(t, i)} <strong>{n(teamTotal(state, i))}</strong>
                </span>
              ))}
            </div>
          )}
          <GuidanceLine
            state={state}
            canAct={canAct}
            compact
            muted={
              !settings.showGuidance || state.endgame.triggered || state.phase === "sudden-death"
            }
          />
        </div>
        <div className="tp-dice scene-dice">
          <DiceTray
            turn={state.turn}
            rollingIndices={props.rollingIndices}
            rollingDice={props.rollingDice}
            isRolling={isRolling}
            dice3d={settings.dice3d}
            onToggle={(i) => {
              if (canAct) props.onToggleDie?.(i);
            }}
            disabled={!canAct}
          />
        </div>
        <div className="tp-turn-label" aria-live="polite">
          <span>
            {t("controls.whoseTurn", { name: active.name })}
            {active.isBot && !state.turn.outcome && !isRolling ? ` · ${t("table.thinking")}` : ""}
          </span>
          {settings.showTurnScore && (
            <span>
              {" "}
              · {t("beta.atStake")} {n(state.turn.turnScore)}
            </span>
          )}
        </div>
        <ActionBar
          state={state}
          legal={props.legal}
          isRolling={isRolling}
          canAct={canAct}
          onRoll={props.onRoll}
          onBank={props.onBank}
          variant="scene"
        />
        <div className="scene-result">
          <GameCelebration state={state} isRolling={isRolling} />
        </div>
      </TableScene>
      <div className="tp-empty" aria-hidden="true" />
      {sceneOverlay?.kind === "menu" && (
        <GameMenuDrawer title={t("bar.menu")} onClose={() => onSceneOverlay(null)}>
          <p className="scene-menu__goal">
            {t("common.goal")} · {n(state.config.goal)}
          </p>
          <div className="scene-menu__utilities">{props.barRight}</div>
          <Placings state={state} youId={perspectiveId} />
        </GameMenuDrawer>
      )}
      {selected && (
        <Modal title={selected.name} onClose={() => onSceneOverlay(null)}>
          <div className="scene-details">
            <Mascot look={selectedLook} />
            {selectedBadge && (
              <p>
                {selectedBadge.icon} {t(`ach.${selectedBadge.id}.title` as MsgKey)}
              </p>
            )}
            <strong>
              {n(selected.total)} {t("scene.points")}
            </strong>
            {selected.team != null && (
              <p>
                {teamName(t, selected.team)} · {n(teamTotal(state, selected.team))}
              </p>
            )}
            {selected.id === last.id && <p>🏁 {t("aria.playsLast")}</p>}
            {selected.isBot && <p>{t("scene.bot")}</p>}
            <button className="tp-close" onClick={() => onSceneOverlay(null)}>
              {t("common.close")}
            </button>
          </div>
        </Modal>
      )}
      <Toast toast={props.toast} />
      {props.overlays}
    </div>
  );
}
