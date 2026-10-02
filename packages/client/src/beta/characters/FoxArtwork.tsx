/** Shared face and palette keep the profile portrait and seated pilot recognizably the same fox. */
export const FOX_PALETTE = {
  ink: "#182c2a",
  fur: "#f19a45",
  furLight: "#ffbd66",
  shade: "#bc6032",
  cream: "#fff0ce",
  ear: "#dc7958",
  coat: "#176c57",
  coatShade: "#104c40",
  gold: "#edc36c",
};

/** Coordinates share the seated character's 180-wide canvas. A side view faces left. */
export function FoxHead({ view = "front" }: { view?: "front" | "side" | "back" }) {
  const p = FOX_PALETTE;
  return (
    <g stroke={p.ink} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      {view === "side" ? (
        <>
          <path d="M83 56L112 15L122 65Z" fill={p.shade} />
          <path d="M44 64L47 15L79 46Z" fill={p.fur} />
          <path d="M52 47L53 28L66 46Z" fill={p.ear} stroke="none" />
          <path
            d="M112 58Q106 40 80 43L69 36L65 44L54 42Q44 52 43 70L25 81L29 87L25 91L43 100L40 108L52 109L56 119L72 114Q106 120 116 98L123 90L116 84Z"
            fill={p.fur}
          />
          <path
            d="M29 87L57 78L78 101L102 100L89 114L73 115L56 121L52 108L43 103Z"
            fill={p.cream}
            stroke="none"
          />
          <path d="M80 45L98 50L109 65" stroke={p.furLight} strokeWidth="5" />
          <path d="M48 68Q54 60 63 67Q63 78 54 80L48 76Z" fill={p.cream} strokeWidth="2" />
          <ellipse cx="52" cy="71" rx="3.5" ry="6" fill={p.ink} stroke="none" />
          <circle cx="51" cy="69" r="1.3" fill="white" stroke="none" />
          <path d="M46 57L59 54" strokeWidth="4" />
          <path d="M26 82L36 85L28 91L23 87Z" fill={p.ink} strokeWidth="2" />
          <path d="M39 95Q48 103 60 96" strokeWidth="2.5" />
          <path d="M101 80L109 83" stroke={p.shade} strokeWidth="3" />
        </>
      ) : (
        <>
          <path d="M43 65L36 14L73 42L106 42L144 14L138 65Z" fill={p.fur} />
          {view === "front" ? (
            <path d="M47 45L45 29L62 45ZM119 45L135 29L132 48Z" fill={p.ear} stroke="none" />
          ) : (
            <path d="M43 50L42 29L58 44M123 44L138 29L137 50" stroke={p.shade} strokeWidth="4" />
          )}
          <path
            d="M43 58Q49 40 76 40L84 34L88 40L99 35L104 41Q132 39 137 59L141 74L150 80L141 88L145 96L132 97L126 110L112 106L91 122L70 106L56 111L51 98L38 97L42 87L32 80L40 73Z"
            fill={p.fur}
          />
          <path d="M65 49Q88 42 111 50" stroke={p.furLight} strokeWidth="5" />
          {view === "back" ? (
            <>
              <path
                d="M56 96L71 106L80 104L91 115L102 104L113 107L127 96L124 110L110 113L105 122L91 117L77 123L70 113L57 111Z"
                fill={p.cream}
                stroke="none"
              />
              <path d="M68 86L73 95M111 86L106 95" stroke={p.shade} strokeWidth="3" />
            </>
          ) : (
            <>
              <path
                d="M42 77L69 85L91 94L114 84L138 75L133 94L122 103L108 101L91 118L73 102L59 105L49 94Z"
                fill={p.cream}
                stroke="none"
              />
              <path d="M57 68Q65 61 74 67L73 77Q64 82 57 76Z" fill={p.cream} strokeWidth="2" />
              <path
                d="M106 67Q115 61 123 68L122 76Q115 82 107 77Z"
                fill={p.cream}
                strokeWidth="2"
              />
              <g fill={p.ink} stroke="none">
                <ellipse cx="66" cy="71" rx="3.8" ry="6" />
                <ellipse cx="114" cy="71" rx="3.8" ry="6" />
              </g>
              <g fill="white" stroke="none">
                <circle cx="65" cy="69" r="1.4" />
                <circle cx="113" cy="69" r="1.4" />
              </g>
              <path d="M55 57L71 55M108 56L123 60" strokeWidth="4" />
              <path d="M82 86Q91 82 100 86L91 95Z" fill={p.ink} strokeWidth="2" />
              <path d="M91 95V100M74 100Q91 112 107 98" strokeWidth="2.5" />
            </>
          )}
        </>
      )}
    </g>
  );
}

/** Portrait uses the same facial drawing, cropped only by its normal 100 × 100 SVG canvas. */
export function FoxPortraitArtwork() {
  const p = FOX_PALETTE;
  return (
    <g>
      <path
        d="M18 100Q18 78 37 74L64 74Q81 78 83 100"
        fill={p.coat}
        stroke={p.ink}
        strokeWidth="2"
      />
      <path d="M37 76L50 97L64 76" fill={p.cream} />
      <path d="M36 78L39 91L45 89L50 98L55 89L61 91L65 78" stroke={p.gold} strokeWidth="2" />
      <path d="M41 80L50 85L41 89ZM59 80L50 85L59 89Z" fill={p.gold} />
      <circle cx="50" cy="85" r="2" fill={p.cream} />
      <g transform="translate(-5 -4) scale(.61)">
        <FoxHead />
      </g>
    </g>
  );
}
