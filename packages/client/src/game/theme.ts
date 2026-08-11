/**
 * Per-player visual identity: a stable color and short initials for avatars.
 * Colors are picked by player-list index so a player keeps the same hue all game,
 * regardless of where they end up seated.
 */

// Eight distinct hues, bright enough to read as rings and progress fills on the
// dark charcoal a seat pod is now made of. These have been retuned twice and
// the reason is worth remembering: a palette that works on one background is
// close to useless on its opposite. Mid-tones legible on cream card stock go
// muddy on charcoal, exactly as the light values before them washed out on
// cream. Contrast against --surface-2 is asserted in theme.test.ts.
const SEAT_COLORS = [
  "#ff9d4d", // orange
  "#5cb3ee", // blue
  "#4fd08a", // green
  "#b48cff", // purple
  "#ff7ab8", // pink
  "#e8bd52", // ochre
  "#48d3ca", // teal
  "#ff7a6e", // red
];

// Colorblind-safe palette (Okabe–Ito), lightened for a dark surface — these are
// close to the original published values, which were designed against white but
// hold up well as luminous accents on charcoal.
const SEAT_COLORS_CB = [
  "#e69f00", // orange
  "#56b4e9", // sky blue
  "#3fc08a", // bluish green
  "#f0e442", // yellow
  "#6fa8ea", // blue
  "#ff8a5c", // vermillion
  "#e49ec9", // reddish purple
  "#b6bfc9", // gray
];

let colorblind = false;

/** Toggle the colorblind-safe seat palette (driven by settings). */
export function setColorblindPalette(on: boolean): void {
  colorblind = on;
}

export function seatColor(index: number): string {
  const palette = colorblind ? SEAT_COLORS_CB : SEAT_COLORS;
  return palette[((index % palette.length) + palette.length) % palette.length];
}

/** 1–2 letter avatar label: initials of the first & last word (or first letter of one word). */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0][0].toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
