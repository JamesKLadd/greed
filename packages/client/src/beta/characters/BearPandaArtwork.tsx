import type { CharacterView } from "./manifest.js";

type RoundCharacter = "bear" | "panda";

const PALETTES = {
  bear: {
    ink: "#182c2a",
    fur: "#b77746",
    light: "#d89c65",
    shade: "#805239",
    cream: "#ffebca",
    ear: "#c78c74",
    coat: "#963f46",
    coatShade: "#6d3039",
    trim: "#edc36c",
  },
  panda: {
    ink: "#182c2a",
    fur: "#fff3d9",
    light: "#ffffff",
    shade: "#c8d7cc",
    cream: "#fff3d9",
    ear: "#54706b",
    coat: "#268d91",
    coatShade: "#17676e",
    trim: "#edc36c",
  },
};

/** Portraits and seated views share each face so their identity stays consistent at small sizes. */
function RoundHead({ kind, view = "front" }: { kind: RoundCharacter; view?: CharacterView }) {
  const p = PALETTES[kind];
  const panda = kind === "panda";
  const back = view === "back";
  return (
    <g fill="none" stroke={p.ink} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      {view === "side" ? (
        <>
          <circle
            cx={panda ? "111" : "112"}
            cy="45"
            r={panda ? "18" : "22"}
            fill={panda ? p.ink : p.fur}
          />
          <circle cx="112" cy="45" r={panda ? "9" : "12"} fill={p.ear} stroke="none" />
          <path
            d={
              panda
                ? "M115 54Q107 33 79 37Q50 38 44 66L35 81Q30 105 57 115Q94 128 119 103Q130 83 115 54Z"
                : "M122 53Q111 31 77 36Q45 37 38 67L29 79Q24 109 59 120Q102 133 126 105Q141 82 122 53Z"
            }
            fill={p.fur}
          />
          <path d="M74 45Q94 39 111 56" stroke={p.light} strokeWidth="5" />
          {panda ? (
            <>
              <ellipse
                cx="57"
                cy="73"
                rx="17"
                ry="23"
                transform="rotate(14 57 73)"
                fill={p.ink}
                stroke="none"
              />
              <ellipse cx="52" cy="71" rx="6" ry="9" fill={p.cream} stroke="none" />
              <ellipse cx="50" cy="72" rx="3.4" ry="6" fill={p.ink} stroke="none" />
              <circle cx="49" cy="70" r="1.3" fill="white" stroke="none" />
              <path
                d="M39 85Q48 80 59 85Q69 92 59 108Q43 111 35 100Z"
                fill={p.cream}
                stroke="none"
              />
              <path d="M34 85Q38 81 45 85L39 92Z" fill={p.ink} strokeWidth="2" />
              <path d="M43 96Q50 102 58 95" strokeWidth="2.5" />
              <path d="M48 51L59 48" strokeWidth="4" />
              <path d="M102 92Q101 104 88 110" stroke={p.shade} strokeWidth="3" />
            </>
          ) : (
            <>
              <ellipse cx="43" cy="95" rx="22" ry="18" fill={p.cream} stroke="none" />
              <path d="M24 87Q32 83 40 88L31 96Z" fill={p.ink} strokeWidth="2" />
              <path d="M32 97V100M35 101Q43 108 54 99" strokeWidth="2.5" />
              <path d="M50 67Q59 61 68 68L67 78Q58 83 51 77Z" fill={p.cream} strokeWidth="2" />
              <ellipse cx="57" cy="72" rx="4" ry="6.5" fill={p.ink} stroke="none" />
              <circle cx="56" cy="70" r="1.4" fill="white" stroke="none" />
              <path d="M49 57Q57 51 65 55" strokeWidth="4" />
              <path d="M104 97Q99 112 84 115" stroke={p.shade} strokeWidth="3" />
            </>
          )}
        </>
      ) : (
        <>
          <circle
            cx={panda ? "54" : "46"}
            cy={panda ? "44" : "43"}
            r={panda ? "19" : "22"}
            fill={panda ? p.ink : p.fur}
          />
          <circle
            cx={panda ? "126" : "134"}
            cy={panda ? "44" : "43"}
            r={panda ? "19" : "22"}
            fill={panda ? p.ink : p.fur}
          />
          {!back && (
            <>
              <circle
                cx={panda ? "54" : "46"}
                cy={panda ? "44" : "43"}
                r={panda ? "9" : "12"}
                fill={p.ear}
                stroke="none"
              />
              <circle
                cx={panda ? "126" : "134"}
                cy={panda ? "44" : "43"}
                r={panda ? "9" : "12"}
                fill={p.ear}
                stroke="none"
              />
            </>
          )}
          <path
            d={
              panda
                ? "M44 58Q47 34 90 34Q133 34 136 58L139 82Q140 108 112 119Q90 128 68 119Q40 108 41 82Z"
                : "M33 59Q39 30 90 31Q141 30 147 59L147 84Q144 112 118 121Q90 133 62 121Q36 112 33 84Z"
            }
            fill={p.fur}
          />
          <path
            d={panda ? "M66 46Q90 38 114 47" : "M58 46Q90 35 122 46"}
            stroke={p.light}
            strokeWidth="5"
          />
          {back ? (
            <>
              <path d="M70 103Q90 114 110 103" stroke={p.shade} strokeWidth="3" />
              {panda ? (
                <path
                  d="M49 84Q51 105 66 112M130 84Q129 105 114 112"
                  stroke={p.shade}
                  strokeWidth="3"
                />
              ) : (
                <path d="M80 83L86 91L92 85L99 91" stroke={p.shade} strokeWidth="3" />
              )}
            </>
          ) : panda ? (
            <>
              <ellipse
                cx="65"
                cy="73"
                rx="17"
                ry="23"
                transform="rotate(-15 65 73)"
                fill={p.ink}
                stroke="none"
              />
              <ellipse
                cx="115"
                cy="73"
                rx="17"
                ry="23"
                transform="rotate(15 115 73)"
                fill={p.ink}
                stroke="none"
              />
              <g fill={p.cream} stroke="none">
                <ellipse cx="67" cy="72" rx="6.5" ry="9.5" />
                <ellipse cx="113" cy="72" rx="6.5" ry="9.5" />
              </g>
              <g fill={p.ink} stroke="none">
                <ellipse cx="68" cy="73" rx="3.6" ry="6.4" />
                <ellipse cx="112" cy="73" rx="3.6" ry="6.4" />
              </g>
              <g fill="white" stroke="none">
                <circle cx="67" cy="71" r="1.4" />
                <circle cx="111" cy="71" r="1.4" />
              </g>
              <path d="M58 52L70 49M109 49L121 52" strokeWidth="4" />
              <path d="M82 93Q90 89 98 93L90 101Z" fill={p.ink} strokeWidth="2" />
              <path d="M90 101V105M75 104Q90 116 106 104" strokeWidth="2.5" />
              <path d="M62 105L66 107M115 107L119 105" stroke={p.shade} strokeWidth="3" />
            </>
          ) : (
            <>
              <ellipse cx="90" cy="99" rx="31" ry="23" fill={p.cream} stroke="none" />
              <path d="M55 69Q64 62 74 69L73 80Q63 86 56 79Z" fill={p.cream} strokeWidth="2" />
              <path
                d="M106 69Q116 62 125 69L124 79Q117 86 107 80Z"
                fill={p.cream}
                strokeWidth="2"
              />
              <g fill={p.ink} stroke="none">
                <ellipse cx="65" cy="74" rx="4.3" ry="7" />
                <ellipse cx="115" cy="74" rx="4.3" ry="7" />
              </g>
              <g fill="white" stroke="none">
                <circle cx="64" cy="72" r="1.5" />
                <circle cx="114" cy="72" r="1.5" />
              </g>
              <path d="M54 58Q62 52 72 57M108 57Q118 52 126 58" strokeWidth="4" />
              <path d="M79 88Q90 82 101 88L97 96Q90 102 83 96Z" fill={p.ink} strokeWidth="2" />
              <path d="M90 99V104M72 105Q90 118 108 105" strokeWidth="2.5" />
            </>
          )}
        </>
      )}
    </g>
  );
}

