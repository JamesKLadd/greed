import { useEffect, useState } from "react";
import { CharacterPlaceholder } from "./CharacterPlaceholder.js";
import { loadCharacterImage, type LoadedCharacterImage } from "./loadCharacterImage.js";
import {
  CHARACTER_CANVAS,
  getArtPlacement,
  getCharacterArt,
  getCharacterKind,
  isCharacterArt,
  type CharacterArt,
  type CharacterView,
} from "./manifest.js";

export interface CharacterSpriteProps {
  characterId?: string;
  view: CharacterView;
  mirrored?: boolean;
  className?: string;
  /** Local art review override; does not write a character or appearance selection. */
  art?: CharacterArt;
}

/** Decorative art only: the seat owns its name, score, interactions and accessibility label. */
export function CharacterSprite({
  characterId,
  view,
  mirrored = false,
  className,
  art,
}: CharacterSpriteProps) {
  const kind = getCharacterKind(characterId);
  const selectedArt = art ?? getCharacterArt(characterId, view);
  const src = isCharacterArt(selectedArt) ? selectedArt.src : undefined;
  const [loadedImage, setLoadedImage] = useState<LoadedCharacterImage | null>(null);

  useEffect(() => {
    if (!src) return;
    return loadCharacterImage(src, setLoadedImage);
  }, [src]);

  const placement =
    src && loadedImage?.src === src ? getArtPlacement(selectedArt, loadedImage) : null;

  return (
    <svg
      className={className}
      viewBox={`0 0 ${CHARACTER_CANVAS.width} ${CHARACTER_CANVAS.height}`}
      fill="none"
      aria-hidden="true"
      focusable="false"
      data-character-id={characterId ?? ""}
      data-character={kind}
      data-view={view}
      data-art-source={placement ? "image" : "placeholder"}
    >
      <g transform={mirrored ? `translate(${CHARACTER_CANVAS.width} 0) scale(-1 1)` : undefined}>
        {placement ? (
          <image
            href={src}
            {...placement}
            preserveAspectRatio="none"
            onError={() => setLoadedImage(null)}
          />
        ) : (
          <CharacterPlaceholder kind={kind} view={view} />
        )}
      </g>
    </svg>
  );
}
