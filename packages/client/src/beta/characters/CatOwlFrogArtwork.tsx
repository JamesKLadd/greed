import type { CharacterView } from "./manifest.js";

const INK = "#182c2a";
const GOLD = "#edc36c";
const CREAM = "#fff0ce";
const CAT = {
  fur: "#b9a4d6",
  light: "#deccec",
  shade: "#806296",
  ear: "#c880a8",
  coat: "#604276",
  coatShade: "#423050",
  accent: "#83d3bd",
};
const OWL = {
  fur: "#c69b65",
  light: "#e6bd87",
  shade: "#946645",
  coat: "#315b7a",
  coatShade: "#213e56",
  accent: "#719bc0",
};
const FROG = {
  skin: "#78c89b",
  light: "#c6e8b8",
  shade: "#3e8b6a",
  coat: "#cf725e",
  coatShade: "#9b4c43",
  accent: "#f0aa78",
};

/** Shared faces keep each portrait and seated view recognizably the same character. */
function CatHead({ view = "front" }: { view?: CharacterView }) {
  const p = CAT;
  return (
    <g stroke={INK} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      {view === "side" ? (
        <>
          <path d="M81 53L111 16L122 61Z" fill={p.shade} />
          <path d="M45 62L45 14L79 47Z" fill={p.fur} />
          <path d="M51 46L52 28L67 46Z" fill={p.ear} stroke="none" />
          <path
            d="M113 61Q109 42 82 43L71 38L68 45L55 44Q43 55 43 72L30 82L30 92L44 101L51 111L70 115L93 109Q118 108 119 85Z"
            fill={p.fur}
          />
          <path d="M31 84L54 79L68 96L87 99L70 111L52 107L43 96Z" fill={p.light} stroke="none" />
          <path d="M51 67Q60 60 70 68L60 77L49 74Z" fill={CREAM} strokeWidth="2" />
          <ellipse cx="57" cy="70" rx="3.5" ry="6" fill={INK} stroke="none" />
          <circle cx="56" cy="68" r="1.3" fill="white" stroke="none" />
          <path d="M47 56L62 52" strokeWidth="4" />
          <path d="M28 82L38 85L31 91Z" fill={p.coatShade} strokeWidth="2" />
          <path d="M34 91L36 96Q47 104 58 96" fill="none" strokeWidth="2.5" />
          <path d="M37 89L22 84M39 96L22 98" fill="none" stroke={CREAM} strokeWidth="3" />
          <path d="M82 50L91 57M91 47L99 55" fill="none" stroke={p.shade} strokeWidth="4" />
        </>
      ) : (
        <>
          <path d="M43 63L37 14L73 41L107 41L144 14L138 65Z" fill={p.fur} />
          {view === "front" ? (
            <path d="M47 45L46 28L63 45ZM119 45L135 28L132 48Z" fill={p.ear} stroke="none" />
          ) : (
            <path d="M44 49L43 30L59 44M123 44L137 30L136 49" fill="none" stroke={p.shade} />
          )}
          <path
            d="M43 59Q47 41 73 40L82 35L89 41L104 38Q132 41 138 61L141 79L149 87L137 92L134 101L119 108L105 107L91 120L76 107L62 110L48 102L44 92L33 86L41 78Z"
            fill={p.fur}
          />
          <path
            d="M78 47L84 55M94 45L96 55M108 48L105 57"
            fill="none"
            stroke={p.shade}
            strokeWidth="4"
          />
          {view === "back" ? (
            <>
              <path d="M69 101L81 109L91 106L103 110L115 102" fill="none" stroke={p.shade} />
              <path d="M70 56Q90 50 110 56" fill="none" stroke={p.light} strokeWidth="5" />
            </>
          ) : (
            <>
              <path
                d="M46 80L69 85L91 96L113 85L138 80L129 99L113 102L91 116L71 103L55 102Z"
                fill={p.light}
                stroke="none"
              />
              <path d="M54 68Q65 58 77 67L73 77Q62 82 54 73Z" fill={CREAM} strokeWidth="2" />
              <path d="M104 67Q117 58 127 68L125 75Q115 82 108 76Z" fill={CREAM} strokeWidth="2" />
              <g fill={INK} stroke="none">
                <ellipse cx="66" cy="70" rx="3.8" ry="6.5" />
                <ellipse cx="116" cy="70" rx="3.8" ry="6.5" />
              </g>
              <g fill="white" stroke="none">
                <circle cx="65" cy="68" r="1.4" />
                <circle cx="115" cy="68" r="1.4" />
              </g>
              <path d="M54 57L73 54M109 54L126 59" fill="none" strokeWidth="4" />
              <path d="M83 87L99 87L91 95Z" fill={p.coatShade} strokeWidth="2" />
              <path d="M91 95V99M75 101Q91 110 108 98" fill="none" strokeWidth="2.5" />
              <path
                d="M34 82L57 86M34 98L57 94M123 86L147 82M123 94L147 98"
                fill="none"
                stroke={CREAM}
                strokeWidth="3"
              />
            </>
          )}
        </>
      )}
    </g>
  );
}

