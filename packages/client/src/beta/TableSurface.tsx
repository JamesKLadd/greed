import { useId } from "react";
export function TableSurface() {
  const id = useId();
  const rail = id + "-rail",
    felt = id + "-felt",
    weave = id + "-weave";
  return (
    <svg
      className="tp-surface"
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={rail} x2="0.8" y2="1">
          <stop stopColor="#9d7b47" />
          <stop offset=".2" stopColor="#25362f" />
          <stop offset=".6" stopColor="#131e1b" />
          <stop offset="1" stopColor="#b59254" />
        </linearGradient>
        <radialGradient id={felt} cx=".5" cy=".35" r=".8">
          <stop stopColor="var(--felt-1, #22634f)" />
          <stop offset=".65" stopColor="var(--felt-2, #164b3d)" />
          <stop offset="1" stopColor="var(--felt-edge, #0e322e)" />
        </radialGradient>
        <pattern id={weave} width="5" height="5" patternUnits="userSpaceOnUse">
          <path d="M0 0h1v1H0zM3 3h1v1H3z" fill="#b7d5a0" opacity=".075" />
        </pattern>
      </defs>
      <path
        d="M278 160 Q500 142 722 160 Q750 160 758 197 L999 960 Q1010 999 965 999 H35 Q-10 999 1 960 L242 197 Q250 160 278 160Z"
        fill={`url(#${rail})`}
        stroke="#cbb27a"
        strokeWidth="3"
      />
      <path
        d="M284 183 Q500 166 716 183 Q733 183 740 214 L975 958 Q983 976 960 976 H40 Q17 976 25 958 L260 214 Q267 183 284 183Z"
        fill={`url(#${felt})`}
        stroke="#dfc78b"
        strokeOpacity=".65"
        strokeWidth="2"
      />
      <path d="M284 183 Q500 166 716 183 L975 976 H25Z" fill={`url(#${weave})`} />
      <path
        d="M299 207 Q500 192 701 207 L938 946 H62Z"
        fill="none"
        stroke="#cfb774"
        strokeOpacity=".22"
        strokeWidth="1.5"
      />
    </svg>
  );
}
