import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { GameState } from "@greed/core";
import { readCelebration, type CelebrationCursor } from "../beta/celebrations.js";
import { currentSeasonalTheme, type SeasonalTheme } from "../game/seasonal.js";

/** How long the burst is on screen; matches seasonal-burst in seasonal.css. */
const BURST_MS = 1500;
const PARTICLES = 16;

/**
 * A straight or five of a kind, in season: a burst of bats in October,
 * snowflakes at Christmas, hearts for Valentine's — whatever the theme on
 * screen is, out of nothing and gone in a second and a half. Classic gets none:
 * the effect is the season's, not the hand's.
 *
 * The hands are found by the same reader the new look's banners use
 * (celebrations.ts), so a hand is celebrated once, on the throw that made it —
 * never on a reconnect, a resync, or a lock toggle that revisits it. Drawn in a
 * fixed layer over everything and hidden from assistive technology: it moves
 * nothing, covers nothing that can be pressed, and says nothing the turn's own
 * announcement has not.
 */
export function SeasonalBigHand({
  state,
  isRolling,
  suspended = false,
}: {
  state: GameState;
  isRolling: boolean;
  suspended?: boolean;
}) {
  const cursor = useRef<CelebrationCursor>();
  const [burst, setBurst] = useState<{ theme: SeasonalTheme; nonce: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (suspended || (typeof document !== "undefined" && document.hidden)) {
      cursor.current = readCelebration(state).cursor;
      return;
    }
    if (isRolling) return;
    const result = readCelebration(state, cursor.current);
    cursor.current = result.cursor;
    if (result.cue?.kind !== "straight" && result.cue?.kind !== "five") return;
    const theme = currentSeasonalTheme();
    if (theme === "classic") return;
    clearTimeout(timer.current);
    setBurst({ theme, nonce: Date.now() });
    timer.current = setTimeout(() => setBurst(null), BURST_MS);
  }, [state, isRolling, suspended]);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!burst) return null;
  const [a, b] = SHAPES[burst.theme as Exclude<SeasonalTheme, "classic">];
  return (
    <div
      key={burst.nonce}
      className={`seasonal-burst seasonal-burst--${burst.theme}`}
      aria-hidden="true"
    >
      {Array.from({ length: PARTICLES }, (_, i) => (
        <svg
          key={i}
          className="seasonal-burst__piece"
          viewBox="-10 -10 20 20"
          style={
            {
              "--angle": `${(360 / PARTICLES) * i + (i % 2 ? 9 : 0)}deg`,
              "--distance": `${120 + (i % 4) * 34}px`,
              "--delay": `${(i % 5) * 40}ms`,
              "--spin": `${i % 2 ? 200 : -160}deg`,
            } as CSSProperties
          }
        >
          {i % 2 ? b : a}
        </svg>
      ))}
    </div>
  );
}

const heart = (fill: string) => (
  <path d="M0 6C-2 1-9 0-9-4c0-4 5-6 9-2 4-4 9-2 9 2 0 4-7 5-9 10Z" fill={fill} />
);
const leaf = (fill: string) => (
  <>
    <path d="M0-9Q8-2 0 9Q-8-2 0-9Z" fill={fill} />
    <path d="M0-7V10" stroke="#6a3410" strokeWidth="1" />
  </>
);
const star = (fill: string) => (
  <path d="M0-9L2.6-2.6 9 0 2.6 2.6 0 9-2.6 2.6-9 0-2.6-2.6Z" fill={fill} />
);

/** Two pieces a season, alternated round the burst. */
const SHAPES: Record<Exclude<SeasonalTheme, "classic">, [ReactNode, ReactNode]> = {
  halloween: [
    <path
      key="bat"
      d="M0 2-3-2-4 1C-8-4-13-4-17-6c1 6 3 10 8 12 1-2 3-3 5-1L0 8l4-3c2-2 4-2 5 1 5-2 7-6 8-12-4 2-9 2-13 7L3-2Z"
      fill="#1d1430"
      stroke="#d6a6c8"
      strokeWidth="0.6"
    />,
    <g key="candy">
      <path d="M-4 0-9-4-8 0-9 4ZM4 0 9-4 8 0 9 4Z" fill="#9b5de5" />
      <ellipse rx="4.5" ry="4" fill="#ff8a1f" />
    </g>,
  ],
  christmas: [
    <g key="flake" stroke="#e8f4ff" strokeWidth="1.4" strokeLinecap="round">
      <path d="M0-9V9M-7.8-4.5 7.8 4.5M-7.8 4.5 7.8-4.5" />
      <path d="M-2-7 0-5 2-7M-2 7 0 5 2 7" fill="none" />
    </g>,
    star("#ffe08a"),
  ],
  summer: [
    <g key="sun">
      <circle r="5" fill="#ffd23f" />
      <path
        d="M0-9V-7M0 7V9M-9 0H-7M7 0H9M-6.4-6.4-5-5M5 5 6.4 6.4M-6.4 6.4-5 5M5-5 6.4-6.4"
        stroke="#ff9f1a"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </g>,
    <g key="ball">
      <circle r="8" fill="#fff" />
      <path d="M0-8A8 8 0 0 1 8 0H0Z" fill="#e8392f" />
      <path d="M0 8A8 8 0 0 1-8 0H0Z" fill="#2f7be0" />
    </g>,
  ],
  newyear: [
    <rect key="confetti" x="-6" y="-3" width="12" height="6" rx="1" fill="#ff8fc0" />,
    star("#f2d27a"),
  ],
  valentines: [heart("#ff3d6e"), heart("#ffc2cf")],
  stpatricks: [
    <g key="shamrock" fill="#4fbf6a">
      <circle cy="-4" r="4" />
      <circle cx="4" cy="2" r="4" />
      <circle cx="-4" cy="2" r="4" />
      <path d="M0 2Q2 7-1 10" stroke="#2f7a45" strokeWidth="1.4" fill="none" />
    </g>,
    <g key="coin">
      <circle r="7" fill="#f6c533" stroke="#a8700a" strokeWidth="1.2" />
      <circle r="4" fill="none" stroke="#a8700a" strokeWidth="0.8" />
    </g>,
  ],
  thanksgiving: [leaf("#e8742a"), leaf("#c94a1c")],
};
