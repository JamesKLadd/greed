import type { ReactNode } from "react";
import type { GameState } from "@greed/core";
import type { Achievement, GameSummary } from "../game/profile.js";
import { Button, Modal } from "../ui/index.js";
import { useT } from "../i18n/i18n.js";
import type { MsgKey } from "../i18n/i18n.js";

/**
 * End-of-game results: standings, this game's personal summary, and any
 * achievements it unlocked.
 *
 * Serves both the local and online game screens. The online screen used to
 * carry its own copy of this markup, which had already drifted (it annotated
 * your own row and swapped the action buttons for a host-gated rematch); those
 * differences are now props.
 *
 * Deliberately not dismissible — no `onClose` — so a stray click or Escape can't
 * dismiss a terminal state and leave the player staring at a dead board.
 */

interface GameOverProps {
  state: GameState;
  /** The local player, when known (online). Marks your row and decides the win. */
  youId?: string | null;
  /** This game's personal summary (recorded games only; null otherwise). */
  summary?: GameSummary | null;
  /** Achievements unlocked by this game. */
  unlocked?: Achievement[];
  /** Omit to hide the play-again action (spectators, non-host online seats). */
  onPlayAgain?: () => void;
  playAgainLabel?: string;
  /** Shown in place of the play-again action (e.g. "waiting for the host"). */
  waitingNote?: ReactNode;
  onMenu: () => void;
  menuLabel?: string;
}

export function GameOver({
  state,
  youId,
  summary,
  unlocked = [],
  onPlayAgain,
  playAgainLabel,
  waitingNote,
  onMenu,
  menuLabel,
}: GameOverProps) {
  const t = useT();
  const winner = state.players.find((p) => p.id === state.winnerId);
  const standings = [...state.players].sort((a, b) => b.total - a.total);
  const winnerName = winner?.name ?? "";
  // Online knows exactly which seat is yours; offline falls back to the summary,
  // which is only recorded for solo games.
  const youWon = youId ? state.winnerId === youId : (summary?.won ?? false);
  const titled = youId != null || summary != null;

  return (
    <Modal
      icon={youWon ? "🏆" : "🏁"}
      scroll
      title={
        titled
          ? youWon
            ? t("gameOver.youWin")
            : t("gameOver.wins", { name: winnerName })
          : t("gameOver.winsExcl", { name: winnerName })
      }
      actions={
        <>
          {onPlayAgain ? (
            <Button variant="roll" onClick={onPlayAgain}>
              {playAgainLabel ?? t("gameOver.playAgain")}
            </Button>
          ) : (
            waitingNote != null && <span className="overlay__note">{waitingNote}</span>
          )}
          <Button onClick={onMenu}>{menuLabel ?? t("gameOver.mainMenu")}</Button>
        </>
      }
    >
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
              {youId && p.id === youId ? ` ${t("common.youParen")}` : ""}
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
    </Modal>
  );
}
