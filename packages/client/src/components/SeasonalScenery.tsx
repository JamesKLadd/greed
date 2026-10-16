import { useId } from "react";
import { useT } from "../i18n/i18n.js";

function Bat({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${scale})`}
      d="M0 5 -5 -3 -7 2C-15-8-26-9-34-13c1 12 5 21 15 25 1-5 7-6 11-1L0 18l8-7c4-5 10-4 11 1 10-4 14-13 15-25C26-9 15-8 7 2L5-3Z"
      fill="#0e0b20"
      stroke="#bb8eaf"
      strokeWidth="1"
    />
  );
}

function Pumpkin({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cy="22" rx="39" ry="9" fill="#080813" opacity=".55" />
      <path d="M-2-22q-4-15 6-19" fill="none" stroke="#8a9860" strokeWidth="6" />
      <ellipse cx="-15" rx="23" ry="28" fill="#b34e28" />
      <ellipse cx="15" rx="23" ry="28" fill="#dc7436" />
      <ellipse rx="20" ry="29" fill="#ef9348" />
      <path
        d="m-25-5 15-10 1 16Zm50 0L10-15 9 1ZM-22 9l11 3 5-4 7 6 7-5 13-2-8 13H-10Z"
        fill="#3b2130"
      />
      <path d="m-20-5 8-6v8Zm40 0-8-6v8ZM-16 12l10 1 7 5 7-4 9-3-6 6H-8Z" fill="#ffe1a0" />
    </g>
  );
}

function Pine({ flipped = false }: { flipped?: boolean }) {
  return (
    <g transform={flipped ? "translate(600) scale(-1 1)" : undefined}>
      <path
        d="M-15 14Q66 18 162 3M20 15l20 31M65 14l21 27M110 8l18 23"
        fill="none"
        stroke="#6e8461"
        strokeWidth="4"
      />
      {[22, 47, 72, 97, 122, 147].map((x, i) => (
        <path
          key={x}
          d={`M${x} 14l-13-16m13 16-7 19m16-22-8-16m8 16 1 17`}
          fill="none"
          stroke={i % 2 ? "#386e56" : "#619273"}
          strokeWidth="3"
          strokeLinecap="round"
        />
      ))}
      <path d="M46 26v21m55-34v18" stroke="#dac58f" />
      <circle cx="46" cy="58" r="12" fill="#b94c56" stroke="#eea38a" />
      <path d="M42 50q-5 4-3 9" fill="none" stroke="#ffcfb0" strokeWidth="2" />
      <circle cx="101" cy="41" r="8" fill="#e3b76a" stroke="#ffe1a0" />
    </g>
  );
}

/** Small vector room sets. Every piece stays behind the interface and ignores input. */
export function SeasonalScenery({ placement = "hero" }: { placement?: "hero" | "room" }) {
  const id = useId();
  return (
    <svg
      className={`seasonal-scenery seasonal-scenery--${placement}`}
      viewBox="0 0 600 260"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id={`${id}-moon`}>
          <stop stopColor="#f9e8b5" />
          <stop offset="1" stopColor="#b6b7c8" />
        </radialGradient>
        <linearGradient id={`${id}-sun`} x2="0" y2="1">
          <stop stopColor="#ffdf91" />
          <stop offset="1" stopColor="#f17c6a" />
        </linearGradient>
      </defs>
      <g className="seasonal-set seasonal-set--halloween">
        <circle cx="507" cy="72" r="60" fill="#e5cda8" opacity=".045" />
        <circle cx="507" cy="72" r="43" fill={`url(#${id}-moon)`} opacity=".8" />
        <circle cx="490" cy="61" r="10" fill="#8e8ca7" opacity=".18" />
        <circle cx="517" cy="91" r="7" fill="#8e8ca7" opacity=".2" />
        <path
          d="M0 2h95L0 100V2l83 22L0 86 55 0 28 81M0 24q28 0 54 18M0 50q16-1 32 14"
          stroke="#bba6b9"
          opacity=".3"
        />
        <Bat x={124} y={55} scale={0.6} />
        <Bat x={455} y={105} scale={0.7} />
        <Bat x={554} y={31} scale={0.4} />
        <path
          d="M-10 229q70-35 135-5M462 239q80-28 151-8"
          stroke="#b398c6"
          strokeWidth="2"
          opacity=".15"
        />
        <Pumpkin x={57} y={210} scale={0.8} />
        <Pumpkin x={549} y={231} scale={0.58} />
        <path
          d="m72 98 2 6 6 2-6 2-2 6-2-6-6-2 6-2Zm480 48 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z"
          fill="#ecc586"
          opacity=".7"
        />
      </g>
      <g className="seasonal-set seasonal-set--christmas">
        <rect
          x="468"
          y="22"
          width="95"
          height="121"
          rx="31"
          fill="#0b202e"
          stroke="#8b7654"
          strokeWidth="4"
        />
        <path d="M515 24v116m-44-60h89" stroke="#8b7654" strokeWidth="3" />
        <path d="m484 133 18-26 17 26m8 0 13-19 14 19" fill="#a9c4c0" opacity=".6" />
        <g fill="#e9eee0">
          <circle cx="489" cy="48" r="2" />
          <circle cx="536" cy="67" r="2" />
          <circle cx="495" cy="95" r="1.5" />
          <circle cx="542" cy="43" r="1.5" />
          <circle cx="530" cy="100" r="2" />
        </g>
        <path d="M119 0Q300 43 479 0" stroke="#577258" strokeWidth="2" />
        {[149, 199, 249, 299, 349, 399, 449].map((x, i) => (
          <g key={x}>
            <circle
              cx={x}
              cy={i < 3 ? 8 + i * 5 : 23 - (i - 3) * 5}
              r="7"
              fill="#ffe3a5"
              opacity=".09"
            />
            <circle cx={x} cy={i < 3 ? 8 + i * 5 : 23 - (i - 3) * 5} r="2.5" fill="#ffe3a5" />
          </g>
        ))}
        <Pine />
        <Pine flipped />
        <path d="M31 241V133l8-8 8 8v108m12 0V158l7-7 7 7v83" fill="#f0d8a4" />
        <path d="M39 121q-10-13 0-24 10 11 0 24m27 27q-9-12 0-23 9 11 0 23" fill="#ffc76a" />
        <path
          d="M13 242h83m414-8 17-9 7 10 12-14 26 13"
          stroke="#315d4d"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <circle cx="540" cy="230" r="4" fill="#d76f6e" />
        <circle cx="549" cy="236" r="4" fill="#d76f6e" />
      </g>
      <g className="seasonal-set seasonal-set--summer">
        <circle cx="507" cy="86" r="58" fill="#ffbd82" opacity=".06" />
        <circle cx="507" cy="86" r="43" fill={`url(#${id}-sun)`} />
        <path d="M455 91h102m-108 8h114m-103 9h95m-89 8h82" stroke="#173c46" strokeWidth="3" />
        <path
          d="M438 140q44-11 80 0t83 0M426 153q50-12 103 0t79 0M462 168q42-8 83 0t62 0"
          stroke="#6bbdb7"
          opacity=".25"
          strokeWidth="2"
        />
        <path d="M49 239q25-59 10-116" stroke="#ae8964" strokeWidth="9" strokeLinecap="round" />
        <path
          d="M60 125q-42-35-60-2 36-12 60 2Zm0 0q-19-56-45-41 29 7 45 41Zm0 0q9-61 35-50-23 19-35 50Zm0 0q48-34 62-8-36-6-62 8Zm0 0q-26 2-30 36 22-24 30-36Z"
          fill="#376f61"
        />
        <path
          d="M10 244q50-14 113 0m368 1q52-15 103-4"
          stroke="#bc9e78"
          strokeWidth="2"
          opacity=".4"
        />
        <path d="M512 244v-55m-35 1q35-42 70 0Z" fill="#e69b7b" stroke="#ead1a6" strokeWidth="2" />
        <path d="M512 169q-13 6-16 21m16-21q13 6 16 21" stroke="#f6d8a1" strokeWidth="2" />
        <path
          d="M114 35q8-7 16 0 8-7 16 0m-32 19q6-5 12 0 6-5 12 0"
          stroke="#a9ccc1"
          opacity=".55"
          strokeWidth="2"
        />
      </g>
    </svg>
  );
}

