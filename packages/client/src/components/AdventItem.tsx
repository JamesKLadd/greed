import type { CSSProperties } from "react";
import type { AdventDoor } from "../game/advent.js";
import { AVATARS } from "../game/avatars.js";
import { DICE_SKINS, TABLE_THEMES, diceSkinVars } from "../game/cosmetics.js";
import { HatSwatch, isHatId } from "../beta/characters/Hats.js";
import { useT, type MsgKey } from "../i18n/i18n.js";
import { Die } from "./Die.js";

/** What is behind a door, by name: "Candy Cane dice", "the Elf Hat". */
export function useAdventItemName(): (door: AdventDoor) => string {
  const t = useT();
  return (door) =>
    door.kind === "hat"
      ? t(`beta.look.${door.id}` as MsgKey)
      : t(`cosmetic.${door.id}.name` as MsgKey);
}

/** A picture of what is behind a door: the dice, the felt, the face or the hat. */
export function AdventItemArt({ door, size = 40 }: { door: AdventDoor; size?: number }) {
  if (door.kind === "dice") {
    const skin = DICE_SKINS.find((c) => c.id === door.id);
    return skin ? (
      <span className="advent-art advent-art--dice" style={diceSkinVars(skin)}>
        <Die value={5} size={Math.round(size * 0.8)} dimensional />
      </span>
    ) : null;
  }
  if (door.kind === "table") {
    const felt = TABLE_THEMES.find((c) => c.id === door.id);
    return felt ? (
      <span
        className="advent-art advent-art--felt"
        style={{ ...(felt.vars as CSSProperties), width: size, height: size * 0.7 }}
      />
    ) : null;
  }
  if (door.kind === "avatar") {
    return (
      <span className="advent-art advent-art--face" style={{ fontSize: size * 0.8 }}>
        {AVATARS.find((a) => a.id === door.id)?.emoji}
      </span>
    );
  }
  return isHatId(door.id) ? (
    <span className="advent-art advent-art--hat" style={{ width: size, height: size }}>
      <HatSwatch hat={door.id} />
    </span>
  ) : null;
}