function OwlHead({ view = "front" }: { view?: CharacterView }) {
  const p = OWL;
  return (
    <g stroke={INK} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      {view === "side" ? (
        <>
          <path d="M87 47L117 22L119 57Z" fill={p.shade} />
          <path
            d="M47 60L44 20L73 44L96 40Q117 44 124 66L121 92Q109 116 82 118Q46 112 38 86L40 68Z"
            fill={p.fur}
          />
          <path d="M47 39L57 48" fill="none" stroke={p.light} strokeWidth="5" />
          <path d="M43 59Q67 41 84 65Q88 89 65 105Q41 96 39 78Z" fill={CREAM} strokeWidth="2" />
          <path d="M49 65Q58 59 68 65" fill="none" stroke={p.shade} strokeWidth="4" />
          <ellipse cx="55" cy="73" rx="5" ry="9" fill={INK} stroke="none" />
          <circle cx="53" cy="70" r="1.8" fill="white" stroke="none" />
          <path d="M41 82L24 90L43 100L50 91Z" fill={GOLD} strokeWidth="2.5" />
          <path
            d="M97 54L105 64M102 76L110 82M91 95L98 101"
            fill="none"
            stroke={p.shade}
            strokeWidth="3"
          />
          <path d="M55 102L62 106L70 102" fill="none" stroke={p.shade} strokeWidth="2.5" />
        </>
      ) : (
        <>
          <path d="M42 61L35 19L68 40L113 40L146 19L139 64Z" fill={p.fur} />
          <path
            d="M46 44L45 32L61 45M120 45L136 32L134 45"
            fill="none"
            stroke={p.light}
            strokeWidth="5"
          />
          <path
            d="M42 55Q59 38 90 40Q122 38 139 55Q147 77 133 98L113 115L91 122L69 115L49 98Q34 76 42 55Z"
            fill={p.fur}
          />
          {view === "back" ? (
            <>
              <path
                d="M62 57L69 65M83 51L88 60M106 52L102 62M122 59L115 67"
                fill="none"
                stroke={p.shade}
                strokeWidth="4"
              />
              <path d="M62 92L70 100L78 94M103 95L111 101L120 93" fill="none" stroke={p.shade} />
              <path
                d="M75 111L82 114L91 111L100 114L107 111"
                fill="none"
                stroke={p.light}
                strokeWidth="4"
              />
            </>
          ) : (
            <>
              <path
                d="M91 61Q72 43 54 57Q40 70 49 91Q57 106 76 109L91 100L106 109Q125 106 133 91Q142 70 128 57Q110 43 91 61Z"
                fill={CREAM}
                strokeWidth="2"
              />
              <path
                d="M53 61Q66 53 77 61M104 61Q117 53 130 62"
                fill="none"
                stroke={p.shade}
                strokeWidth="4"
              />
              <g fill={INK} stroke="none">
                <ellipse cx="67" cy="76" rx="6" ry="10" />
                <ellipse cx="115" cy="76" rx="6" ry="10" />
              </g>
              <g fill="white" stroke="none">
                <circle cx="65" cy="73" r="2" />
                <circle cx="113" cy="73" r="2" />
              </g>
              <path d="M91 80L102 89L91 105L80 89Z" fill={GOLD} strokeWidth="2.5" />
              <path d="M81 89H101" fill="none" stroke={p.shade} strokeWidth="2" />
              <path
                d="M58 94Q65 98 72 94M108 94Q115 98 122 94"
                fill="none"
                stroke={p.shade}
                strokeWidth="2.5"
              />
            </>
          )}
        </>
      )}
    </g>
  );
}

