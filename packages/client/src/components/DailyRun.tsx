import { useEffect } from "react";
import { DAILY_TURNS } from "@greed/core";
import { useDailyRun } from "../game/useDailyRun.js";
import { useGameSounds, useRollSound } from "../game/useGameSounds.js";
import type { DailyRunView } from "../net/daily.js";
import { Die } from "./Die.js";
import { Button } from "../ui/index.js";
import { useT } from "../i18n/i18n.js";

/**
 * The board for a daily run in progress.
 *
 * Split out of DailyScreen because the run is driven by the server: the hook
 * needs a dealt position to start from, and a hook cannot be called
 * conditionally. Mounting this only once the server has handed over a run keeps
 * that straightforward — and unmounting it when the run ends disposes of the
 * position rather than leaving a stale board behind.
 */

interface DailyRunProps {
  /** The position the server dealt — a fresh run, or one being resumed. */
  initial: DailyRunView;
  dice3d: boolean;
  /** Called when the tenth turn resolves, with the finished run. */
  onFinished: () => void;
}

export function DailyRun({ initial, dice3d, onFinished }: DailyRunProps) {
  const t = useT();
  const run = useDailyRun(initial);
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
          <span className="meter__label">{t("daily.turn")}</span>
          <span className="meter__value">
            {Math.min(run.turn + 1, DAILY_TURNS)}/{run.totalTurns}
          </span>
        </div>
        <div className="meter">
          <span className="meter__label">{t("daily.banked")}</span>
          <span className="meter__value">{run.state.players[0].total}</span>
        </div>
        <div className="meter">
          <span className="meter__label">{t("controls.turnPoints")}</span>
          <span className="meter__value">{run.state.turn.turnScore}</span>
        </div>
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
          />
        ))}
      </div>

      <p className="daily__status">
        {run.state.turn.outcome === "busted"
          ? t("daily.busted")
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
