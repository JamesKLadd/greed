import type { ReactNode } from "react";
import type { GameState } from "@greed/core";
import { isWinner as isWinningSeat, teamTotal } from "@greed/core";
import type { Achievement, GameSummary } from "../game/profile.js";
import { Button, Modal } from "../ui/index.js";
import { useI18n } from "../i18n/i18n.js";
import type { MsgKey } from "../i18n/i18n.js";
import { teamName } from "../game/teams.js";
import { useBetaActive } from "../beta/BetaContext.js";

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
  /** The local player, when known. Omit for pass-and-play and spectators. */
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
  const { t, n } = useI18n();
  const betaActive = useBetaActive();
  const winner = state.players.find((p) => p.id === state.winnerId);
  const sides = state.teams;
  // A team game is won by a side, so that is what the header names and what the
  // standings are grouped by — an individual's total is only their contribution.
  const winnerName =
    sides && typeof state.winnerTeam === "number"
      ? teamName(t, state.winnerTeam)
      : (winner?.name ?? "");
  // Online knows exactly which seat is yours; offline falls back to the summary,
  // which is only recorded for solo games.
  const youWon = youId ? isWinningSeat(state, youId) : (summary?.won ?? false);
  const titled = youId != null || summary != null;
  const winnerTotal =
    sides && typeof state.winnerTeam === "number"
      ? teamTotal(state, state.winnerTeam)
      : (winner?.total ?? 0);

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
      className={`results-modal${betaActive ? " results-modal--beta" : ""}`}
      icon={
        betaActive ? (
          <svg className="beta-trophy" viewBox="0 0 100 100" aria-hidden="true">
            <path d="M27 14h46v22c0 20-11 28-23 28S27 56 27 36Z" fill="currentColor" />
            <path
              d="M27 22H13v14c0 12 8 17 20 17M73 22h14v14c0 12-8 17-20 17M50 64v19M32 88h36"
              fill="none"
              stroke="currentColor"
              strokeWidth="7"
              strokeLinecap="round"
            />
            <path d="m50 25 4 9 10 1-8 7 2 10-8-5-8 5 2-10-8-7 10-1Z" fill="#153a2e" />
          </svg>
        ) : youWon ? (
          "🏆"
        ) : (
          "🏁"
        )
      }
      scroll
      title={
        titled
          ? youWon
            ? t("gameOver.youWin")
            : t("gameOver.wins", { name: winnerName })
          : t("gameOver.winsExcl", { name: winnerName })
      }
      actions={
        <div className="results-actions">
          {onPlayAgain ? (
            <div className="results-actions__primary">
              <Button
                variant={playAgainActive ? "ghost" : "roll"}
                onClick={onPlayAgain}
                pressed={playAgainLabel != null ? playAgainActive : undefined}
              >
                {playAgainActive && <span aria-hidden="true">✓ </span>}
                {playAgainLabel ?? t("gameOver.playAgain")}
              </Button>
              {playAgainActive && (
                <p className="results-actions__note">{t("gameOver.voteChosen")}</p>
              )}
            </div>
          ) : (
            waitingNote != null && (
              <p className="results-actions__note results-actions__waiting" role="status">
                {waitingNote}
              </p>
            )
          )}
          <div className="results-actions__secondary">
            {onSecondary && <Button onClick={onSecondary}>{secondaryLabel}</Button>}
            <Button onClick={onMenu}>{menuLabel ?? t("gameOver.mainMenu")}</Button>
          </div>
        </div>
      }
    >
      <div className="results-winner">
        {youWon && <strong className="results-winner__name">{winnerName}</strong>}
        <span className="results-winner__label">
          {t(sides ? "gameOver.teamTotal" : "gameOver.winningScore")}
        </span>
        <div className="results-winner__score">
          <strong>{n(winnerTotal)}</strong>
          <span>{t("challenge.points")}</span>
        </div>
      </div>

      <section className="results-standings" aria-label={t("gameOver.standings")}>
        <div className="results-standings__head">
          <h3>{t("gameOver.standings")}</h3>
          <span>{t(sides ? "gameOver.teamTotal" : "gameOver.score")}</span>
        </div>
        {sideStandings ? (
          <div className="standings standings--teams">
            {sideStandings.map((side, index) => (
              <div
                key={side.side}
                className={`standings__team${
                  side.side === state.winnerTeam ? " standings__team--win" : ""
                }`}
                data-team={side.side}
              >
                <div className="standings__team-head">
                  <span className="results-team__name">
                    <span className="results-rank">{n(index + 1)}</span>
                    <span>{teamName(t, side.side)}</span>
                  </span>
                  <span className="results-score">{n(side.total)}</span>
                </div>
                <div className="results-team__contributions">{t("gameOver.contributions")}</div>
                <ol>
                  {side.members.map((p) => (
                    <li
                      key={p.id}
                      className={`standings__row${youId && p.id === youId ? " results-row--you" : ""}`}
                    >
                      <span className="results-player">
                        <span className="results-player__name">{p.name}</span>
                        {youId && p.id === youId && (
                          <span className="results-player__you">{t("common.youParen")}</span>
                        )}
                        {p.isBot && (
                          <span className="results-player__detail">
                            {t(`pers.${p.botPersonality ?? "balanced"}`)}
                          </span>
                        )}
                      </span>
                      <span className="results-score">{n(p.total)}</span>
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
                className={`standings__row${p.id === state.winnerId ? " standings__row--win" : ""}${youId && p.id === youId ? " results-row--you" : ""}`}
              >
                <span className="results-rank">
                  {n(standings.findIndex((other) => other.total === p.total) + 1)}
                </span>
                <span className="results-player">
                  <span className="results-player__name">{p.name}</span>
                  {youId && p.id === youId && (
                    <span className="results-player__you">{t("common.youParen")}</span>
                  )}
                  {p.isBot && (
                    <span className="results-player__detail">
                      {t(`pers.${p.botPersonality ?? "balanced"}`)}
                    </span>
                  )}
                </span>
                <span className="results-score">{n(p.total)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {summary && (
        <section className="results-personal" aria-label={t("gameOver.personal")}>
          <h3>{t("gameOver.personal")}</h3>
          <div className="summary">
            <div className="summary__stat">
              <span className="summary__label">{t("gameOver.finalTotal")}</span>
              <span className="summary__value">{n(summary.finalTotal)}</span>
            </div>
            <div className="summary__stat">
              <span className="summary__label">{t("gameOver.bestTurn")}</span>
              <span className="summary__value">{n(summary.bestTurn)}</span>
            </div>
            <div className="summary__stat">
              <span className="summary__label">{t("gameOver.hotDice")}</span>
              <span className="summary__value">{n(summary.hotDice)}</span>
            </div>
            <div className="summary__stat">
              <span className="summary__label">{t("gameOver.busts")}</span>
              <span className="summary__value">{n(summary.busts)}</span>
            </div>
          </div>
        </section>
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