/** CSS follows the pinned document theme, including date changes while Home stays open. */
export function SeasonalName({ fallback }: { fallback: string }) {
  const t = useT();
  return (
    <>
      <span className="seasonal-default-name">{fallback}</span>
      <span className="seasonal-name seasonal-name--halloween">{t("seasonal.name.halloween")}</span>
      <span className="seasonal-name seasonal-name--christmas">{t("seasonal.name.christmas")}</span>
      <span className="seasonal-name seasonal-name--summer">{t("seasonal.name.summer")}</span>
    </>
  );
}

export function SeasonalWinFlourish() {
  return (
    <svg className="seasonal-win" viewBox="0 0 400 160" aria-hidden="true" focusable="false">
      <g className="seasonal-set seasonal-set--halloween">
        <Bat x={50} y={70} scale={0.6} />
        <Bat x={335} y={42} scale={0.8} />
        <Bat x={300} y={115} scale={0.45} />
      </g>
      <g className="seasonal-set seasonal-set--christmas" fill="#ffe2a0">
        <path d="m38 70 5 13 14 1-11 8 3 14-11-8-12 8 3-14-11-8 14-1Zm299-48 6 16 17 1-13 10 4 17-14-10-14 10 4-17-13-10 17-1Z" />
        <path d="M310 100v32m-14-24 28 17m-28 0 28-17" stroke="#cfe6df" strokeWidth="2" />
      </g>
      <g className="seasonal-set seasonal-set--summer" stroke="#ffd494" strokeWidth="3">
        <circle cx="340" cy="50" r="14" fill="#eaa47d" />
        <path d="M340 25v-9m0 68v-9m25-25h9m-68 0h9m7-18-7-7m50 50-7-7m0-36 7-7m-50 50 7-7" />
        <path d="m43 90 5 12m10 13 10 3m-38-1-6 11" stroke="#79cfc3" />
      </g>
    </svg>
  );
}
