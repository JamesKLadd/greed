import type { Appearance } from "./appearance.js";
import { FoxPortraitArtwork } from "./characters/FoxArtwork.js";
import { BearPortraitArtwork, PandaPortraitArtwork } from "./characters/BearPandaArtwork.js";
import {
  CatPortraitArtwork,
  OwlPortraitArtwork,
  FrogPortraitArtwork,
} from "./characters/CatOwlFrogArtwork.js";
import { getCharacterKind } from "./characters/manifest.js";

const PORTRAITS = {
  fox: FoxPortraitArtwork,
  bear: BearPortraitArtwork,
  panda: PandaPortraitArtwork,
  cat: CatPortraitArtwork,
  owl: OwlPortraitArtwork,
  frog: FrogPortraitArtwork,
};

/** Portraits reuse seated faces; frames and backdrops remain independent cosmetics. */
export function Mascot({
  look,
  name,
}: {
  look: Pick<Appearance, "mascot" | "frame" | "background">;
  name?: string;
}) {
  const Portrait = PORTRAITS[getCharacterKind(look.mascot)];
  return (
    <span
      className={`beta-portrait beta-frame--${look.frame} beta-background--${look.background}`}
      role={name ? "img" : undefined}
      aria-label={name}
      aria-hidden={name ? undefined : true}
    >
      <svg viewBox="0 0 100 100" fill="none" aria-hidden="true" focusable="false">
        <Portrait />
      </svg>
    </span>
  );
}