function FrogHead({ view = "front" }: { view?: CharacterView }) {
  const p = FROG;
  return (
    <g stroke={INK} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      {view === "side" ? (
        <>
          <path d="M89 55Q84 31 101 30Q119 31 117 61Z" fill={p.shade} />
          <path
            d="M42 63Q45 45 77 45Q103 40 119 61Q128 89 108 107Q83 121 54 111Q25 106 26 89Q25 75 42 72Z"
            fill={p.skin}
          />
          <path d="M45 71Q40 54 46 38Q52 24 66 28Q82 31 79 58L72 72Z" fill={p.skin} />
          <ellipse cx="60" cy="49" rx="13" ry="18" fill={p.light} stroke="none" />
          <ellipse cx="56" cy="49" rx="5" ry="9" fill={INK} stroke="none" />
          <circle cx="54" cy="46" r="1.7" fill="white" stroke="none" />
          <path d="M32 90Q49 110 79 98Q96 90 102 83" fill="none" strokeWidth="3" />
          <path d="M31 82L38 82M100 83L108 86" fill="none" stroke={p.shade} strokeWidth="2.5" />
          <path d="M40 98Q57 112 79 104L74 114L54 112Z" fill={p.light} stroke="none" />
          <circle cx="104" cy="64" r="3" fill={p.shade} stroke="none" />
          <circle cx="113" cy="75" r="2.5" fill={p.shade} stroke="none" />
        </>
      ) : (
        <>
          <path
            d="M39 66Q42 42 91 45Q140 41 144 65Q158 100 129 111Q111 120 91 121Q69 120 50 110Q25 98 39 66Z"
            fill={p.skin}
          />
          <path
            d="M39 64Q32 46 40 32Q48 20 62 25Q79 30 78 61M104 61Q102 31 119 25Q134 20 143 33Q151 48 143 64"
            fill={p.skin}
          />
          {view === "back" ? (
            <>
              <path
                d="M46 39Q58 29 67 42M115 42Q126 29 136 40"
                fill="none"
                stroke={p.light}
                strokeWidth="5"
              />
              <g fill={p.shade} stroke="none">
                <circle cx="72" cy="72" r="4" />
                <circle cx="108" cy="72" r="4" />
                <circle cx="90" cy="86" r="5" />
                <circle cx="58" cy="92" r="3" />
                <circle cx="122" cy="92" r="3" />
              </g>
              <path d="M70 109Q91 115 113 109" fill="none" stroke={p.light} strokeWidth="4" />
            </>
          ) : (
            <>
              <g fill={p.light} stroke="none">
                <ellipse cx="58" cy="46" rx="15" ry="20" />
                <ellipse cx="124" cy="46" rx="15" ry="20" />
              </g>
              <g fill={INK} stroke="none">
                <ellipse cx="59" cy="48" rx="5.5" ry="9" />
                <ellipse cx="123" cy="48" rx="5.5" ry="9" />
              </g>
              <g fill="white" stroke="none">
                <circle cx="57" cy="45" r="1.8" />
                <circle cx="121" cy="45" r="1.8" />
              </g>
              <path
                d="M45 33Q57 26 69 34M112 34Q124 26 137 34"
                fill="none"
                stroke={p.shade}
                strokeWidth="3"
              />
              <path d="M47 88Q91 125 135 88L128 105Q91 128 55 105Z" fill={p.light} stroke="none" />
              <path d="M45 88Q91 121 137 88" fill="none" strokeWidth="3" />
              <path d="M43 85L49 85M133 85L139 85" fill="none" stroke={p.shade} strokeWidth="2.5" />
              <g fill={p.shade} stroke="none">
                <circle cx="81" cy="74" r="2.5" />
                <circle cx="101" cy="74" r="2.5" />
                <circle cx="49" cy="76" r="3" />
                <circle cx="134" cy="76" r="3" />
              </g>
            </>
          )}
        </>
      )}
    </g>
  );
}

