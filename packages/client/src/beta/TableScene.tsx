import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { CharacterSprite } from "./characters/index.js";
import {
  sceneSeatOrder,
  tableSceneGeometry,
  type SceneCount,
  type SceneRect,
} from "./tableSceneGeometry.js";
import { TableSurface } from "./TableSurface.js";
import { useI18n } from "../i18n/i18n.js";

export interface ScenePlayer {
  id: string;
  name: string;
  characterId?: string;
  nameplate?: string;
  score: number;
}
interface Props {
  players: readonly ScenePlayer[];
  order: readonly string[];
  perspectiveId?: string;
  /** Omit for pass-and-play/spectators: camera anchor does not imply 'you'. */
  viewerId?: string;
  activePlayerId?: string;
  onPlayerDetails?: (player: ScenePlayer) => void;
  children?: ReactNode;
}
const placed = (r: SceneRect): CSSProperties => ({
  left: r.x,
  top: r.y,
  width: r.width,
  height: r.height,
  bottom: "auto",
  transform: "none",
  maxWidth: "none",
});

/** Presentation only: no game state, scoring, account writes or timers. */
export function TableScene({
  players,
  order,
  perspectiveId,
  viewerId,
  activePlayerId,
  onPlayerDetails,
  children,
}: Props) {
  const { t, n } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 390, height: 736 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const ids = sceneSeatOrder(order, perspectiveId);
  const geometry = tableSceneGeometry(ids.length as SceneCount, size.width, size.height);
  const byId = new Map(players.map((p) => [p.id, p]));
  const lastId = order[order.length - 1];
  return (
    <div
      ref={ref}
      className={`tp-scene tp-scene--${geometry.mode}`}
      aria-label={t("scene.table", { count: ids.length })}
      style={{ "--scene-die-edge": `${geometry.dieEdge}px` } as CSSProperties}
    >
      <div className="tp-room-light" aria-hidden="true" />
      <TableSurface />
      <div className="tp-felt-brand" aria-hidden="true">
        <span>◆</span> GREED <span>◆</span>
        <small>{t("scene.motto")}</small>
      </div>
      {ids.map((id, index) => {
        const player = byId.get(id);
        if (!player) return null;
        const seat = geometry.seats[index];
        const own = id === viewerId;
        const label = own ? t("scene.you") : player.name;
        const score = n(player.score);
        return (
          <div
            className={`tp-seat tp-seat--${seat.view === "back" ? "self" : seat.view === "front" ? "far" : "side"}`}
            key={id}
            data-player-id={id}
            data-slot={seat.slot}
            data-active={id === activePlayerId || undefined}
            data-nameplate={player.nameplate}
          >
            <button
              className="tp-character"
              type="button"
              style={placed(seat.character)}
              onClick={() => onPlayerDetails?.(player)}
              aria-label={t("scene.total", { name: player.name, points: score })}
            >
              <CharacterSprite
                characterId={player.characterId}
                view={seat.view}
                mirrored={seat.mirrored}
              />
            </button>
            <button
              className="tp-name"
              type="button"
              style={placed(seat.name)}
              onClick={() => onPlayerDetails?.(player)}
              aria-label={t("scene.details", { name: player.name })}
              title={player.name}
            >
              <span>{label}</span>
            </button>
            <div
              className="tp-score"
              style={placed(seat.score)}
              aria-label={t("scene.total", { name: player.name, points: score })}
            >
              <strong
                style={{
                  fontSize:
                    seat.view === "back"
                      ? Math.min(
                          geometry.mode === "short-wide" ? 20 : 26,
                          (seat.score.width / score.length) * 1.65,
                        )
                      : geometry.scoreFont,
                }}
              >
                {score}
              </strong>
              <span>{own ? t("scene.youPoints") : t("scene.points")}</span>
            </div>
            {id === lastId && (
              <span
                className={`tp-flag tp-flag--${seat.view}`}
                style={{ ...placed(seat.flag), transform: `rotate(${seat.flagAngle}deg)` }}
                role="img"
                aria-label={`${player.name} · ${t("aria.playsLast")}`}
                title={`${player.name} · ${t("aria.playsLast")}`}
              />
            )}
          </div>
        );
      })}
      {children}
    </div>
  );
}
