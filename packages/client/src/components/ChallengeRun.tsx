import { useEffect } from "react";
import { canToggleLock, isLastHeldDie as lastHeld } from "@greed/core";
import { useChallengeRun, type PlayMove, type RunView } from "../game/useChallengeRun.js";
import { useGameSounds, useRollSound } from "../game/useGameSounds.js";
import { Die } from "./Die.js";
import { Button } from "../ui/index.js";
import { rollCall } from "../game/rollCall.js";
import { useT } from "../i18n/i18n.js";
import type { MsgKey } from "../i18n/i18n.js";

/**
 * The board for a scored solo run in progress — a daily run or a weekly
 * attempt. The two are the same ten turns played the same way; all that differs
 * is where the moves are sent, which arrives as `playMove`.
 *
 * Split out of the screens because the run is driven by the server: the hook
 * needs a dealt position to start from, and a hook cannot be called
 * conditionally. Mounting this only once the server has handed over a run keeps
 * that straightforward — and unmounting it when the run ends disposes of the
 * position rather than leaving a stale board behind.
 */

interface ChallengeRunProps {
  /** The position the server dealt — a fresh run, or one being resumed. */
  initial: RunView;
  dice3d: boolean;
  /** Sends a move to whichever challenge this run belongs to. */
  playMove: PlayMove;
  /** Called when the last turn resolves. */
  onFinished: () => void;
}

export function ChallengeRun({ initial, dice3d, playMove, onFinished }: ChallengeRunProps) {
  const t = useT();
  const run = useChallengeRun(initial, playMove);
  const call = rollCall(run.state.turn);
  useGameSounds(run.state);
  useRollSound(run.isRolling);

  // The server decides when the run is over; this only reports it upward, and
  // does it in an effect so the parent's state change isn't made during render.
  useEffect(() => {
    if (run.finished) onFinished();
  }, [run.finished, onFinished]);

  return (
    <div className="daily__run">
      {run.error && <div className="banner banner--sd">{run.error}</div>}

      <div className="daily__meters">
        <div className="meter">
          <span className="meter__label">{t("run.turn")}</span>
          <span className="meter__value">
            {Math.min(run.turn + 1, run.totalTurns)}/{run.totalTurns}
          </span>
        </div>
        <div className="meter">
          <span className="meter__label">{t("run.banked")}</span>
          <span className="meter__value">{run.state.players[0].total}</span>
        </div>
        <div className="meter">
          <span className="meter__label">{t("controls.turnPoints")}</span>
          <span className="meter__value">{run.state.turn.turnScore}</span>
        </div>
      </div>

      {/* What the throw was, named — the same call the table gives a local game.
          A five of a kind built across throws is the most exciting thing that
          can happen in a run, and it used to pass here without a word, because
          this banner was only ever drawn on the felt. Held back while the dice
          are in the air, since the tray is still showing the previous throw. */}
      {call && !run.isRolling && (
        <div key={run.state.turn.rollCount} className={`felt__call felt__call--${call}`}>
          {t(`call.${call}` as MsgKey)}
        </div>
      )}

      <div
        className={[
          "dice-tray",
          "daily__dice",
          run.state.turn.outcome === "busted" ? "dice-tray--busted" : "",
          run.state.turn.hotDice && !run.isRolling ? "dice-tray--hot" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {run.state.turn.dice.map((v, i) => (
          <Die
            key={i}
            value={v}
            size={46}
            locked={run.state.turn.locked[i] && !run.state.turn.hotDice}
            rolling={run.isRolling && run.rollingIndices.includes(i)}
            dim={run.state.turn.lastRoll === null && !run.isRolling}
            dimensional={dice3d}
            landing={
              run.isRolling && run.rollingIndices.includes(i) ? run.rollingDice?.[i] : undefined
            }
            // Held dice are the player's to change here too: the five-of-a-kind
            // is worth chasing in a daily run as much as anywhere else. Always
            // passed, never withdrawn mid-throw — see toggleDisabled on Die.
            onToggle={() => run.toggleDie(i)}
            // Same rule the engine applies, so the last held die reads as
            // unavailable instead of ignoring the tap.
            toggleDisabled={run.isRolling || run.finished || !canToggleLock(run.state.turn, i)}
            refusedReason={lastHeld(run.state.turn, i) ? t("dice.keepOneHeld") : undefined}
            toggleLabel={run.state.turn.locked[i] ? t("aria.unhold") : t("aria.hold")}
          />
        ))}
      </div>

      <p className="daily__status">
        {run.state.turn.outcome === "busted"
          ? t("run.busted")
          : run.state.turn.hotDice
            ? t("controls.hotDice")
            : run.state.turn.lastRoll === null
              ? t("controls.rollToStart")
              : t("controls.rollOrBank")}
      </p>

      <div className="daily__actions">
        <Button variant="roll" size="lg" disabled={!run.canRoll} onClick={run.roll}>
          {t("controls.rollDice")}
        </Button>
        <Button variant="bank" size="lg" disabled={!run.canBank} onClick={run.bank}>
          {t("controls.bank")}
        </Button>
      </div>
    </div>
  );
}
