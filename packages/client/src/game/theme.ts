/**
 * Per-player visual identity: a stable color and short initials for avatars.
 * Colors are picked by player-list index so a player keeps the same hue all game,
 * regardless of where they end up seated.
 */

// Eight distinct hues that all read clearly on the dark-green felt.
const SEAT_COLORS = [
  "#f0883e", // orange
  "#6ab7ff", // blue
  "#64d197", // green
  "#b98cff", // purple
  "#ff8fc7", // pink
  "#f5c451", // gold
  "#3fd0c9", // teal
  "#e5544b", // red
];

// Colorblind-safe palette (Okabe–Ito based), tuned to stay legible on dark felt.
const SEAT_COLORS_CB = [
  "#e69f00", // orange
  "#56b4e9", // sky blue
  "#009e73", // bluish green
  "#f0e442", // yellow
  "#0072b2", // blue
  "#d55e00", // vermillion
  "#cc79a7", // reddish purple
  "#bbbbbb", // light gray
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
