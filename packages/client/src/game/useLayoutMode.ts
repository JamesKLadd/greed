import { useEffect, useState } from "react";

/**
 * Which table geometry the viewport gets: a tall oval with the opponents banked
 * across the top (phones held upright) or a wide oval with seats all the way
 * round the rail (laptops, tablets, phones on their side).
 *
 * This is a JS hook rather than a media query because the two layouts differ in
 * MARKUP, not just in position: the rail pods in a crowded portrait table drop
 * the name row entirely, and the seat coordinates themselves come from JS (they
 * land as inline --x/--y custom properties). CSS can only hide what React has
 * already rendered, and "render it, then hide it" is exactly what produced the
 * old max-width:760px override block this redesign replaces.
 *
 * The app is entirely client-rendered, so there is no hydration mismatch to
 * worry about; rotating a phone costs one re-render of one component.
 */

export type LayoutMode = "portrait" | "wide";

/* Landscape gets the wide oval, and so does any screen broad enough to seat
   players either side of the dice without crowding them. The min-height guard
   keeps a short landscape phone from getting a wide oval it has no room for. */
const WIDE = "(min-width: 760px), (orientation: landscape) and (min-height: 420px)";

function read(query: string): LayoutMode {
  if (typeof window === "undefined" || !window.matchMedia) return "portrait";
  return window.matchMedia(query).matches ? "wide" : "portrait";
}

export function useLayoutMode(compactLandscape = false): LayoutMode {
  const query = compactLandscape ? "(min-width: 760px), (orientation: landscape)" : WIDE;
  const [mode, setMode] = useState<LayoutMode>(() => read(query));

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMode(mq.matches ? "wide" : "portrait");
    // Re-read on mount too: the query can have flipped between the initial
    // useState and the effect running (a rotation during first paint).
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return mode;
}
