import { useEffect, useRef, useState, type CSSProperties } from "react";
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

/**
 * Where each value sits on the cube, as the transform that PLACES that face.
 * (CSS 3D: +X right, +Y down, +Z toward the viewer; each face is pushed out
 * half an edge along its own normal.)
 *
 * Opposite faces of a real die sum to seven, and this layout honours that —
 * 2 front / 5 back, 1 top / 6 bottom, 3 left / 4 right. It matters because the
 * cube is tilted enough to show slivers of the neighbouring faces, so the
 * numbers peeking round the edge are the ones that would really be there.
 */
const FACES: { value: DieValue; place: string }[] = [
  { value: 2, place: "rotateX(0deg)" },
  { value: 5, place: "rotateX(180deg)" },
  { value: 1, place: "rotateX(90deg)" },
  { value: 6, place: "rotateX(-90deg)" },
  { value: 3, place: "rotateY(-90deg)" },
  { value: 4, place: "rotateY(90deg)" },
];

/**
 * Rotation that turns each value to face the viewer — the die's resting pose.
 * Read with the tilt the cube is drawn at, that face is the one you look down
 * on: the "top" of the die as it sits on the felt.
 */
const REST: Record<DieValue, { x: number; y: number }> = {
  1: { x: -90, y: 0 },
  2: { x: 0, y: 0 },
  3: { x: 0, y: 90 },
  4: { x: 0, y: -90 },
  5: { x: 180, y: 0 },
  6: { x: 90, y: 0 },
};

const rand = (n: number) => Math.floor(Math.random() * n);

/**
 * Next absolute angle for an axis: at least `turns` whole revolutions on from
 * where it is, landing congruent to the resting angle.
 *
 * Angles ACCUMULATE rather than reset because the tumble is a CSS transition on
 * `transform`, and a transition only spins the long way round if the number it
 * is heading for is genuinely that much larger. Normalising back to 0..360
 * between throws would make the next roll unwind instead of tumbling on.
 */
function spinTo(from: number, rest: number, turns: number): number {
  const base = from + turns * 360;
  const delta = (((rest - base) % 360) + 360) % 360;
  return base + delta;
}

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
  /**
   * Render as a real 3D cube rather than a flat face. Used by the in-game tray
   * and the daily run. The small inline dice in turn history and the rules modal
   * stay flat: at 18px a tilted cube is mush, and those are read, not watched.
   */
  dimensional?: boolean;
  /**
   * The face this die is about to land on, supplied while `rolling`.
   *
   * The tray still shows the PREVIOUS state during a throw — the score and the
   * locks must not appear before the dice settle — but the cube has to know
   * where it is going the moment it leaves the felt, or it cannot turn there in
   * one motion. Only the die's own orientation uses this; nothing else about the
   * result is revealed early. Defaults to `value` (no throw in flight).
   */
  landing?: DieValue;
  /**
   * Called when the player taps this die to hold it or put it back. Omitted
   * wherever the dice are a picture rather than a control (the rules modal, the
   * turn history, another player's turn), and the die stays inert.
   */
  onToggle?: () => void;
  /** Why tapping is unavailable right now, for the tooltip / screen reader. */
  toggleLabel?: string;
}

function Face({ value, className = "" }: { value: number; className?: string }) {
  return (
    <div className={`die__face${className ? ` ${className}` : ""}`}>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={`pip${PIPS[value].includes(i) ? " pip--on" : ""}`} />
      ))}
    </div>
  );
}