/** Each drawing stays on the established 180 × 240 seated composition. */
export function CatCharacter({ view }: { view: CharacterView }) {
  const p = CAT;
  const side = view === "side";
  const back = view === "back";
  return (
    <g
      fill="none"
      stroke={INK}
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      data-character="cat"
      data-view={view}
      data-character-art="cast-polish"
    >
      <ellipse cx="91" cy="227" rx="57" ry="8" fill="#061b20" opacity=".22" stroke="none" />
      {side ? (
        <>
          <path
            d="M117 184Q151 185 152 159Q151 140 143 141Q137 143 140 155Q145 174 114 170Z"
            fill={p.fur}
          />
          <path d="M140 155L151 159M142 165L149 171" stroke={p.shade} strokeWidth="4" />
          <path d="M74 169L116 173L112 194L77 195L60 216L42 208L54 182Z" fill={p.coatShade} />
          <path d="M49 205Q33 208 29 219Q31 227 45 225H66L65 214Z" fill={INK} />
          <path d="M92 175L103 211L80 216L67 180" fill="#5b4866" />
          <path d="M84 209Q69 210 64 222Q68 229 87 227H109L107 214Z" fill={INK} />
          <path d="M75 105Q104 99 121 122L127 176Q103 190 65 177L62 135Z" fill={p.coat} />
          <path d="M77 111L67 143L88 126" fill={CREAM} />
          <path d="M77 112L70 135L79 138L72 157" stroke={GOLD} strokeWidth="3" />
          <path d="M77 119L69 125L80 132L84 124Z" fill={p.accent} stroke="none" />
          <path d="M104 124Q115 138 100 153L65 162L58 146L85 138" fill={p.coatShade} />
          <path d="M66 146L71 160" stroke={GOLD} strokeWidth="3" />
          <path d="M62 145Q49 141 39 149Q31 154 39 160Q51 167 63 158Z" fill={p.fur} />
          <path d="M42 152L48 156M49 150L54 154" stroke={p.shade} strokeWidth="2" />
          <path d="M98 114Q111 121 116 137" stroke="#8e69a4" strokeWidth="4" />
          <CatHead view="side" />
        </>
      ) : (
        <>
          <path
            d="M115 188Q151 189 154 165Q154 145 145 145Q138 147 142 160Q145 178 112 174Z"
            fill={p.fur}
          />
          <path d="M142 160L154 164M141 171L150 177" stroke={p.shade} strokeWidth="4" />
          <path
            d="M51 167Q36 187 53 208L74 217L91 184L108 217L130 208Q145 186 131 167Z"
            fill={p.coatShade}
          />
          <path d="M56 205Q40 210 43 223Q59 231 78 221L76 209Z" fill={INK} />
          <path d="M105 209L103 221Q124 230 138 222Q139 211 123 205Z" fill={INK} />
          <path
            d="M61 107Q91 99 119 107Q135 135 132 178Q91 188 49 178Q46 135 61 107Z"
            fill={p.coat}
          />
          <path
            d="M60 112Q43 114 35 138L32 157L51 164L64 130M120 112Q137 114 145 138L148 157L129 164L116 130"
            fill={p.coatShade}
          />
          <path d="M33 148L53 155M127 155L147 148" stroke={GOLD} strokeWidth="3" />
          <path d="M32 153Q40 149 49 157L51 166Q39 174 30 166Z" fill={p.fur} />
          <path d="M130 157Q139 149 147 153L149 166Q140 174 128 166Z" fill={p.fur} />
          {back ? (
            <>
              <path d="M66 115Q91 127 115 115" stroke={GOLD} strokeWidth="4" />
              <path d="M91 127V177M62 170Q91 178 121 170" stroke={p.coatShade} strokeWidth="3" />
              <path d="M80 142L91 135L102 142L98 157H84Z" fill={p.accent} stroke="none" />
              <path d="M86 143L91 149L96 143" stroke={p.coatShade} strokeWidth="2.5" />
            </>
          ) : (
            <>
              <path d="M68 112L91 158L113 112" fill={CREAM} />
              <path
                d="M67 115L73 136L82 136L91 157L101 136L109 136L115 115"
                stroke={GOLD}
                strokeWidth="3"
              />
              <path
                d="M76 122L91 128L76 135ZM106 122L91 128L106 135Z"
                fill={p.accent}
                stroke="none"
              />
              <circle cx="91" cy="128" r="3.5" fill={CREAM} stroke="none" />
              <circle cx="91" cy="168" r="3" fill={GOLD} stroke="none" />
              <path d="M111 150H121" stroke={GOLD} strokeWidth="3" />
            </>
          )}
          <CatHead view={back ? "back" : "front"} />
        </>
      )}
    </g>
  );
}

