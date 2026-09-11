export const CHARACTER_KINDS = ["fox", "bear", "owl", "cat", "frog", "panda"] as const;
export const CHARACTER_VIEWS = ["front", "side", "back"] as const;
export type CharacterKind = (typeof CHARACTER_KINDS)[number];
export type CharacterView = (typeof CHARACTER_VIEWS)[number];

export interface NormalizedPoint {
  readonly x: number;
  readonly y: number;
}

export interface NormalizedBounds extends NormalizedPoint {
  readonly width: number;
  readonly height: number;
}

/** Coordinates are fractions of the complete source image, including transparent padding. */
export interface CharacterArt {
  readonly src?: string;
  readonly anchor: NormalizedPoint;
  readonly visibleBounds: NormalizedBounds;
}

export const CHARACTER_CANVAS = { width: 180, height: 240 } as const;

/** Legacy composition uses a centered, uncropped 180 × 240 canvas. */
export const DEFAULT_CHARACTER_ART: CharacterArt = {
  anchor: { x: 0.5, y: 0.5 },
  visibleBounds: { x: 0, y: 0, width: 1, height: 1 },
};

type CharacterViews = Readonly<Record<CharacterView, CharacterArt>>;

/** Replace any one view with an image and its metadata; the other views stay as SVGs. */
export const CHARACTER_ART_MANIFEST: Readonly<Record<CharacterKind, CharacterViews>> = {
  fox: {
    front: DEFAULT_CHARACTER_ART,
    side: DEFAULT_CHARACTER_ART,
    back: DEFAULT_CHARACTER_ART,
  },
  bear: {
    front: DEFAULT_CHARACTER_ART,
    side: DEFAULT_CHARACTER_ART,
    back: DEFAULT_CHARACTER_ART,
  },
  owl: {
    front: DEFAULT_CHARACTER_ART,
    side: DEFAULT_CHARACTER_ART,
    back: DEFAULT_CHARACTER_ART,
  },
  cat: {
    front: DEFAULT_CHARACTER_ART,
    side: DEFAULT_CHARACTER_ART,
    back: DEFAULT_CHARACTER_ART,
  },
  frog: {
    front: DEFAULT_CHARACTER_ART,
    side: DEFAULT_CHARACTER_ART,
    back: DEFAULT_CHARACTER_ART,
  },
  panda: {
    front: DEFAULT_CHARACTER_ART,
    side: DEFAULT_CHARACTER_ART,
    back: DEFAULT_CHARACTER_ART,
  },
};

/** This resolves artwork only. Callers retain their original player/character identity. */
export function getCharacterKind(characterId?: string): CharacterKind {
  return CHARACTER_KINDS.find((kind) => kind === characterId) ?? "fox";
}

export function getCharacterArt(
  characterId: string | undefined,
  view: CharacterView,
): CharacterArt {
  return CHARACTER_ART_MANIFEST[getCharacterKind(characterId)][view];
}

export function isCharacterArt(value: unknown): value is CharacterArt {
  if (!value || typeof value !== "object") return false;
  const { src, anchor, visibleBounds: bounds } = value as Partial<CharacterArt>;
  if (src !== undefined && (typeof src !== "string" || !src.trim())) return false;
  if (!anchor || !bounds) return false;
  const unit = (n: unknown): n is number =>
    typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;
  return (
    unit(anchor.x) &&
    unit(anchor.y) &&
    unit(bounds.x) &&
    unit(bounds.y) &&
    unit(bounds.width) &&
    unit(bounds.height) &&
    bounds.width > 0 &&
    bounds.height > 0 &&
    bounds.x + bounds.width <= 1 + Number.EPSILON &&
    bounds.y + bounds.height <= 1 + Number.EPSILON &&
    anchor.x >= bounds.x &&
    anchor.x <= bounds.x + bounds.width &&
    anchor.y >= bounds.y &&
    anchor.y <= bounds.y + bounds.height
  );
}

/** Fit visible pixels around a fixed center anchor, without stretching their aspect ratio. */
export function getArtPlacement(
  art: CharacterArt,
  source: { width: number; height: number },
): { x: number; y: number; width: number; height: number } | null {
  if (
    !isCharacterArt(art) ||
    !Number.isFinite(source.width) ||
    !Number.isFinite(source.height) ||
    source.width <= 0 ||
    source.height <= 0
  ) {
    return null;
  }
  const { anchor, visibleBounds: bounds } = art;
  const halfWidth = CHARACTER_CANVAS.width / 2;
  const halfHeight = CHARACTER_CANVAS.height / 2;
  const scale = Math.min(
    halfWidth / ((anchor.x - bounds.x) * source.width),
    halfWidth / ((bounds.x + bounds.width - anchor.x) * source.width),
    halfHeight / ((anchor.y - bounds.y) * source.height),
    halfHeight / ((bounds.y + bounds.height - anchor.y) * source.height),
  );
  const width = source.width * scale;
  const height = source.height * scale;
  return {
    x: halfWidth - anchor.x * width,
    y: halfHeight - anchor.y * height,
    width,
    height,
  };
}
