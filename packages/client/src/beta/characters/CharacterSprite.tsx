import { useEffect, useState } from "react";
import { FoxCharacter } from "./FoxCharacter.js";
import { BearCharacter, PandaCharacter } from "./BearPandaArtwork.js";
import { CatCharacter, OwlCharacter, FrogCharacter } from "./CatOwlFrogArtwork.js";
import { loadCharacterImage, type LoadedCharacterImage } from "./loadCharacterImage.js";
import { WornHat } from "./Hats.js";
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
  /** A hat id from the wearer's look; anything else is bare-headed. */
  hat?: string;
}

/** Decorative art only: the seat owns its name, score, interactions and accessibility label. */
export function CharacterSprite({
  characterId,
  view,
  mirrored = false,
  className,
  art,
  hat,
}: CharacterSpriteProps) {
  const kind = getCharacterKind(characterId);
  const SeatedCharacter = {
    fox: FoxCharacter,
    bear: BearCharacter,
    panda: PandaCharacter,
    cat: CatCharacter,
    owl: OwlCharacter,
    frog: FrogCharacter,
  }[kind];
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
          <SeatedCharacter view={view} />
        )}
        <WornHat hat={hat} kind={kind} view={view} />
      </g>
    </svg>
  );
}
