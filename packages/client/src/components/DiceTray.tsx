import { canToggleLock, isLastHeldDie as lastHeld } from "@greed/core";
import type { DieValue, TurnState } from "@greed/core";
import { Die } from "./Die.js";
import { useT } from "../i18n/i18n.js";

interface DiceTrayProps {
  turn: TurnState;
  rollingIndices: number[];
  isRolling: boolean;
  /** Faces the throw in flight lands on; the dice turn to these as they tumble. */
  rollingDice?: DieValue[] | null;
  /** Draw the dice as 3D cubes (a display setting). */
  dice3d?: boolean;
  /**
   * Hold this die, or put it back. Absent when the dice are not this player's
   * to touch — someone else's turn, a spectator, a finished turn — and the tray
   * is then exactly what it was before.
   */
  onToggle?: (index: number) => void;
  disabled?: boolean;
}

export function DiceTray({
  turn,
  rollingIndices,
  isRolling,
  rollingDice,
  dice3d = true,
  onToggle,
  disabled = false,
}: DiceTrayProps) {
  const t = useT();
  const hasRolled = turn.lastRoll !== null || isRolling;
  const hot = turn.hotDice && !isRolling && turn.outcome === null;
  return (
    <div
      className={[
        "dice-tray",
        turn.outcome === "busted" ? "dice-tray--busted" : "",
        hot ? "dice-tray--hot" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={t("aria.dice")}
    >
      {turn.dice.map((value, i) => {
        const rolling = isRolling && rollingIndices.includes(i);
        return (
          <Die
            key={i}
            value={value}
            locked={turn.locked[i] && !turn.hotDice}
            rolling={rolling}
            dim={!hasRolled}
            dimensional={dice3d}
            landing={rolling ? rollingDice?.[i] : undefined}
            // Passed whenever these dice are the viewer's to touch, and only
            // switched OFF by `toggleDisabled` — see the note on that prop for
            // why this must not become undefined mid-throw.
            onToggle={onToggle ? () => onToggle(i) : undefined}
            // Asked of the engine rather than re-derived, so a die the rules
            // will not move is drawn as one you cannot move — including the
            // last held die, which cannot be put back. A tap that would be
            // silently ignored is worse than one that is plainly unavailable.
            toggleDisabled={disabled || isRolling || !canToggleLock(turn, i)}
            refusedReason={lastHeld(turn, i) ? t("dice.keepOneHeld") : undefined}
            toggleLabel={turn.locked[i] ? t("aria.unhold") : t("aria.hold")}
          />
        );
      })}
    </div>
  );
}
