import { useEffect, useState } from "react";
import type { DieValue } from "@greed/core";

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
  /** Edge length in px (default 66). Pips scale with it. */
  size?: number;
}

export function Die({ value, locked = false, rolling = false, dim = false, size = 66 }: DieProps) {
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

  const pip = Math.round(size * 0.17);

  return (
    <div
      className={classes}
      role="img"
      aria-label={`die showing ${v}${locked ? ", locked" : ""}`}
      style={{
        width: size,
        height: size,
        padding: Math.round(size * 0.14),
        borderRadius: Math.round(size * 0.21),
      }}
    >
      <div className="die__face">
        {Array.from({ length: 9 }, (_, i) => (
          <span
            key={i}
            className={`pip${PIPS[v].includes(i) ? " pip--on" : ""}`}
            style={{ width: pip, height: pip }}
          />
        ))}
      </div>
    </div>
  );
}
