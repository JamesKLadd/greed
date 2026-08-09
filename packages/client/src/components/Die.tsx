import { useEffect, useState, type CSSProperties } from "react";
import type { DieValue } from "@greed/core";
import { useT } from "../i18n/i18n.js";

// Pip positions on a 3x3 grid (index = row * 3 + col).
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

interface DieProps {
  value: DieValue;
  locked?: boolean;
  rolling?: boolean;
  dim?: boolean;
  /**
   * Edge length in px. Pips/padding scale with it. When omitted, the die's size
   * is left to CSS (1em == edge length) so it can be made responsive per screen
   * — the in-game tray uses this; fixed-size previews (rules, history) pass a px.
   */
  size?: number;
}

export function Die({ value, locked = false, rolling = false, dim = false, size }: DieProps) {
  const t = useT();
  const [shown, setShown] = useState<number>(value);

  useEffect(() => {
    if (!rolling) {
      setShown(value);
      return;
    }
    const id = window.setInterval(() => setShown(1 + Math.floor(Math.random() * 6)), 80);
    return () => clearInterval(id);
  }, [rolling, value]);

  const v = rolling ? shown : value;
  const classes = [
    "die",
    locked ? "die--locked" : "",
    rolling ? "die--rolling" : "",
    dim ? "die--dim" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Everything scales off font-size (1em == the die's edge). Setting it fixes the
  // size; leaving it unset lets CSS drive it (responsively) for the in-game tray.
  const style: CSSProperties | undefined = size != null ? { fontSize: `${size}px` } : undefined;

  return (
    <div
      className={classes}
      role="img"
      aria-label={locked ? t("aria.dieLocked", { value: v }) : t("aria.die", { value: v })}
      style={style}
    >
      <div className="die__face">
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className={`pip${PIPS[v].includes(i) ? " pip--on" : ""}`} />
        ))}
      </div>
    </div>
  );
}
