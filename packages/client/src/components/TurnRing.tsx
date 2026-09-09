import { useEffect, useRef, useState } from "react";
import { play } from "../game/sfx.js";

/**
 * A countdown ring around the active seat's avatar, drawn while the server is
 * waiting for that player to START their turn.
 *
 * What it measures is worth being precise about, because it's easy to assume
 * otherwise: the server only ever limits how long you can take to BEGIN a turn.
 * Once you've rolled once you can think about rolling again or banking for as
 * long as you like. So the ring covers exactly that opening window, and when it
 * ends it completes and fades rather than vanishing — "you started in time",
 * not "something broke".
 */

interface TurnRingProps {
  /** Monotonic (performance.now) deadline and the full window it counts down. */
  timer: { endsAt: number; total: number } | null;
}

/** How long the "you made it" flourish runs after the clock stops. */
const SETTLE_MS = 420;

/** Below this many seconds the ring starts counting out loud, and chimes once. */
const URGENT_SECONDS = 5;

export function TurnRing({ timer }: TurnRingProps) {
  const [fraction, setFraction] = useState(1);
  const [settling, setSettling] = useState(false);
  const wasRunning = useRef(false);
  /** So the urgency cue fires once per turn, not once per frame. */
  const chimed = useRef(false);

  useEffect(() => {
    if (!timer) {
      // Ran out, or the player rolled and the server stopped sending a clock.
      // Either way, close the ring rather than blinking it out of existence.
      if (wasRunning.current) {
        wasRunning.current = false;
        setSettling(true);
        const t = setTimeout(() => setSettling(false), SETTLE_MS);
        return () => clearTimeout(t);
      }
      return;
    }

    wasRunning.current = true;
    setSettling(false);
    chimed.current = false;
    let raf = 0;
    const tick = () => {
      const left = timer.endsAt - performance.now();
      setFraction(Math.max(0, Math.min(1, left / timer.total)));
      // One cue, the moment it becomes urgent. A clock you have to be LOOKING
      // at is no use to the player this exists for — the one who glanced away.
      // Once, not a countdown: a repeating tick would be a nag on a table where
      // people are thinking.
      if (!chimed.current && left <= URGENT_SECONDS * 1000 && left > 0) {
        chimed.current = true;
        play("timeShort");
      }
      if (left > 0) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [timer]);

  if (!timer && !settling) return null;

  const shown = settling ? 1 : fraction;
  // Colour follows urgency rather than being a bare progress bar: the point is
  // to be glanceable, and green-amber-red needs no explaining.
  const tone = shown > 0.4 ? "ok" : shown > 0.15 ? "warn" : "bad";
  // Whole seconds left, once there are few enough to count. A ring shrinking on
  // a small seat is easy to miss entirely — which is exactly what players said
  // happened: they lost a seat without ever noticing a clock. A number is not
  // missable, and it only appears when it matters.
  const secondsLeft =
    timer && !settling ? Math.max(0, Math.ceil((timer.endsAt - performance.now()) / 1000)) : null;
  const counting = secondsLeft !== null && secondsLeft <= URGENT_SECONDS;
  const r = 46;
  const circumference = 2 * Math.PI * r;

  return (
    <svg
      className={`turn-ring turn-ring--${tone}${settling ? " turn-ring--settling" : ""}`}
      viewBox="0 0 100 100"
      aria-hidden="true"
    >
      <circle className="turn-ring__track" cx="50" cy="50" r={r} />
      <circle
        className="turn-ring__drain"
        cx="50"
        cy="50"
        r={r}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - shown)}
      />
      {counting && (
        <text
          className="turn-ring__count"
          x="50"
          y="50"
          textAnchor="middle"
          dominantBaseline="central"
        >
          {secondsLeft}
        </text>
      )}
    </svg>
  );
}
