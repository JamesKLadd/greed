import type { CharacterKind, CharacterView } from "./manifest.js";

const PALETTE = {
  fox: { fur: "#ee9750", shade: "#b96838", coat: "#a63e78" },
  bear: { fur: "#bd9567", shade: "#896848", coat: "#24796b" },
  owl: { fur: "#aa88ca", shade: "#765993", coat: "#4c687d" },
  cat: { fur: "#8da5c9", shade: "#617ba1", coat: "#855494" },
  frog: { fur: "#74cba4", shade: "#489f80", coat: "#bd6570" },
  panda: { fur: "#eff0d9", shade: "#a6b3a9", coat: "#27786f" },
};

/** Temporary art retained while individual manifest views receive production images. */
export function CharacterPlaceholder({ kind, view }: { kind: CharacterKind; view: CharacterView }) {
  const { fur, shade, coat } = PALETTE[kind];
  const side = view === "side";
  const back = view === "back";
  const pointy = kind === "fox" || kind === "cat";
  const dark = "#23303b";
  const cream = "#fff0cf";
  const gold = "#f3c36b";
  const paw = kind === "panda" ? dark : fur;

  return (
    <g
      fill="none"
      stroke="#24313a"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      data-character={kind}
      data-view={view}
    >
      <ellipse cx="91" cy="227" rx="57" ry="8" fill="#061b20" opacity=".22" stroke="none" />
      {side ? (
        <>
          {pointy && (
            <path
              d={
                kind === "fox"
                  ? "M121 186Q166 170 151 128Q137 147 121 151L105 183Z"
                  : "M115 183Q160 192 147 155Q143 144 137 153Q149 174 114 169"
              }
              fill={fur}
            />
          )}
          {kind === "fox" && (
            <path
              d="M151 129Q154 150 148 161L137 154L132 160L130 148Z"
              fill={cream}
              stroke="none"
            />
          )}
          <path d="M72 165L117 169L114 192L79 194L63 216L43 208L52 184Z" fill="#344653" />
          <path d="M49 204Q36 205 28 216Q23 225 42 225H65L65 212Z" fill={dark} />
          <path d="M99 178L104 211L80 216L68 179" fill="#415664" />
          <path d="M84 207Q68 209 64 221Q66 227 83 227H109L108 213Z" fill={dark} />
          <path d="M77 103Q115 102 124 130L127 177Q103 192 65 177L65 133Z" fill={coat} />
          <path d="M76 110L69 140L91 125" fill={cream} />
          <path d="M78 112L69 141L82 139L76 158" stroke={gold} />
          <path d="M102 128Q111 140 98 153L65 160L59 145L84 138" fill={coat} />
          <ellipse cx="54" cy="153" rx="17" ry="10" fill={paw} transform="rotate(-8 54 153)" />
          <path d="M93 113Q115 120 119 145" stroke="#ffffff" opacity=".13" />
          {pointy ? (
            <>
              <path d="M87 53L108 15L120 62" fill={shade} />
              <path d="M48 60L47 19L79 44" fill={fur} />
              <path d="M54 44L54 30L67 45" fill="#eeb3a1" stroke="none" />
            </>
          ) : kind === "bear" || kind === "panda" ? (
            <circle cx="109" cy="47" r="19" fill={kind === "panda" ? dark : fur} />
          ) : kind === "owl" ? (
            <path d="M52 51L53 26L72 42L108 34L120 58" fill={fur} />
          ) : (
            <circle cx="68" cy="43" r="19" fill={fur} />
          )}
          <path
            d={
              kind === "fox"
                ? "M113 56Q105 36 75 42Q48 44 45 73L25 87L45 100Q52 120 83 119Q126 112 113 56Z"
                : kind === "frog"
                  ? "M114 58Q103 40 72 47Q47 47 41 73Q21 78 30 96Q43 117 80 116Q122 113 114 58Z"
                  : "M116 62Q110 39 79 41Q48 42 43 71L33 84Q33 112 78 118Q123 115 116 62Z"
            }
            fill={fur}
          />
          {kind === "fox" && (
            <path d="M29 89L59 78L87 112Q55 120 43 99Z" fill={cream} stroke="none" />
          )}
          {(kind === "owl" || kind === "panda") && (
            <ellipse
              cx="58"
              cy="73"
              rx="18"
              ry="24"
              fill={kind === "owl" ? cream : dark}
              stroke="none"
            />
          )}
          {kind === "bear" && (
            <ellipse cx="45" cy="92" rx="16" ry="12" fill="#e2bf91" stroke="none" />
          )}
          {kind === "frog" && (
            <ellipse cx="59" cy="58" rx="13" ry="17" fill="#b6e9b7" stroke="none" />
          )}
          <ellipse
            cx="55"
            cy={kind === "frog" ? 57 : 70}
            rx="4"
            ry="7"
            fill={kind === "panda" ? cream : dark}
            stroke="none"
          />
          <path d="M47 54L59 51" stroke={shade} />
          {kind === "owl" ? (
            <path d="M40 83L22 89L42 97" fill={gold} />
          ) : kind !== "frog" ? (
            <ellipse
              cx={kind === "fox" ? 28 : 36}
              cy="86"
              rx="5"
              ry="4"
              fill={dark}
              stroke="none"
            />
          ) : null}
          <path d="M42 98Q51 105 61 98" stroke={dark} strokeWidth="2" />
          {kind === "cat" && <path d="M40 88L22 85M40 95L21 98" stroke={cream} strokeWidth="2" />}
          <path d="M77 54Q98 49 107 66" stroke={cream} opacity=".25" strokeWidth="4" />
        </>
      ) : (
        <>
          {pointy && (
            <path
              d={
                kind === "fox"
                  ? "M115 190Q157 190 157 151L142 165L132 153Q134 179 109 174Z"
                  : "M116 186Q157 190 145 156Q139 150 136 157Q148 178 112 174"
              }
              fill={fur}
            />
          )}
          <path
            d="M49 167Q34 187 52 209L73 218L90 183L107 218L129 209Q147 187 131 167Z"
            fill="#3b515d"
          />
          <path d="M55 203Q39 210 42 222Q58 232 78 220L76 207Z" fill={dark} />
          <path d="M104 208L102 221Q125 232 139 221Q140 210 125 203Z" fill={dark} />
          <path
            d="M59 107Q89 99 121 107Q137 136 134 178Q88 193 46 178Q43 133 59 107Z"
            fill={coat}
          />
          <path
            d="M58 113Q40 113 33 142L31 157L52 164L64 130M122 113Q140 113 147 142L149 157L128 164L116 130"
            fill={coat}
          />
          <ellipse cx="40" cy="161" rx="14" ry="11" fill={paw} />
          <ellipse cx="140" cy="161" rx="14" ry="11" fill={paw} />
          {back ? (
            <>
              <path d="M64 112Q90 127 116 112" stroke={gold} strokeWidth="5" />
              <path d="M90 124V177M57 166Q90 177 124 166" stroke="#182e3a" opacity=".35" />
              <path d="M75 147L90 136L105 147L90 158Z" fill={gold} stroke="none" />
              <path d="M82 147L90 141L98 147L90 153Z" fill={coat} stroke="none" />
              {(kind === "bear" || kind === "panda") && (
                <circle cx="90" cy="182" r="10" fill={paw} />
              )}
              {kind === "owl" && <path d="M74 177L80 193L89 184L98 195L108 177" fill={shade} />}
            </>
          ) : (
            <>
              <path d="M66 110L90 156L114 110" fill={cream} />
              <path
                d="M64 112L70 135L81 134L90 156L99 134L110 135L116 112"
                stroke={gold}
                strokeWidth="2"
              />
              <path d="M73 117L90 123L73 130ZM107 117L90 123L107 130Z" fill={gold} />
              <circle cx="90" cy="124" r="4" fill={cream} stroke="none" />
              <circle cx="90" cy="164" r="3" fill={gold} stroke="none" />
              <path d="M112 149H123" stroke={gold} strokeWidth="3" />
            </>
          )}
          {pointy ? (
            <>
              <path d="M44 60L35 16L73 41M105 41L145 16L137 64" fill={fur} />
              {!back && (
                <path d="M46 47L43 29L62 45M117 45L138 29L134 50" fill="#edb7a5" stroke="none" />
              )}
            </>
          ) : kind === "bear" || kind === "panda" ? (
            <>
              <circle cx="49" cy="43" r="20" fill={kind === "panda" ? dark : fur} />
              <circle cx="131" cy="43" r="20" fill={kind === "panda" ? dark : fur} />
              {!back && (
                <path d="M40 48Q37 27 56 37M124 36Q143 27 141 48" stroke={shade} strokeWidth="8" />
              )}
            </>
          ) : kind === "owl" ? (
            <path d="M42 54L39 25L67 39L111 39L141 25L138 58" fill={fur} />
          ) : (
            <>
              <circle cx="57" cy="43" r="22" fill={fur} />
              <circle cx="123" cy="43" r="22" fill={fur} />
            </>
          )}
          <path
            d={
              kind === "owl"
                ? "M39 53Q88 23 141 53L132 94Q90 132 49 94Z"
                : kind === "frog"
                  ? "M38 62Q45 41 90 45Q133 41 142 62Q153 106 90 117Q28 108 38 62Z"
                  : "M40 61Q42 31 90 33Q138 31 140 61L133 94Q118 118 90 119Q62 118 47 94Z"
            }
            fill={fur}
          />
          <path d="M59 49Q90 36 121 50" stroke={cream} strokeWidth="5" opacity=".25" />
          {back ? (
            <path d="M73 101L80 108L90 104L100 109L107 102" stroke={shade} />
          ) : (
            <>
              {kind === "fox" && (
                <path d="M43 72L88 90L138 70L125 96L90 115L56 96Z" fill={cream} stroke="none" />
              )}
              {(kind === "owl" || kind === "panda") && (
                <g fill={kind === "owl" ? cream : dark} stroke="none">
                  <ellipse cx="66" cy="73" rx="22" ry="25" transform="rotate(-10 66 73)" />
                  <ellipse cx="114" cy="73" rx="22" ry="25" transform="rotate(10 114 73)" />
                </g>
              )}
              {kind === "bear" && (
                <ellipse cx="90" cy="94" rx="26" ry="18" fill="#e4c39b" stroke="none" />
              )}
              {kind === "frog" && (
                <g fill="#b6e9b7" stroke="none">
                  <ellipse cx="59" cy="50" rx="15" ry="19" />
                  <ellipse cx="121" cy="50" rx="15" ry="19" />
                </g>
              )}
              <g fill={kind === "panda" ? cream : dark} stroke="none">
                <ellipse
                  cx={kind === "frog" ? 59 : 66}
                  cy={kind === "frog" ? 50 : 71}
                  rx="5"
                  ry="8"
                />
                <ellipse
                  cx={kind === "frog" ? 121 : 114}
                  cy={kind === "frog" ? 50 : 71}
                  rx="5"
                  ry="8"
                />
              </g>
              {kind !== "frog" && (
                <path
                  d="M81 86Q90 82 99 86L90 95Z"
                  fill={kind === "owl" ? gold : dark}
                  stroke="none"
                />
              )}
              <path d="M72 98Q90 111 108 98" stroke={dark} strokeWidth="2.5" />
              {kind === "cat" && (
                <path
                  d="M32 83L58 86M33 97L57 94M122 86L148 83M123 94L147 97"
                  stroke={cream}
                  strokeWidth="2"
                />
              )}
              <g fill="#db7580" stroke="none" opacity=".45">
                <ellipse cx="56" cy="89" rx="8" ry="4" />
                <ellipse cx="124" cy="89" rx="8" ry="4" />
              </g>
            </>
          )}
        </>
      )}
    </g>
  );
}