export function OwlCharacter({ view }: { view: CharacterView }) {
  const p = OWL;
  const side = view === "side";
  const back = view === "back";
  return (
    <g
      fill="none"
      stroke={INK}
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      data-character="owl"
      data-view={view}
      data-character-art="cast-polish"
    >
      <ellipse cx="91" cy="227" rx="57" ry="8" fill="#061b20" opacity=".22" stroke="none" />
      {side ? (
        <>
          <path d="M107 171L137 179L132 198L113 188L113 201L95 189Z" fill={p.shade} />
          <path d="M74 168L116 171L112 194L77 195L61 216L42 208L54 184Z" fill={p.coatShade} />
          <path d="M47 209L35 215L29 224L45 221L54 226L59 218L68 216L65 209Z" fill={GOLD} />
          <path d="M93 176L104 211L81 217L68 181" fill="#3f5870" />
          <path d="M82 211L71 217L65 225L82 221L91 228L95 220L109 220L106 212Z" fill={GOLD} />
          <path d="M76 106Q107 99 123 123L127 176Q106 190 65 177L62 135Z" fill={p.coat} />
          <path d="M77 112L68 143L88 126" fill={CREAM} />
          <path d="M78 113L71 135L81 138L75 156" stroke={GOLD} strokeWidth="3" />
          <path d="M77 121L70 126L80 133L85 126Z" fill={GOLD} stroke="none" />
          <path
            d="M107 123Q119 139 102 153L65 164L55 161L39 154L43 148L39 143L57 142L87 136Z"
            fill={p.coatShade}
          />
          <path d="M64 146L70 160" stroke={GOLD} strokeWidth="3" />
          <path d="M61 148L51 152L45 149M59 155L50 157" stroke={p.accent} strokeWidth="3" />
          <path d="M99 113Q114 121 117 135" stroke={p.accent} strokeWidth="4" />
          <OwlHead view="side" />
        </>
      ) : (
        <>
          <path d="M73 173L78 194L89 186L98 198L110 173Z" fill={p.shade} />
          <path
            d="M52 166Q36 187 54 208L75 217L91 184L108 217L130 208Q146 187 131 166Z"
            fill={p.coatShade}
          />
          <path d="M56 208L45 217L40 225L56 222L65 228L70 219L79 218L75 208Z" fill={GOLD} />
          <path d="M107 208L103 218L112 219L117 228L126 222L141 225L136 216L123 208Z" fill={GOLD} />
          <path
            d="M61 107Q91 99 120 107Q138 135 133 177Q91 190 48 177Q44 135 61 107Z"
            fill={p.coat}
          />
          <path
            d="M60 113Q42 112 35 131L28 153L36 161L30 165L40 170L36 175Q57 178 66 155L68 129M121 113Q138 112 146 131L154 153L146 161L152 165L142 170L146 175Q125 178 116 155L113 129"
            fill={p.coatShade}
          />
          <path d="M35 143L53 150M128 150L147 143" stroke={GOLD} strokeWidth="3" />
          <path
            d="M40 154L47 159L40 165M142 154L135 159L142 165"
            stroke={p.accent}
            strokeWidth="3"
          />
          {back ? (
            <>
              <path d="M66 115Q91 128 115 115" stroke={GOLD} strokeWidth="4" />
              <path d="M91 128V174M64 171Q91 179 119 171" stroke={p.coatShade} strokeWidth="3" />
              <path
                d="M74 143L81 148L91 141L101 148L108 143L106 155L91 163L76 155Z"
                fill={GOLD}
                stroke="none"
              />
              <path d="M83 154L91 150L99 154" stroke={p.coatShade} strokeWidth="2.5" />
            </>
          ) : (
            <>
              <path d="M68 113L91 157L113 113" fill={CREAM} />
              <path
                d="M67 115L74 137L82 136L91 156L100 136L109 137L115 115"
                stroke={GOLD}
                strokeWidth="3"
              />
              <path d="M76 123L91 130L76 137ZM106 123L91 130L106 137Z" fill={GOLD} stroke="none" />
              <circle cx="91" cy="130" r="3.5" fill={p.coatShade} stroke="none" />
              <circle cx="91" cy="167" r="3" fill={GOLD} stroke="none" />
              <path d="M111 150H122" stroke={GOLD} strokeWidth="3" />
            </>
          )}
          <OwlHead view={back ? "back" : "front"} />
        </>
      )}
    </g>
  );
}

