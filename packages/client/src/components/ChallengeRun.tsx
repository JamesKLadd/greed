import { useBetaActive } from "../beta/BetaContext.js";
import { useAppearance } from "../beta/AppearanceContext.js";
import { appearanceVars } from "../beta/appearance.js";
import { GameCelebration } from "../beta/Celebration.js";
import { useEffect, useId, useRef, useState } from "react";
import { canToggleLock, isLastHeldDie as lastHeld } from "@greed/core";
import { useChallengeRun, type PlayMove, type RunView } from "../game/useChallengeRun.js";
import { useGameSounds, useRollSound } from "../game/useGameSounds.js";
import { Die } from "./Die.js";
import { Button } from "../ui/index.js";
import { rollCall } from "../game/rollCall.js";
import { equippedDiceVars } from "../game/cosmetics.js";
import { loadProfile } from "../game/profile.js";
import { useI18n } from "../i18n/i18n.js";
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
  /** Read the authoritative position after a response is lost; never repeat a move. */
  resumeRun?: () => Promise<RunView | null>;
  /** Called when the last turn resolves. */
  onFinished: (final: RunView | null) => void;
}

export function ChallengeRun({
  initial,
  dice3d,
  playMove,
  resumeRun,
  onFinished,
}: ChallengeRunProps) {
  const { t, n } = useI18n();
  const helpId = useId();
  const beta = useBetaActive();
  const { appearance } = useAppearance();
  const run = useChallengeRun(initial, playMove, resumeRun);
  const [holdNotice, setHoldNotice] = useState(false);
  const reportedFinish = useRef(false);
  useEffect(() => setHoldNotice(false), [run.state]);
  // The player's equipped dice, read once for the life of the run: a skin
  // changed in the Locker mid-attempt would otherwise swap the dice underneath
  // them. The beta's own appearance vars go on the same element and are spread
  // after, so a beta look still wins where the two name the same property.
  const [diceSkin] = useState(() => equippedDiceVars(loadProfile()));
  const call = rollCall(run.state.turn);
  useGameSounds(run.state, true);
  useRollSound(run.isRolling);
  // Completed turns already includes the bust still being shown. Do not label
  // its dice as belonging to the following turn during the readable pause.
  const shownTurn = Math.max(
    1,
    Math.min(run.turn + (run.state.turn.outcome ? 0 : 1), run.totalTurns),
  );
  const status = run.isPending
    ? run.pendingMove === "ROLL"
      ? t("run.waitingRoll")
      : run.pendingMove === "BANK"
        ? t("run.savingBank")
        : run.pendingMove
          ? t("run.savingDice")
          : t("run.syncing")
    : run.needsSync
      ? t("run.syncNeeded")
      : run.isRolling
        ? t("run.rolling")
        : run.state.turn.outcome === "busted"
          ? t("run.busted")
          : run.state.turn.outcome === "banked"
            ? t("run.bankedTurn")
            : holdNotice
              ? t("dice.keepOneHeld")
              : run.state.turn.hotDice
                ? t("controls.hotDice")
                : run.state.turn.lastRoll === null
                  ? t("controls.rollToStart")
                  : t("controls.rollOrBank");

  // The server decides when the run is over; this only reports it upward, and
  // does it in an effect so the parent's state change isn't made during render.
  useEffect(() => {
    if (run.finished && !reportedFinish.current) {
      reportedFinish.current = true;
      onFinished(run.completedView);
    }
  }, [run.finished, run.completedView, onFinished]);

  return (
    <div
      className="daily__run"
      style={beta ? { ...diceSkin, ...appearanceVars(appearance) } : diceSkin}
    >
      {beta && <GameCelebration state={run.state} isRolling={run.isRolling} showVisuals={false} />}
      <div className="daily__meters">
        <div className="meter daily__meter-turn">
          <span className="meter__label">{t("run.turn")}</span>
          <span className="meter__value">
            {shownTurn}/{run.totalTurns}
          </span>
        </div>
        <div className="meter daily__meter-banked">
          <span className="meter__label">{t("run.bankedTotal")}</span>
          <span className="meter__value">{n(run.state.players[0].total)}</span>
        </div>
        <div className="meter daily__meter-risk">
          <span className="meter__label">{t("run.atRisk")}</span>
          <span className="meter__value">
            {n(run.state.turn.outcome ? 0 : run.state.turn.turnScore)}
          </span>
        </div>
      </div>

      {/* What the throw was, named — the same call the table gives a local game.
          A five of a kind built across throws is the most exciting thing that
          can happen in a run, and it used to pass here without a word, because
          this banner was only ever drawn on the felt. Held back while the dice
          are in the air, since the tray is still showing the previous throw.

          The slot around it is always here, empty or not; see .daily__callSlot
          for why a run cannot afford this one to change the layout. */}
      <div className="daily__callSlot">
        {call && !run.isRolling && (
          <div key={run.state.turn.rollCount} className={`felt__call felt__call--${call}`}>
            {t(`call.${call}` as MsgKey)}
          </div>
        )}
      </div>

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
          <span className="daily__dieCell" key={i}>
            <Die
              describedBy={helpId}
              value={v}
              size={46}
              // Hot dice are still a held hand until the player rolls the fresh
              // five. Match the button's pressed state to the real hold action.
              locked={run.state.turn.locked[i] && !(run.state.turn.hotDice && run.isRolling)}
              rolling={run.isRolling && run.rollingIndices.includes(i)}
              dim={run.state.turn.lastRoll === null && !run.isRolling}
              dimensional={dice3d}
              landing={
                run.isRolling && run.rollingIndices.includes(i) ? run.rollingDice?.[i] : undefined
              }
              // Held dice are the player's to change here too: the five-of-a-kind
              // is worth chasing in a daily run as much as anywhere else. Always
              // passed, never withdrawn mid-throw — see toggleDisabled on Die.
              onToggle={() => {
                if (!run.canToggleDice) return;
                if (lastHeld(run.state.turn, i)) {
                  setHoldNotice(true);
                  return;
                }
                setHoldNotice(false);
                run.toggleDie(i);
              }}
              // Same rule the engine applies, so the last held die reads as
              // unavailable instead of ignoring the tap.
              toggleDisabled={!run.canToggleDice || !canToggleLock(run.state.turn, i)}
              refusedReason={
                run.canToggleDice && lastHeld(run.state.turn, i) ? t("dice.keepOneHeld") : undefined
              }
              toggleLabel={run.state.turn.locked[i] ? t("aria.unhold") : t("aria.hold")}
            />
          </span>
        ))}
      </div>

      <p className="daily__status" role="status" aria-live="polite" aria-atomic="true">
        {status}
      </p>

      <div className="daily__actions" aria-busy={run.isPending}>
        <Button variant="roll" size="lg" disabled={!run.canRoll} onClick={run.roll}>
          {t("controls.rollDice")}
        </Button>
        <Button variant="bank" size="lg" disabled={!run.canBank} onClick={run.bank}>
          {t("controls.bank")}
        </Button>
      </div>
      <p id={helpId} className="daily__holdHelp">
        {t("run.holdHint")}
      </p>
      {run.error && (
        <div className="daily__moveError">
          <p role="alert">{run.error}</p>
          {run.needsSync && (
            <Button disabled={run.isPending} onClick={run.retrySync}>
              {t("run.retrySync")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
