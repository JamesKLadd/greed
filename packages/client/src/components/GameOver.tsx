import type { ReactNode } from "react";
import type { GameState } from "@greed/core";
import { isWinner as isWinningSeat, teamTotal } from "@greed/core";
import type { Achievement, GameSummary } from "../game/profile.js";
import { Button, Modal } from "../ui/index.js";
import { useT } from "../i18n/i18n.js";
import type { MsgKey } from "../i18n/i18n.js";
import { teamName } from "../game/teams.js";

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
  /** Renders play-again as already-chosen — a cast rematch vote you can retract. */
  playAgainActive?: boolean;
  /** An extra action beside play-again (online: the host's way back to the lobby). */
  onSecondary?: () => void;
  secondaryLabel?: string;
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
  playAgainActive = false,
  onSecondary,
  secondaryLabel,
  waitingNote,
  onMenu,
  menuLabel,
}: GameOverProps) {
  const t = useT();
  const winner = state.players.find((p) => p.id === state.winnerId);
  const sides = state.teams;
  // A team game is won by a side, so that is what the header names and what the
  // standings are grouped by — an individual's total is only their contribution.
  const winnerName =
    sides && state.winnerTeam !== null ? teamName(t, state.winnerTeam) : (winner?.name ?? "");
  // Online knows exactly which seat is yours; offline falls back to the summary,
  // which is only recorded for solo games.
  const youWon = youId ? isWinningSeat(state, youId) : (summary?.won ?? false);
  const titled = youId != null || summary != null;

  const standings = [...state.players].sort((a, b) => b.total - a.total);
  const sideStandings = sides
    ? sides
        .map((members, side) => ({
          side,
          total: teamTotal(state, side),
          members: members.map((i) => state.players[i]).sort((a, b) => b.total - a.total),
        }))
        .sort((a, b) => b.total - a.total)
    : null;

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
            <Button
              variant={playAgainActive ? "ghost" : "roll"}
              onClick={onPlayAgain}
              aria-pressed={playAgainActive}
            >
              {playAgainLabel ?? t("gameOver.playAgain")}
            </Button>
          ) : (
            waitingNote != null && <span className="overlay__note">{waitingNote}</span>
          )}
          {onSecondary && <Button onClick={onSecondary}>{secondaryLabel}</Button>}
          <Button onClick={onMenu}>{menuLabel ?? t("gameOver.mainMenu")}</Button>
        </>
      }
    >
      {sideStandings ? (
        <div className="standings standings--teams">
          {sideStandings.map((side) => (
            <div
              key={side.side}
              className={`standings__team${
                side.side === state.winnerTeam ? " standings__team--win" : ""
              }`}
              data-team={side.side}
            >
              <div className="standings__team-head">
                <span>{teamName(t, side.side)}</span>
                <span>{side.total}</span>
              </div>
              <ol>
                {side.members.map((p) => (
                  <li key={p.id} className="standings__row">
                    <span>
                      {p.name}
                      {youId && p.id === youId ? ` ${t("common.youParen")}` : ""}
                      {p.isBot ? ` (${t(`pers.${p.botPersonality ?? "balanced"}`)})` : ""}
                    </span>
                    <span>{p.total}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      ) : (
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
                {p.isBot ? ` (${t(`pers.${p.botPersonality ?? "balanced"}`)})` : ""}
              </span>
              <span>{p.total}</span>
            </li>
          ))}
        </ol>
      )}

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
