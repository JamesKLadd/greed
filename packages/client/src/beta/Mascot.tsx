import type { Appearance } from "./appearance.js";
import { FoxPortraitArtwork } from "./characters/FoxArtwork.js";
import { BearPortraitArtwork, PandaPortraitArtwork } from "./characters/BearPandaArtwork.js";
import {
  CatPortraitArtwork,
  OwlPortraitArtwork,
  FrogPortraitArtwork,
} from "./characters/CatOwlFrogArtwork.js";
import { getCharacterKind } from "./characters/manifest.js";
import { PortraitHat, isHatId } from "./characters/Hats.js";

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
  look: Pick<Appearance, "mascot" | "frame" | "background"> & { hat?: string };
  name?: string;
}) {
  const kind = getCharacterKind(look.mascot);
  const Portrait = PORTRAITS[kind];
  // A hat rises above the head, which sits near the top of the portrait: the
  // wearer steps back a little so the hat stays inside the frame.
  const hatted = isHatId(look.hat);
  return (
    <span
      className={`beta-portrait beta-frame--${look.frame} beta-background--${look.background}`}
      role={name ? "img" : undefined}
      aria-label={name}
      aria-hidden={name ? undefined : true}
    >
      <svg viewBox="0 0 100 100" fill="none" aria-hidden="true" focusable="false">
        <g transform={hatted ? "translate(8 14) scale(.84)" : undefined}>
          <Portrait />
          <PortraitHat hat={look.hat} kind={kind} />
        </g>
      </svg>
    </span>
  );
}
