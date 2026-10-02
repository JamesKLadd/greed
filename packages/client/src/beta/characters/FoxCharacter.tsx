import { FoxHead, FOX_PALETTE } from "./FoxArtwork.js";
import type { CharacterView } from "./manifest.js";

/** Fox pilot stays on the existing 180 × 240 composition, with the same seated feet and center. */
export function FoxCharacter({ view }: { view: CharacterView }) {
  const p = FOX_PALETTE;
  const side = view === "side";
  const back = view === "back";
  return (
    <g
      fill="none"
      stroke={p.ink}
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      data-character="fox"
      data-view={view}
      data-character-art="fox-pilot"
    >
      <ellipse cx="91" cy="227" rx="57" ry="8" fill="#061b20" opacity=".22" stroke="none" />
      {side ? (
        <>
          <path
            d="M112 187Q145 189 153 165Q159 145 149 129L134 147L128 143Q127 166 108 170Z"
            fill={p.fur}
          />
          <path
            d="M149 129Q157 144 154 157L143 152L137 160L134 147Z"
            fill={p.cream}
            stroke="none"
          />
          <path d="M74 168L115 173L111 193L76 195L61 217L42 208L52 183Z" fill="#2b4543" />
          <path d="M48 205Q33 207 29 219Q30 226 45 225H66L65 213Z" fill={p.ink} />
          <path d="M91 174L103 211L79 216L66 180" fill="#3c5850" />
          <path d="M83 208Q68 210 64 222Q68 229 87 227H109L107 213Z" fill={p.ink} />
          <path d="M74 105Q103 98 120 121L127 176Q104 190 66 177L62 133Z" fill={p.coat} />
          <path d="M77 109L66 144L88 126" fill={p.cream} />
          <path d="M77 110L69 136L77 138L71 157" stroke={p.gold} strokeWidth="3" />
          <path d="M82 116L74 123L83 130L87 122Z" fill={p.gold} stroke="none" />
          <path d="M105 124Q116 137 101 153L66 162L58 146L85 138" fill={p.coatShade} />
          <path d="M67 145L72 160" stroke={p.gold} strokeWidth="3" />
          <path d="M62 145Q49 141 38 149Q31 154 39 160Q51 166 63 158Z" fill={p.fur} />
          <path d="M41 153L47 156M47 150L53 154" stroke={p.shade} strokeWidth="2" />
          <path d="M97 114Q109 118 117 137" stroke="#32947c" strokeWidth="4" />
          <path d="M99 117L103 111L107 117L103 123Z" fill={p.gold} stroke="none" />
          <FoxHead view="side" />
        </>
      ) : (
        <>
          <path
            d="M116 189Q147 190 155 163L151 144L136 160L128 156Q135 174 109 173Z"
            fill={p.fur}
          />
          <path
            d="M151 144L155 160L145 165L140 160L136 165L136 160Z"
            fill={p.cream}
            stroke="none"
          />
          <path
            d="M51 166Q37 186 53 208L74 217L91 184L108 217L129 208Q144 187 130 166Z"
            fill="#2b4543"
          />
          <path d="M56 205Q40 210 43 223Q59 231 78 221L76 209Z" fill={p.ink} />
          <path d="M105 209L103 221Q124 230 138 222Q139 211 123 205Z" fill={p.ink} />
          <path
            d="M61 107Q89 99 119 107Q135 132 133 178Q91 189 48 178Q44 135 61 107Z"
            fill={p.coat}
          />
          <path
            d="M61 112Q42 111 34 137L31 157L50 164L63 131M118 112Q137 111 145 137L148 157L129 164L116 131"
            fill={p.coatShade}
          />
          <path d="M33 148L53 155M127 155L146 148" stroke={p.gold} strokeWidth="3" />
          <path d="M32 153Q40 149 49 157L51 166Q39 174 30 166Z" fill={p.fur} />
          <path d="M130 157Q139 149 147 153L149 166Q140 174 128 166Z" fill={p.fur} />
          {back ? (
            <>
              <path d="M66 115Q90 126 114 115" stroke={p.gold} strokeWidth="4" />
              <path d="M91 126V177M60 171Q90 179 121 171" stroke={p.coatShade} strokeWidth="3" />
              <path d="M79 143L91 132L103 143L91 155Z" fill={p.gold} stroke="none" />
              <path d="M84 143L91 137L98 143L91 150Z" fill={p.coatShade} stroke="none" />
            </>
          ) : (
            <>
              <path d="M68 112L91 159L113 112" fill={p.cream} />
              <path
                d="M67 115L73 137L81 136L91 158L101 136L109 137L115 115"
                stroke={p.gold}
                strokeWidth="3"
              />
              <path
                d="M76 122L91 128L76 135ZM106 122L91 128L106 135Z"
                fill={p.gold}
                stroke="none"
              />
              <circle cx="91" cy="128" r="3.5" fill={p.cream} stroke="none" />
              <circle cx="91" cy="168" r="3" fill={p.gold} stroke="none" />
              <path d="M111 150H121" stroke={p.gold} strokeWidth="3" />
              <path d="M118 121L122 115L126 121L122 127Z" fill={p.gold} stroke="none" />
            </>
          )}
          <FoxHead view={back ? "back" : "front"} />
        </>
      )}
    </g>
  );
}
