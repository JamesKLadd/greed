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

function Burst({ x, y, r, color }: { x: number; y: number; r: number; color: string }) {
  return (
    <g stroke={color} strokeWidth="2.5" strokeLinecap="round">
      {Array.from({ length: 12 }, (_, i) => {
        const a = (Math.PI * 2 * i) / 12;
        return (
          <path
            key={i}
            d={`M${x + Math.cos(a) * r * 0.35} ${y + Math.sin(a) * r * 0.35}L${x + Math.cos(a) * r} ${y + Math.sin(a) * r}`}
          />
        );
      })}
      <circle cx={x} cy={y} r="3" fill={color} stroke="none" />
    </g>
  );
}

function Heart({ x, y, scale = 1, fill }: { x: number; y: number; scale?: number; fill: string }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${scale})`}
      d="M0 6C-2 0-10-1-10-6c0-5 6-7 10-2 4-5 10-3 10 2 0 5-8 6-10 12Z"
      fill={fill}
    />
  );
}

function Shamrock({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path d="M0 0Q4 14-3 26" stroke="#2f7a45" strokeWidth="3" fill="none" />
      <g fill="#4fbf6a">
        <circle cx="0" cy="-8" r="7" />
        <circle cx="7" cy="3" r="7" />
        <circle cx="-7" cy="3" r="7" />
      </g>
    </g>
  );
}

function Leaf({
  x,
  y,
  scale = 1,
  rotate = 0,
  fill,
}: {
  x: number;
  y: number;
  scale?: number;
  rotate?: number;
  fill: string;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
      <path d="M0-14Q11-3 0 14Q-11-3 0-14Z" fill={fill} />
      <path d="M0-11V18" stroke="#6a3410" strokeWidth="1.5" />
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
      <g className="seasonal-set seasonal-set--newyear">
        <Burst x={507} y={70} r={42} color="#f2d27a" />
        <Burst x={438} y={42} r={22} color="#ff8fc0" />
        <Burst x={560} y={128} r={18} color="#7fd6ff" />
        <path d="M0 18Q75 46 150 16T300 14" stroke="#f2d27a" strokeWidth="2" opacity=".35" />
        <path d="M60 0V46" stroke="#cfcde6" strokeWidth="1.5" opacity=".6" />
        <circle cx="60" cy="62" r="16" fill="#c9ced8" />
        <path
          d="M44 62h32M46 54h28M46 70h28M60 46v32M52 47q-4 15 0 30M68 47q4 15 0 30"
          stroke="#4a5060"
          strokeWidth="1"
          opacity=".7"
        />
        {[
          [40, 220, "#f2d27a"],
          [72, 236, "#ff8fc0"],
          [104, 214, "#7fd6ff"],
          [500, 228, "#9be38a"],
          [532, 214, "#f2d27a"],
          [566, 238, "#ff8fc0"],
        ].map(([x, y, c], i) => (
          <rect
            key={i}
            x={x as number}
            y={y as number}
            width="9"
            height="5"
            fill={c as string}
            transform={`rotate(${i * 40} ${x} ${y})`}
          />
        ))}
      </g>
      <g className="seasonal-set seasonal-set--valentines">
        <circle cx="507" cy="82" r="56" fill="#ff8fab" opacity=".06" />
        <Heart x={507} y={78} scale={3.6} fill="#e23f6c" />
        <Heart x={498} y={70} scale={1} fill="#ffc2cf" />
        <path d="M110 0Q300 46 470 0" stroke="#a0607a" strokeWidth="2" />
        {[150, 200, 250, 300, 350, 400].map((x, i) => (
          <Heart
            key={x}
            x={x}
            y={i < 3 ? 14 + i * 5 : 24 - (i - 3) * 5}
            scale={0.8}
            fill={i % 2 ? "#ffc2cf" : "#ff6f91"}
          />
        ))}
        <g>
          <path d="M60 240V188M80 240V196" stroke="#3f7a4c" strokeWidth="3" />
          <path d="M60 210q-14-6-18 4 12 4 18-4Zm20 6q14-6 18 4-12 4-18-4Z" fill="#4f9a5c" />
          <circle cx="60" cy="182" r="13" fill="#c2184a" />
          <circle cx="80" cy="190" r="11" fill="#e23f6c" />
          <path
            d="M55 180q5-7 10 0-5 5-10 0Zm20 9q5-6 10 0-5 4-10 0"
            stroke="#7a0f2e"
            strokeWidth="1.5"
            fill="none"
          />
        </g>
        <Heart x={548} y={222} scale={1.4} fill="#ff6f91" />
        <Heart x={570} y={200} scale={0.8} fill="#ffc2cf" />
      </g>
      <g className="seasonal-set seasonal-set--stpatricks">
        {["#ff6b6b", "#ffb347", "#ffe066", "#7ee08a", "#6fb7ff", "#a78bfa"].map((c, i) => (
          <path
            key={c}
            d={`M${420 + i * 6} 150A${90 - i * 6} ${90 - i * 6} 0 0 1 ${600 - i * 6} 150`}
            stroke={c}
            strokeWidth="5"
            opacity=".55"
          />
        ))}
        <g>
          <ellipse cx="545" cy="236" rx="32" ry="8" fill="#080813" opacity=".4" />
          <path d="M515 206q-2 30 12 34h36q14-4 12-34Z" fill="#2a2e33" />
          <ellipse cx="545" cy="206" rx="31" ry="6" fill="#3a3f46" />
          <path d="M518 205q6-14 27-15 21 1 27 15Z" fill="#f6c533" />
          <ellipse cx="535" cy="196" rx="6" ry="4" fill="#ffe08a" />
          <ellipse cx="552" cy="194" rx="6" ry="4" fill="#ffe08a" />
        </g>
        <Shamrock x={48} y={206} scale={1.2} />
        <Shamrock x={86} y={222} scale={0.8} />
        <Shamrock x={120} y={50} scale={0.6} />
        <circle cx="70" cy="40" r="5" fill="#f6c533" />
        <circle cx="160" cy="30" r="4" fill="#f6c533" opacity=".7" />
      </g>
      <g className="seasonal-set seasonal-set--thanksgiving">
        <circle cx="507" cy="80" r="58" fill="#ffb366" opacity=".06" />
        <circle cx="507" cy="80" r="42" fill="#e8913a" opacity=".85" />
        <circle cx="494" cy="68" r="8" fill="#c06a22" opacity=".35" />
        <circle cx="520" cy="96" r="6" fill="#c06a22" opacity=".3" />
        <Leaf x={120} y={40} rotate={-30} fill="#e8742a" />
        <Leaf x={200} y={70} rotate={40} scale={0.8} fill="#c94a1c" />
        <Leaf x={574} y={172} rotate={-60} scale={0.7} fill="#f2b23c" />
        <Leaf x={440} y={120} rotate={20} scale={0.9} fill="#e8742a" />
        <g stroke="#d6a25e" strokeWidth="2.5">
          {[-14, 0, 14].map((lean) => (
            <g key={lean} transform={`rotate(${lean} 60 244)`}>
              <path d="M60 244V170" />
              {[0, 1, 2, 3].map((i) => (
                <ellipse
                  key={i}
                  cx="60"
                  cy={176 + i * 9}
                  rx="4"
                  ry="7"
                  fill="#e9c27a"
                  stroke="none"
                />
              ))}
            </g>
          ))}
        </g>
        <g>
          <ellipse cx="530" cy="232" rx="22" ry="15" fill="#e07a2a" />
          <ellipse cx="530" cy="232" rx="9" ry="15" fill="#f09040" />
          <path d="M530 217q0-8 5-10" stroke="#5a6e2a" strokeWidth="3" />
          <ellipse cx="566" cy="238" rx="14" ry="10" fill="#d0691e" />
          <path d="M566 228q0-6 4-7" stroke="#5a6e2a" strokeWidth="2.5" />
        </g>
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
      <span className="seasonal-name seasonal-name--newyear">{t("seasonal.name.newyear")}</span>
      <span className="seasonal-name seasonal-name--valentines">
        {t("seasonal.name.valentines")}
      </span>
      <span className="seasonal-name seasonal-name--stpatricks">
        {t("seasonal.name.stpatricks")}
      </span>
      <span className="seasonal-name seasonal-name--thanksgiving">
        {t("seasonal.name.thanksgiving")}
      </span>
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
      <g className="seasonal-set seasonal-set--newyear">
        <Burst x={50} y={60} r={26} color="#f2d27a" />
        <Burst x={345} y={45} r={30} color="#ff8fc0" />
        <Burst x={310} y={120} r={16} color="#7fd6ff" />
      </g>
      <g className="seasonal-set seasonal-set--valentines">
        <Heart x={46} y={72} scale={2} fill="#ff6f91" />
        <Heart x={340} y={44} scale={2.4} fill="#e23f6c" />
        <Heart x={306} y={118} scale={1.2} fill="#ffc2cf" />
      </g>
      <g className="seasonal-set seasonal-set--stpatricks">
        <Shamrock x={46} y={60} />
        <Shamrock x={342} y={36} scale={1.2} />
        <circle cx="306" cy="118" r="8" fill="#f6c533" />
        <circle cx="70" cy="118" r="6" fill="#f6c533" />
      </g>
      <g className="seasonal-set seasonal-set--thanksgiving">
        <Leaf x={46} y={70} rotate={-30} scale={1.3} fill="#e8742a" />
        <Leaf x={340} y={44} rotate={30} scale={1.5} fill="#c94a1c" />
        <Leaf x={306} y={120} rotate={70} fill="#f2b23c" />
      </g>
    </svg>
  );
}
