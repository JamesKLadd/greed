import type { TurnState } from "@greed/core";
import { Die } from "./Die.js";
import { useT } from "../i18n/i18n.js";

interface DiceTrayProps {
  turn: TurnState;
  rollingIndices: number[];
  isRolling: boolean;
}

export function DiceTray({ turn, rollingIndices, isRolling }: DiceTrayProps) {
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
          />
        );
      })}
    </div>
  );
}
