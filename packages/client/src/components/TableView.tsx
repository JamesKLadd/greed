import type { CSSProperties } from "react";
import type { GameState } from "@greed/core";
import { DiceTray } from "./DiceTray.js";
import { seatColor, initials } from "../game/theme.js";
import { useT } from "../i18n/i18n.js";

interface TableViewProps {
  state: GameState;
  rollingIndices: number[];
  isRolling: boolean;
  /** Player id to seat at the bottom-center (the local viewer). Defaults to seat 0. */
  perspectiveId?: string | null;
  /** Live connection status per player id (online only); omit for offline play. */
  presence?: Record<string, boolean>;
}

/**
 * The players seated around an oval felt table, with the dice in the middle.
 * Seats are positioned on an ellipse; the perspective player (if any) sits at
 * the bottom. Collapses to a stacked layout on narrow screens (see styles.css).
 */
export function TableView({
  state,
  rollingIndices,
  isRolling,
  perspectiveId,
  presence,
}: TableViewProps) {
  const showPresence = presence != null;
  const t = useT();
  const goal = state.config.goal;
  const n = state.players.length;
  const leadTotal = Math.max(...state.players.map((p) => p.total));
  const currentIndex = state.turn.playerIndex;
  const current = state.players[currentIndex];

  // Seats follow the turn order (going clockwise), not the player-list order.
  // state.order lists player-list indices in the sequence players take turns.
  const turnPosOf = (playerIndex: number) => state.order.indexOf(playerIndex);
  const found = state.players.findIndex((p) => p.id === perspectiveId);
  // Bottom seat: the local viewer if we have one, otherwise whoever acts first.
  const bottomListIndex = found >= 0 ? found : state.order[0];
  const bottomTurnPos = turnPosOf(bottomListIndex);

  const whose =
    state.phase === "game-over"
      ? t("controls.gameOver")
      : current.id === perspectiveId
        ? t("controls.yourTurn")
        : t("controls.whoseTurn", { name: current.name });

  return (
    <div className="table-stage">
      <div className="felt">
        <div className="felt__seats">
          {state.players.map((p, i) => {
            // rel = 0 is the bottom seat; each later turn sits one step clockwise
            // (i.e. to the left of the one before it) around the oval.
            const rel = (turnPosOf(i) - bottomTurnPos + n) % n;
            const angle = Math.PI / 2 + (rel / n) * Math.PI * 2;
            const x = 50 + 45 * Math.cos(angle);
            const y = 50 + 43 * Math.sin(angle);

            const isCurrent = i === currentIndex && state.phase !== "game-over";
            const isWinner = state.phase === "game-over" && state.winnerId === p.id;
            const isLeader = p.total === leadTotal && p.total > 0;
            const pct = Math.min(100, (p.total / goal) * 100);
            const turnScore = isCurrent ? state.turn.turnScore : 0;
            const isYou = p.id === perspectiveId;
            const color = seatColor(i);
            const online = showPresence ? presence[p.id] !== false : true;
            const offline = showPresence && !p.isBot && !online;
            // "Thinking" = the server is playing this seat (a bot, or a dropped human).
            const thinking = isCurrent && !state.turn.outcome && (p.isBot || offline);

            const style = {
              "--x": `${x}%`,
              "--y": `${y}%`,
              "--seat": color,
            } as CSSProperties;

            return (
              <div
                key={p.id}
                className={[
                  "pseat",
                  isCurrent ? "pseat--current" : "",
                  isWinner ? "pseat--winner" : "",
                  p.isBot ? "pseat--bot" : "",
                  isYou ? "pseat--you" : "",
                  offline ? "pseat--offline" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={style}
              >
                <div className="pseat__head">
                  <span className="pseat__avatar" aria-hidden="true">
                    {initials(p.name)}
                    {showPresence && (
                      <span className={`pseat__conn${online ? " pseat__conn--on" : ""}`} />
                    )}
                  </span>
                  <span className="pseat__name">
                    {isLeader && (
                      <span className="pseat__crown" aria-label="leader">
                        👑
                      </span>
                    )}
                    {p.name}
                    {isYou && <span className="pseat__you"> {t("common.youParen")}</span>}
                  </span>
                </div>
                {(thinking || offline) && (
                  <div className="pseat__status">
                    {offline ? t("table.offline") : t("table.thinking")}
                  </div>
                )}
                <div className="pseat__meta">
                  <span className="pseat__total">
                    {p.total}
                    {turnScore > 0 && <span className="pseat__turn"> +{turnScore}</span>}
                  </span>
                  {p.isBot && (
                    <span className="pseat__badges">
                      <span className="pseat__tag">{t(`diff.${p.botDifficulty ?? "easy"}`)}</span>
                      {p.botPersonality === "reckless" && (
                        <span className="pseat__pers" title={t("pers.reckless")}>
                          🔥
                        </span>
                      )}
                      {p.botPersonality === "cautious" && (
                        <span className="pseat__pers" title={t("pers.cautious")}>
                          🛡️
                        </span>
                      )}
                    </span>
                  )}
                </div>
                <div className="pseat__bar">
                  <div className="pseat__fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="felt__center">
          <div className={`felt__whose${current.isBot ? " felt__whose--bot" : ""}`}>
            <span className="table__dot" />
            {whose}
          </div>
          <DiceTray turn={state.turn} rollingIndices={rollingIndices} isRolling={isRolling} />
        </div>
      </div>
    </div>
  );
}