export function FrogCharacter({ view }: { view: CharacterView }) {
  const p = FROG;
  const side = view === "side";
  const back = view === "back";
  return (
    <g
      fill="none"
      stroke={INK}
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      data-character="frog"
      data-view={view}
      data-character-art="cast-polish"
    >
      <ellipse cx="91" cy="227" rx="57" ry="8" fill="#061b20" opacity=".22" stroke="none" />
      {side ? (
        <>
          <path d="M76 167L117 175L112 196L77 195L63 216L43 209L51 185Z" fill="#3b5951" />
          <path
            d="M48 206L35 212L28 220L38 220L40 226L51 222L59 227L69 218L64 209Z"
            fill={p.skin}
          />
          <path d="M93 176L105 211L81 217L69 181" fill="#4e6e5d" />
          <path
            d="M84 211L70 217L65 225L76 224L80 229L89 224L98 228L111 220L108 213Z"
            fill={p.skin}
          />
          <path d="M76 105Q105 101 120 121L125 176Q103 188 67 177L64 134Z" fill={CREAM} />
          <path
            d="M85 111L95 149L88 179L67 177L65 135L74 113ZM102 111Q121 118 124 143L125 176L99 181L100 151L94 123Z"
            fill={p.coat}
          />
          <path d="M84 112L94 150L88 176" stroke={GOLD} strokeWidth="3" />
          <path d="M78 123L69 128L80 135L85 128Z" fill={p.coatShade} stroke="none" />
          <path d="M103 128Q115 139 100 151L66 160L59 146L86 138" fill={p.light} />
          <path
            d="M62 146L47 142L39 146L42 150L33 153L40 159L48 158L55 164L65 157Z"
            fill={p.skin}
          />
          <path d="M44 151L51 154M49 147L55 151" stroke={p.shade} strokeWidth="2" />
          <path d="M104 114L113 126" stroke={p.accent} strokeWidth="4" />
          <circle cx="104" cy="164" r="3" fill={GOLD} stroke="none" />
          <FrogHead view="side" />
        </>
      ) : (
        <>
          <path
            d="M54 165Q36 185 52 207L75 217L91 185L107 217L130 207Q146 185 130 165Z"
            fill="#3b5951"
          />
          <path
            d="M55 206L42 215L38 223L49 221L54 227L63 223L72 228L81 217L76 208Z"
            fill={p.skin}
          />
          <path
            d="M106 208L101 217L110 228L119 223L128 227L133 221L144 223L140 215L126 206Z"
            fill={p.skin}
          />
          <path
            d="M64 108Q91 102 117 108Q131 134 129 177Q91 188 53 177Q50 135 64 108Z"
            fill={CREAM}
          />
          <path
            d="M63 113Q45 114 39 135L35 154L55 162L66 134M119 113Q137 114 143 135L147 154L127 162L116 134"
            fill={p.light}
          />
          <path
            d="M35 152L27 155L30 161L26 165L36 169L43 167L49 173L57 165L54 156ZM147 152L155 155L152 161L156 165L146 169L139 167L133 173L125 165L128 156Z"
            fill={p.skin}
          />
          <path d="M34 160L41 163M148 160L141 163" stroke={p.shade} strokeWidth="2.5" />
          {back ? (
            <>
              <path d="M65 110Q91 119 116 110L130 178Q91 189 52 178Z" fill={p.coat} />
              <path d="M68 116Q91 127 113 116" stroke={GOLD} strokeWidth="4" />
              <path d="M91 129V177M63 171Q91 180 119 171" stroke={p.coatShade} strokeWidth="3" />
              <path d="M91 136L103 146L99 157H83L79 146Z" fill={GOLD} stroke="none" />
              <path d="M84 146Q91 152 98 146" stroke={p.coatShade} strokeWidth="2.5" />
            </>
          ) : (
            <>
              <path
                d="M65 112L78 116L91 150L90 181L53 176ZM116 112L103 116L91 150L92 181L130 176Z"
                fill={p.coat}
              />
              <path d="M76 117L91 151V178L104 117" stroke={GOLD} strokeWidth="3" />
              <path
                d="M77 125L91 132L77 139ZM105 125L91 132L105 139Z"
                fill={p.coatShade}
                stroke="none"
              />
              <circle cx="91" cy="132" r="3.5" fill={GOLD} stroke="none" />
              <circle cx="91" cy="166" r="3" fill={GOLD} stroke="none" />
              <path d="M110 152H120" stroke={p.accent} strokeWidth="3" />
            </>
          )}
          <FrogHead view={back ? "back" : "front"} />
        </>
      )}
    </g>
  );
}

