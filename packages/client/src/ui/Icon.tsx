/**
 * The icon set: hand-inked strokes rather than platform emoji.
 *
 * Emoji were doing all the iconography, which meant the UI looked different on
 * every OS and couldn't take the theme's colours. These are single-path strokes
 * on a 24-grid with round caps, drawn in `currentColor` so they inherit text
 * colour for free — closer to felt-marker marks on a game box than to Apple's
 * glossy glyphs.
 *
 * Emoji deliberately survive in two places: achievement medals (18 unique,
 * celebratory, defined as data in game/profile.ts) and the bot personality
 * badges. Those are illustrations, not interface.
 */

export type IconName =
  | "back"
  | "close"
  | "bulb"
  | "scroll"
  | "book"
  | "refresh"
  | "download"
  | "chart"
  | "palette"
  | "gear"
  | "graduate"
  | "dice"
  | "globe"
  | "lock"
  | "volume"
  | "volume-off"
  | "eye"
  | "user"
  | "check"
  | "plus"
  | "minus"
  | "trophy";

/** Stroke paths on a 24x24 grid. */
const PATHS: Record<IconName, string> = {
  back: "M15 5l-7 7 7 7",
  close: "M6 6l12 12M18 6L6 18",
  bulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3 11v2h6v-2a6 6 0 0 0-3-11z",
  scroll: "M6 4h11a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8 9h7M8 13h7",
  book: "M4 5a2 2 0 0 1 2-2h11v18H6a2 2 0 0 1-2-2V5zM17 3v18M8 8h5",
  refresh: "M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5",
  download: "M12 3v11M8 11l4 4 4-4M5 20h14",
  chart: "M5 20V10M12 20V4M19 20v-7M3 20h18",
  palette:
    "M12 3a9 9 0 1 0 0 18 2 2 0 0 0 1.6-3.2 2 2 0 0 1 1.6-3.2H18a3 3 0 0 0 3-3 9 9 0 0 0-9-8.6zM7.5 12.5h.01M9.5 8.5h.01M14 7.5h.01",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 15H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9 3.6V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z",
  graduate: "M3 9l9-4 9 4-9 4-9-4zM7 11v4c0 1.5 2.2 3 5 3s5-1.5 5-3v-4",
  dice: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01",
  globe:
    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M6 11h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z",
  volume: "M5 9v6h4l5 4V5L9 9H5zM17 9.5a3.5 3.5 0 0 1 0 5M19.5 7a7 7 0 0 1 0 10",
  "volume-off": "M5 9v6h4l5 4V5L9 9H5zM17 10l4 4M21 10l-4 4",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0",
  check: "M4 12.5l5 5L20 6.5",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  // A cup with handles, on a plinth: the weekly's mark, since it is the one
  // challenge you win against everyone else rather than simply complete.
  trophy:
    "M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H4.5a2.5 2.5 0 0 0 2.5 2.5M17 6h2.5a2.5 2.5 0 0 1-2.5 2.5M12 14v3M9 20h6M10 17h4",
};

export interface IconProps {
  name: IconName;
  /** Any CSS length. Defaults to 1em so it tracks the surrounding text. */
  size?: string | number;
  className?: string;
}

export function Icon({ name, size = "1em", className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