export function Die({
  value,
  locked = false,
  rolling = false,
  dim = false,
  size,
  dimensional = false,
  landing,
  onToggle,
  toggleLabel,
}: DieProps) {
  const t = useT();
  const [shown, setShown] = useState<number>(value);

  useEffect(() => {
    if (!rolling || dimensional) {
      setShown(value);
      return;
    }
    // The flat die cycles faces to read as tumbling. The cube doesn't need it —
    // it physically turns — so this is skipped there.
    const id = window.setInterval(() => setShown(1 + Math.floor(Math.random() * 6)), 80);
    return () => clearInterval(id);
  }, [rolling, value, dimensional]);

  // The face this throw ends on. Known BEFORE the tumble starts (the controllers
  // resolve the roll up front and hold its result back from the rest of the UI),
  // which is what lets the cube turn to its answer in one continuous motion.
  // Spinning to a random pose and then correcting reads as two throws.
  const target = landing ?? value;

  // Absolute, ever-growing rotation of the cube. See spinTo().
  const angle = useRef({ x: REST[value].x, y: REST[value].y });
  // A throw is a fresh scatter: new tumble path, new short travel across the mat.
  const scatter = useRef({ tx: 0, ty: 0, delay: 0 });
  const wasRolling = useRef(rolling);

  if (dimensional) {
    if (rolling && !wasRolling.current) {
      // One arc: several whole turns on both axes, ending exactly on the face
      // that was rolled. When the throw finishes, the die is already there and
      // nothing further moves.
      angle.current = {
        x: spinTo(angle.current.x, REST[target].x, 2 + rand(2)),
        y: spinTo(angle.current.y, REST[target].y, 1 + rand(3)),
      };
      scatter.current = {
        // Kept small deliberately: the tray is only just wide enough for five
        // dice on a phone, so a big scatter would overlap neighbours or clip
        // the mat.
        tx: (Math.random() * 2 - 1) * 13,
        ty: -7 - Math.random() * 11,
        delay: rand(90),
      };
    } else if (!rolling) {
      // At rest. Normally a no-op — the throw already landed here — but it also
      // covers a die whose value changed without a throw (a new turn, a rematch).
      angle.current = {
        x: spinTo(angle.current.x, REST[value].x, 0),
        y: spinTo(angle.current.y, REST[value].y, 0),
      };
      scatter.current = { tx: 0, ty: 0, delay: 0 };
    }
  }
  wasRolling.current = rolling;

  const v = rolling && !dimensional ? shown : value;
  const classes = [
    "die",
    onToggle ? "die--tappable" : "",
    dimensional ? "die--3d" : "",
    locked ? "die--locked" : "",
    rolling ? "die--rolling" : "",
    dim ? "die--dim" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Everything scales off font-size (1em == the die's edge). Setting it fixes the
  // size; leaving it unset lets CSS drive it (responsively) for the in-game tray.
  const style: CSSProperties = {
    ...(size != null ? { fontSize: `${size}px` } : null),
    ...(dimensional
      ? ({
          "--travel-x": `${scatter.current.tx}px`,
          "--travel-y": `${scatter.current.ty}px`,
          "--spin-delay": `${scatter.current.delay}ms`,
        } as CSSProperties)
      : null),
  };

  const face = locked ? t("aria.dieLocked", { value }) : t("aria.die", { value });
  // A die you can act on is a button, not a picture: it has to be reachable by
  // keyboard and announced as something that does something.
  const Tag = onToggle ? "button" : "div";
  return (
    <Tag
      className={classes}
      {...(onToggle
        ? { type: "button" as const, onClick: onToggle, title: toggleLabel, "aria-pressed": locked }
        : { role: "img" })}
      aria-label={toggleLabel ? face + " — " + toggleLabel : face}
      style={style}
    >
      {dimensional ? (
        <div
          className="die__cube"
          style={{
            transform: `rotateX(var(--cube-tilt-x)) rotateY(var(--cube-tilt-y)) rotateX(${angle.current.x}deg) rotateY(${angle.current.y}deg)`,
            transitionDelay: `${scatter.current.delay}ms`,
            // The throw gets the long arc; the landing is a quick settle.
            transitionDuration: rolling ? "var(--cube-roll-ms)" : "var(--cube-settle-ms)",
          }}
        >
          {FACES.map((f) => (
            <div
              key={f.value}
              // Only the face you're looking down on lights up when it scores —
              // the sides stay unlit, so the scoring surface is unambiguous.
              className={`die__side${f.value === target ? " die__side--up" : ""}`}
              style={{ transform: `${f.place} translateZ(0.5em)` }}
            >
              <Face value={f.value} className={f.value === target ? "die__face--up" : ""} />
            </div>
          ))}
        </div>
      ) : (
        <Face value={v} />
      )}
    </Tag>
  );
}