function RoundCharacterArtwork({ kind, view }: { kind: RoundCharacter; view: CharacterView }) {
  const p = PALETTES[kind];
  const panda = kind === "panda";
  const side = view === "side";
  const back = view === "back";
  const paw = panda ? p.ink : p.fur;
  const sleeve = panda ? p.coatShade : p.cream;
  return (
    <g
      fill="none"
      stroke={p.ink}
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      data-character={kind}
      data-view={view}
      data-character-art="cast-refresh"
    >
      <ellipse
        cx="91"
        cy="227"
        rx={panda ? "51" : "58"}
        ry="8"
        fill="#061b20"
        opacity=".22"
        stroke="none"
      />
      {side ? (
        <>
          <path
            d="M72 169L120 172L117 195L80 194L62 216L41 208L51 185Z"
            fill={panda ? p.ink : "#384a43"}
          />
          <path d="M49 204Q33 206 27 219Q28 227 46 225H66L65 212Z" fill={p.ink} />
          <path d="M97 178L106 211L83 218L69 181" fill={panda ? "#2f4b47" : "#4f5c48"} />
          <path d="M85 208Q69 208 64 220Q64 228 85 227H111L110 214Z" fill={p.ink} />
          <circle cx="121" cy="183" r={panda ? "9" : "11"} fill={paw} />
          <path
            d={
              panda
                ? "M77 113Q112 105 122 130L127 177Q102 189 67 178L64 137Z"
                : "M74 111Q111 103 126 126L134 180Q101 192 61 177L60 135Z"
            }
            fill={p.coat}
          />
          <path d="M76 116L68 143L88 128" fill={p.cream} />
          <path d="M78 116L69 141L78 143L74 157" stroke={p.trim} strokeWidth="3" />
          <path d="M100 130Q114 142 99 156L65 164L56 147L85 139" fill={sleeve} />
          <path d="M65 146L71 161" stroke={panda ? p.cream : p.coatShade} strokeWidth="4" />
          <path d="M60 147Q46 142 35 150Q29 157 39 163Q49 170 63 162Z" fill={paw} />
          <path d="M39 153L45 157M46 151L52 155" stroke={panda ? p.ear : p.shade} strokeWidth="2" />
          <path
            d="M102 119Q115 125 119 141"
            stroke={panda ? "#6cc3bb" : "#c36b68"}
            strokeWidth="4"
          />
          {panda ? (
            <path d="M85 126L80 133L84 148L89 138Z" fill={p.trim} stroke="none" />
          ) : (
            <>
              <path d="M81 124L72 129L82 134L87 128Z" fill={p.coatShade} strokeWidth="2" />
              <circle cx="85" cy="150" r="3" fill={p.trim} stroke="none" />
              <circle cx="81" cy="166" r="3" fill={p.trim} stroke="none" />
            </>
          )}
          <RoundHead kind={kind} view="side" />
        </>
      ) : (
        <>
          <path
            d={
              panda
                ? "M55 171Q43 190 57 208L75 217L91 186L108 217L125 208Q140 190 127 171Z"
                : "M47 168Q32 188 49 209L73 219L91 186L109 219L133 209Q150 188 135 168Z"
            }
            fill={panda ? p.ink : "#384a43"}
          />
          <path d="M55 205Q39 211 42 223Q59 231 79 221L77 210Z" fill={p.ink} />
          <path d="M105 210L103 221Q124 231 141 222Q142 212 126 205Z" fill={p.ink} />
          <path
            d={
              panda
                ? "M65 114Q90 106 117 114Q134 136 131 179Q90 190 51 179Q49 136 65 114Z"
                : "M58 110Q90 101 124 110Q143 136 139 180Q90 194 41 180Q37 136 58 110Z"
            }
            fill={p.coat}
          />
          <path
            d={
              panda
                ? "M64 118Q45 118 38 141L34 159L53 166L65 138M118 118Q137 118 144 141L148 159L129 166L117 138"
                : "M57 116Q37 113 29 139L26 158L49 167L62 135M125 116Q145 113 153 139L156 158L133 167L120 135"
            }
            fill={sleeve}
          />
          <path
            d={panda ? "M35 151L55 158M127 158L147 151" : "M28 151L51 159M131 159L154 151"}
            stroke={panda ? p.cream : p.coatShade}
            strokeWidth="4"
          />
          <path
            d={
              panda
                ? "M35 156Q44 152 53 161L54 171Q42 177 33 168Z"
                : "M27 155Q39 150 50 161L50 172Q37 181 24 170Z"
            }
            fill={paw}
          />
          <path
            d={
              panda
                ? "M130 161Q139 152 147 156L150 168Q140 177 128 171Z"
                : "M133 161Q144 150 156 155L159 170Q146 181 133 172Z"
            }
            fill={paw}
          />
          {back ? (
            <>
              <path d="M67 117Q90 128 114 117" stroke={p.trim} strokeWidth="4" />
              <path d="M91 129V178M59 172Q90 182 123 172" stroke={p.coatShade} strokeWidth="3" />
              {panda ? (
                <>
                  <path d="M76 143H107M76 155H107" stroke="#91d4c3" strokeWidth="3" />
                  <path d="M86 138V160M97 138V160" stroke={p.trim} strokeWidth="3" />
                </>
              ) : (
                <path
                  d="M66 142Q90 157 116 142M67 148Q90 162 115 148"
                  stroke={p.trim}
                  strokeWidth="3"
                />
              )}
              <circle cx="91" cy="185" r={panda ? "9" : "11"} fill={paw} />
            </>
          ) : (
            <>
              <path d="M69 116L91 164L113 116" fill={p.cream} />
              <path
                d="M67 118L74 141L82 138L91 164L100 138L108 141L115 118"
                stroke={p.trim}
                strokeWidth="3"
              />
              {panda ? (
                <>
                  <path
                    d="M86 128L91 124L96 128L93 137L98 150L91 158L84 150L89 137Z"
                    fill={p.coatShade}
                    strokeWidth="2"
                  />
                  <path d="M115 135H123L119 142Z" fill={p.trim} stroke="none" />
                  <path d="M111 157H122" stroke={p.cream} strokeWidth="3" />
                </>
              ) : (
                <>
                  <path
                    d="M76 123L91 129L76 136ZM106 123L91 129L106 136Z"
                    fill={p.coatShade}
                    strokeWidth="2"
                  />
                  <circle cx="91" cy="129" r="3.5" fill={p.trim} stroke="none" />
                  <circle cx="91" cy="164" r="3" fill={p.trim} stroke="none" />
                  <circle cx="91" cy="177" r="3" fill={p.trim} stroke="none" />
                  <path d="M54 158H67M115 158H128" stroke={p.trim} strokeWidth="3" />
                </>
              )}
            </>
          )}
          <RoundHead kind={kind} view={back ? "back" : "front"} />
        </>
      )}
    </g>
  );
}

