import { useEffect, useState } from "react";
import { isLastHeldDie, teamTotal, scoreFor } from "@greed/core";
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
import { TurnRing } from "../components/TurnRing.js";
import { onlineScenePlayers } from "./onlineScene.js";
import { OnlineSeatStatus } from "./OnlineSeatStatus.js";
import { emoteGlyph } from "../components/EmoteBar.js";
import { useTableFeedback } from "./tableFeedback.js";
import { pointsAtRisk } from "../game/turnPresentation.js";
import { GoalProgress, goalProgress } from "../components/GoalProgress.js";

export type SceneOverlay = { kind: "menu" } | { kind: "player"; id: string } | null;
interface LocalTableGameProps extends GameShellProps {
  sceneOverlay: SceneOverlay;
  onSceneOverlay: (overlay: SceneOverlay) => void;
  /** Online identity comes from the server; local play uses the device's look. */
  online?: boolean;
  roomCode?: string | null;
}

/** Shared match scene. Controllers retain authority, action guards and overlay ownership. */
export function LocalTableGame(props: LocalTableGameProps) {
  const { state, perspectiveId, isRolling, canAct, sceneOverlay, onSceneOverlay } = props;
  const { t, n } = useI18n();
  const { appearance } = useAppearance();
  const settings = loadSettings();
  const [heldNotice, setHeldNotice] = useState(false);
  useEffect(() => setHeldNotice(false), [state, isRolling, canAct]);
  const suspended = Boolean(props.online && props.notice);
  const feedback = useTableFeedback(state, suspended, props.presentationEpoch);
  const active = state.players[state.turn.playerIndex];
  const last = state.players[state.order[state.order.length - 1]];
  const onlinePlayers = props.online
    ? onlineScenePlayers(state, props.avatars, props.betaLooks, props.presence)
    : null;
  const players: ScenePlayer[] =
    onlinePlayers?.map((player) => ({
      ...player,
      status: <OnlineSeatStatus connected={player.connected} emote={props.emotes?.[player.id]} />,
    })) ??
    state.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      score: p.total,
      characterId: p.id === perspectiveId ? appearance.mascot : MASCOTS[i % MASCOTS.length],
      nameplate: p.id === perspectiveId ? appearance.nameplate : undefined,
      team: p.team,
    }));
  const selected =
    sceneOverlay?.kind === "player"
      ? state.players.find((p) => p.id === sceneOverlay.id)
      : undefined;
  const selectedLook =
    onlinePlayers?.find((p) => p.id === selected?.id)?.look ??
    (selected?.id === perspectiveId
      ? appearance
      : {
          ...DEFAULT_APPEARANCE,
          mascot: players.find((p) => p.id === selected?.id)?.characterId ?? "fox",
        });
  const selectedBadge = ACHIEVEMENTS.find((a) => a.id === selectedLook.badge);
  const activeOffline = props.online && !active.isBot && props.presence?.[active.id] === false;
  const atRisk = pointsAtRisk(state);
  const selectedProgress = selected
    ? goalProgress(scoreFor(state, state.players.indexOf(selected)), state.config.goal)
    : null;
  return (
    <div
      className={`tp-screen scene-game${props.online ? " scene-game--online" : ""}`}
      style={props.cosmetics}
      data-seasonal-table={props.seasonalDefaultTable ? "default" : undefined}
      data-notices={Boolean(
        heldNotice ||
        settings.showGuidance ||
        state.teams ||
        state.endgame.triggered ||
        state.phase === "sudden-death",
      )}
    >
      <header className="tp-header">
        {props.barLeft}
        <span className="tp-wordmark">
          GREED
          <span className="scene-goal">{t("goal.target", { goal: n(state.config.goal) })}</span>
        </span>
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
      {props.notice && (
        <div className="scene-connection" role="status">
          {props.notice}
        </div>
      )}
      <TableScene
        players={players}
        order={state.order.map((i) => state.players[i].id)}
        perspectiveId={props.spectating ? undefined : (perspectiveId ?? undefined)}
        viewerId={props.spectating ? undefined : (perspectiveId ?? undefined)}
        activePlayerId={state.phase === "game-over" ? undefined : active.id}
        finalRound={state.endgame.triggered}
        goal={state.teams ? undefined : state.config.goal}
        {...feedback}
        onPlayerDetails={(player) => onSceneOverlay({ kind: "player", id: player.id })}
      >
        <div className="scene-announcements">
          {state.endgame.triggered && state.phase === "playing" && (
            <div className="scene-final">
              <span className="scene-final__short" aria-hidden="true">
                {t("scene.finalRound")}
              </span>
              <span className="scene-final__full">
                {t("banner.finalRoundPre")}
                <strong>{last.name}</strong>
                {t("banner.finalRoundPost")}
              </span>
            </div>
          )}
          {state.phase === "sudden-death" && (
            <div className="scene-final">{t("banner.suddenDeath")}</div>
          )}
          {state.teams && (
            <div className="scene-teams">
              {state.teams.map((_, i) => (
                <div key={i} data-team={i} className="scene-team-score">
                  <span>
                    <span className="scene-team-marker" aria-hidden="true">
                      {i + 1}
                    </span>
                    {teamName(t, i)} <strong>{n(teamTotal(state, i))}</strong>
                  </span>
                  <GoalProgress
                    score={teamTotal(state, i)}
                    goal={state.config.goal}
                    name={teamName(t, i)}
                  />
                </div>
              ))}
            </div>
          )}
          <GuidanceLine
            state={state}
            canAct={canAct}
            compact
            muted={
              heldNotice ||
              !settings.showGuidance ||
              state.endgame.triggered ||
              state.phase === "sudden-death"
            }
          />
          {heldNotice && (
            <p className="guide" role="status">
              {t("dice.keepOneHeld")}
            </p>
          )}
        </div>
        <div className="tp-dice scene-dice">
          <DiceTray
            turn={state.turn}
            rollingIndices={props.rollingIndices}
            rollingDice={props.rollingDice}
            isRolling={isRolling}
            dice3d={settings.dice3d}
            onToggle={(i) => {
              if (!canAct || isRolling || props.inputBlocked) return;
              if (isLastHeldDie(state.turn, i)) {
                setHeldNotice(true);
                return;
              }
              setHeldNotice(false);
              props.onToggleDie?.(i);
            }}
            disabled={!canAct || props.inputBlocked}
          />
        </div>
        <div
          className="tp-turn-label"
          data-clock={Boolean(props.online && state.phase !== "game-over" && props.turnTimer)}
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="scene-turn__player">
            {t("controls.whoseTurn", { name: active.name })}
            {activeOffline
              ? ` · ${t("table.offline")}`
              : active.isBot && !state.turn.outcome && !isRolling
                ? ` · ${t("table.thinking")}`
                : ""}
          </span>
          {settings.showTurnScore && (
            <span className="scene-turn__stake" data-resolved={Boolean(state.turn.outcome)}>
              {t("run.atRisk")} <b>{n(atRisk)}</b>
            </span>
          )}
          {props.online && state.phase !== "game-over" && props.turnTimer && (
            <span className="scene-turn-clock" role="img" aria-label={t("lobby.turnClock")}>
              <TurnRing timer={props.turnTimer} />
            </span>
          )}
        </div>
        {props.spectating ? (
          <div className="scene-watching" role="status">
            {t("spectate.watching")}
          </div>
        ) : (
          <ActionBar
            state={state}
            legal={props.legal}
            isRolling={isRolling}
            canAct={canAct && !props.inputBlocked}
            onRoll={props.onRoll}
            onBank={props.onBank}
            variant="scene"
          />
        )}
        <div className="scene-result">
          <GameCelebration
            key={props.presentationEpoch}
            state={state}
            isRolling={isRolling}
            variant="scene"
            suspended={suspended}
          />
        </div>
      </TableScene>
      <div className="tp-empty" aria-hidden="true" />
      {sceneOverlay?.kind === "menu" && (
        <GameMenuDrawer title={t("bar.menu")} onClose={() => onSceneOverlay(null)}>
          <p className="scene-menu__goal">
            {t("common.goal")} · {n(state.config.goal)}
          </p>
          {props.online && props.roomCode && !settings.hideRoomCode && (
            <p className="scene-menu__room">
              {t("lobby.roomCode")} <strong>{props.roomCode}</strong>
            </p>
          )}
          <div className="scene-menu__utilities">{props.barRight}</div>
          {props.floating && <div className="scene-menu__reactions">{props.floating}</div>}
          <Placings state={state} youId={perspectiveId} />
        </GameMenuDrawer>
      )}
      {selected && (
        <Modal
          className="scene-player-modal"
          scroll
          title={selected.name}
          onClose={() => onSceneOverlay(null)}
        >
          <div className="scene-details">
            <Mascot look={selectedLook} />
            {selectedBadge && (
              <p>
                {selectedBadge.icon} {t(`ach.${selectedBadge.id}.title` as MsgKey)}
              </p>
            )}
            <p className="scene-details__label">{t("run.bankedTotal")}</p>
            <strong className="scene-details__score">
              {n(selected.total)} {t("scene.points")}
            </strong>
            {selected.id === active.id && state.phase !== "game-over" && (
              <p className="scene-details__turn">{t("scene.currentTurn")}</p>
            )}
            {selected.team != null && (
              <p>
                {t("scene.teamBadge", { n: selected.team + 1 })} · {teamName(t, selected.team)} ·{" "}
                {n(teamTotal(state, selected.team))}
              </p>
            )}
            <p className="scene-details__goal">
              {selectedProgress && selectedProgress.remaining > 0
                ? t(
                    selected.team != null && state.teams ? "goal.teamRemaining" : "goal.remaining",
                    { points: n(selectedProgress.remaining) },
                  )
                : t("goal.reached")}
            </p>
            {selected.id === last.id && <p>🏁 {t("scene.finalSeatDetail")}</p>}
            {selected.isBot && <p>{t("scene.bot")}</p>}
            {props.online && !selected.isBot && props.presence?.[selected.id] === false && (
              <p>{t("table.offline")}</p>
            )}
            {props.emotes?.[selected.id] && <p>{emoteGlyph(props.emotes[selected.id].emote)}</p>}
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
