import type { GameState } from "@greed/core";
import type { Achievement, GameSummary } from "../game/profile.js";
import { useT } from "../i18n/i18n.js";
import type { MsgKey } from "../i18n/i18n.js";

interface GameOverProps {
  state: GameState;
  /** This game's personal summary (solo games only; null otherwise). */
  summary?: GameSummary | null;
  /** Achievements unlocked by this game. */
  unlocked?: Achievement[];
  onPlayAgain: () => void;
  onMenu: () => void;
}

export function GameOver({ state, summary, unlocked = [], onPlayAgain, onMenu }: GameOverProps) {
  const t = useT();
  const winner = state.players.find((p) => p.id === state.winnerId);
  const standings = [...state.players].sort((a, b) => b.total - a.total);
  const winnerName = winner?.name ?? "";

  return (
    <div className="overlay">
      <div className="overlay__card overlay__card--scroll">
        <div className="overlay__crown">{summary?.won ? "🏆" : "🏁"}</div>
        <h2 className="overlay__title">
          {summary
            ? summary.won
              ? t("gameOver.youWin")
              : t("gameOver.wins", { name: winnerName })
            : t("gameOver.winsExcl", { name: winnerName })}
        </h2>

        <ol className="standings">
          {standings.map((p) => (
            <li
              key={p.id}
              className={
                p.id === state.winnerId ? "standings__row standings__row--win" : "standings__row"
              }
            >
              <span>
                {p.name}
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
          <button className="btn btn--roll" onClick={onPlayAgain}>
            {t("gameOver.playAgain")}
          </button>
          <button className="btn" onClick={onMenu}>
            {t("gameOver.mainMenu")}
          </button>
        </div>
      </div>
    </div>
  );
}
