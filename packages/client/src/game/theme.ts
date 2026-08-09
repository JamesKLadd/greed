/**
 * Per-player visual identity: a stable color and short initials for avatars.
 * Colors are picked by player-list index so a player keeps the same hue all game,
 * regardless of where they end up seated.
 */

// Eight distinct hues, mid-toned so they stay legible as text and avatar rings
// on the cream card stock the seats are now printed on. (They were previously
// tuned for dark-green felt, where much lighter values were needed; those
// washed out completely once the surface went light.)
const SEAT_COLORS = [
  "#c2571c", // orange
  "#1f6f9e", // blue
  "#1f7a4d", // green
  "#6b46b0", // purple
  "#b5407e", // pink
  "#9a6a10", // ochre
  "#0f7a75", // teal
  "#b3372c", // red
];

// Colorblind-safe palette (Okabe–Ito), darkened where needed for contrast on
// cream — notably the yellow, which is unusable on a light background.
const SEAT_COLORS_CB = [
  "#a86a00", // orange
  "#3782ab", // sky blue
  "#007454", // bluish green
  "#8a7b00", // dark yellow (Okabe–Ito yellow is invisible on cream)
  "#0059a1", // blue
  "#c1500a", // vermillion
  "#a15a86", // reddish purple
  "#6b6b6b", // gray
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