export function CatPortraitArtwork() {
  return (
    <g>
      <path
        d="M18 100Q18 78 37 68L64 68Q82 78 83 100"
        fill={CAT.coat}
        stroke={INK}
        strokeWidth="2"
      />
      <path d="M37 70L50 97L64 70" fill={CREAM} />
      <path
        d="M36 78L39 91L45 89L50 98L55 89L61 91L65 78"
        fill="none"
        stroke={GOLD}
        strokeWidth="2"
      />
      <path d="M41 80L50 85L41 89ZM59 80L50 85L59 89Z" fill={CAT.accent} />
      <circle cx="50" cy="85" r="2" fill={CREAM} />
      <g transform="translate(-5 -4) scale(.61)">
        <CatHead />
      </g>
    </g>
  );
}

export function OwlPortraitArtwork() {
  return (
    <g>
      <path
        d="M18 100Q18 78 37 68L64 68Q82 78 83 100"
        fill={OWL.coat}
        stroke={INK}
        strokeWidth="2"
      />
      <path d="M37 70L50 97L64 70" fill={CREAM} />
      <path
        d="M36 78L39 91L45 89L50 98L55 89L61 91L65 78"
        fill="none"
        stroke={GOLD}
        strokeWidth="2"
      />
      <path d="M41 81L50 86L41 90ZM59 81L50 86L59 90Z" fill={GOLD} />
      <circle cx="50" cy="86" r="2" fill={OWL.coatShade} />
      <g transform="translate(-5 -4) scale(.61)">
        <OwlHead />
      </g>
    </g>
  );
}

export function FrogPortraitArtwork() {
  return (
    <g>
      <path d="M19 100Q18 78 38 68L63 68Q82 78 82 100" fill={CREAM} stroke={INK} strokeWidth="2" />
      <path d="M37 77L43 78L50 95L49 100H21ZM64 77L57 78L50 95L51 100H80Z" fill={FROG.coat} />
      <path d="M42 79L50 96L59 79" fill="none" stroke={GOLD} strokeWidth="2" />
      <path d="M41 83L50 88L41 92ZM59 83L50 88L59 92Z" fill={FROG.coatShade} />
      <circle cx="50" cy="88" r="2" fill={GOLD} />
      <g transform="translate(-5 -4) scale(.61)">
        <FrogHead />
      </g>
    </g>
  );
}
