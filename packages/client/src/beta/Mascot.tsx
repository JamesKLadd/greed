import type { Appearance } from "./appearance.js";

/** Original vector portraits: readable silhouettes at seat size, no external assets. */
export function Mascot({
  look,
  name,
}: {
  look: Pick<Appearance, "mascot" | "frame" | "background">;
  name?: string;
}) {
  const animal = look.mascot;
  const colors: Record<string, string> = {
    fox: "#ee9750",
    bear: "#bd9567",
    owl: "#aa88ca",
    cat: "#8da5c9",
    frog: "#74cba4",
    panda: "#eff0d9",
  };
  const color = colors[animal] ?? colors.fox;
  const pointy = animal === "fox" || animal === "cat";
  return (
    <span
      className={`beta-portrait beta-frame--${look.frame} beta-background--${look.background}`}
      role={name ? "img" : undefined}
      aria-label={name}
      aria-hidden={name ? undefined : true}
    >
      <svg viewBox="0 0 100 100" fill="none" aria-hidden="true">
        <path d="M18 100Q18 68 50 70Q82 68 82 100" fill="#172c32" />
        {pointy ? (
          <path
            d="M21 41L16 9L42 24M59 24L84 9L79 44"
            fill={color}
            stroke="#302937"
            strokeWidth="3"
          />
        ) : (
          <>
            <circle cx="25" cy="29" r="15" fill={animal === "panda" ? "#29353f" : color} />
            <circle cx="75" cy="29" r="15" fill={animal === "panda" ? "#29353f" : color} />
          </>
        )}
        <path
          d={
            animal === "owl"
              ? "M18 28Q50 13 82 28L77 61Q50 92 23 61Z"
              : "M20 38Q20 19 50 21Q80 19 80 38L77 61Q69 82 50 83Q31 82 23 61Z"
          }
          fill={color}
          stroke="#302937"
          strokeWidth="2"
        />
        {animal === "fox" && <path d="M21 45L49 61L79 45L72 67L50 81L28 67Z" fill="#fff0cf" />}
        {(animal === "owl" || animal === "panda") && (
          <>
            <ellipse
              cx="35"
              cy="46"
              rx="15"
              ry="18"
              fill={animal === "owl" ? "#f4dcc0" : "#29353f"}
            />
            <ellipse
              cx="65"
              cy="46"
              rx="15"
              ry="18"
              fill={animal === "owl" ? "#f4dcc0" : "#29353f"}
            />
          </>
        )}
        {animal === "frog" && (
          <>
            <circle cx="32" cy="30" r="12" fill="#aff0bd" />
            <circle cx="68" cy="30" r="12" fill="#aff0bd" />
          </>
        )}
        <ellipse
          cx="35"
          cy={animal === "frog" ? 31 : 45}
          rx="4"
          ry="6"
          fill={animal === "panda" ? "#fff" : "#192b32"}
        />
        <ellipse
          cx="65"
          cy={animal === "frog" ? 31 : 45}
          rx="4"
          ry="6"
          fill={animal === "panda" ? "#fff" : "#192b32"}
        />
        <path
          d={animal === "owl" ? "M44 55L56 55L50 65Z" : "M45 58Q50 55 55 58L50 63Z"}
          fill={animal === "owl" ? "#e7af5e" : "#47363b"}
        />
        <path d="M39 68Q50 76 61 68" stroke="#47363b" strokeWidth="2.5" strokeLinecap="round" />
        {animal === "cat" && (
          <path
            d="M12 55L30 58M12 66L30 64M70 58L88 55M70 64L88 66"
            stroke="#e7d8bf"
            strokeWidth="2"
          />
        )}
        <path d="M35 86L50 92L35 98ZM65 86L50 92L65 98Z" fill="#e4bb6c" />
        <circle cx="50" cy="92" r="3" fill="#fff0c1" />
      </svg>
    </span>
  );
}