export function BearCharacter({ view }: { view: CharacterView }) {
  return <RoundCharacterArtwork kind="bear" view={view} />;
}

export function PandaCharacter({ view }: { view: CharacterView }) {
  return <RoundCharacterArtwork kind="panda" view={view} />;
}

function RoundPortraitArtwork({ kind }: { kind: RoundCharacter }) {
  const p = PALETTES[kind];
  const panda = kind === "panda";
  return (
    <g>
      <path
        d="M14 100Q16 77 36 73H64Q84 77 86 100"
        fill={panda ? p.coatShade : p.cream}
        stroke={p.ink}
        strokeWidth="2"
      />
      <path d="M33 77L50 96L67 77L77 100H23Z" fill={p.coat} />
      <path d="M37 76L50 97L63 76" fill={p.cream} />
      <path
        d="M35 78L40 91L45 89L50 98L55 89L60 91L65 78"
        fill="none"
        stroke={p.trim}
        strokeWidth="2"
      />
      {panda ? (
        <path d="M46 82L50 80L54 82L52 88L55 94L50 99L45 94L48 88Z" fill={p.coatShade} />
      ) : (
        <>
          <path d="M41 81L50 85L41 90ZM59 81L50 85L59 90Z" fill={p.coatShade} />
          <circle cx="50" cy="85" r="2" fill={p.trim} />
        </>
      )}
      <g transform={panda ? "translate(-7 -6) scale(.63)" : "translate(-4 -4) scale(.6)"}>
        <RoundHead kind={kind} />
      </g>
    </g>
  );
}

export function BearPortraitArtwork() {
  return <RoundPortraitArtwork kind="bear" />;
}

export function PandaPortraitArtwork() {
  return <RoundPortraitArtwork kind="panda" />;
}
