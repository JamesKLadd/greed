import type { GameState } from "@greed/core";
import { buildHistory, type TurnRecord } from "../game/history.js";
import { Die } from "./Die.js";
import { useT } from "../i18n/i18n.js";
import type { MsgKey } from "../i18n/i18n.js";

interface TurnHistoryProps {
  state: GameState;
  /** Highlight this player's turns (the local seat), if known. */
  youId?: string;
  onClose: () => void;
}

const MARKER_KEY: Record<NonNullable<TurnRecord["marker"]>, MsgKey> = {
  endgame: "history.marker.endgame",
  "auto-win": "history.marker.autoWin",
  "sudden-death": "history.marker.suddenDeath",
  "game-over": "history.marker.gameOver",
};

export function TurnHistory({ state, youId, onClose }: TurnHistoryProps) {
  const t = useT();
  const records = buildHistory(state);
  const rows = [...records].reverse(); // newest first

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="overlay__card overlay__card--wide overlay__card--scroll"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="overlay__title">{t("history.title")}</h2>

        {rows.length === 0 ? (
          <p className="history__empty">{t("history.empty")}</p>
        ) : (
          <ol className="history">
            {rows.map((r) => (
              <li
                key={r.index}
                className={
                  "history__turn" + (youId && r.playerId === youId ? " history__turn--you" : "")
                }
              >
                <div className="history__head">
                  <span className="history__num">#{r.index}</span>
                  <span className="history__name">{r.playerName}</span>
                  <span className={`history__outcome history__outcome--${r.outcome}`}>
                    {r.outcome === "banked"
                      ? t("history.banked", { points: r.gained })
                      : r.outcome === "busted"
                        ? r.lost > 0
                          ? t("history.busted", { points: r.lost })
                          : t("history.bustedPlain")
                        : t("history.rolling")}
                  </span>
                  {r.outcome === "banked" && r.total !== null && (
                    <span className="history__total">= {r.total}</span>
                  )}
                </div>

                <div className="history__rolls">
                  {r.rolls.map((roll, i) => (
                    <span key={i} className="history__roll">
                      <span className="history__dice">
                        {roll.dice.map((d, j) => (
                          <Die key={j} value={d} size={18} />
                        ))}
                      </span>
                      <span
                        className={
                          "history__pts" + (roll.points === 0 ? " history__pts--zero" : "")
                        }
                      >
                        {roll.points === 0 ? t("history.bust") : `+${roll.points}`}
                        {roll.hot ? " 🔥" : ""}
                      </span>
                    </span>
                  ))}
                </div>

                {r.marker && <div className="history__marker">{t(MARKER_KEY[r.marker])}</div>}
              </li>
            ))}
          </ol>
        )}

        <div className="overlay__actions">
          <button className="btn btn--roll" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
