import { useEffect, useRef, useState } from "react";

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

export function TurnRing({ timer }: TurnRingProps) {
  const [fraction, setFraction] = useState(1);
  const [settling, setSettling] = useState(false);
  const wasRunning = useRef(false);

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
    let raf = 0;
    const tick = () => {
      const left = timer.endsAt - performance.now();
      setFraction(Math.max(0, Math.min(1, left / timer.total)));
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
    </svg>
  );
}
