import { useEffect, useState, type CSSProperties } from "react";
import type { DieValue } from "@greed/core";
import { Die } from "./Die.js";
import { Button, Modal } from "../ui/index.js";
import { DICE_SKINS, TABLE_THEMES, diceSkinVars } from "../game/cosmetics.js";
import { AVATARS } from "../game/avatars.js";
import { holidayForAchievement, holidayForTrophy } from "../game/holidayDice.js";
import { HatSwatch, isHatId } from "../beta/characters/Hats.js";
import { ACHIEVEMENTS, equipCosmetic } from "../game/profile.js";
import { syncProfileUp } from "../net/auth.js";
import { useT, type MsgKey } from "../i18n/i18n.js";

const SHOWN: DieValue[] = [3, 5, 1];
/** Matches --cube-roll-ms, the length of a throw's spin. */
const ROLL_MS = 600;

/**
 * "You've received the holiday set", shown when a player earns a holiday's
 * badge — by signing in on the day (auth.tsx) or finishing a game or run on it
 * — or wins its trophy. The dice tumble in wearing the new skin — the shape is
 * the news — with the middle one held, so its lit pips are part of the first
 * look, and the rest of the set is laid out underneath: the Classic face, the
 * new look's hat and the felt. One tap equips the dice; the alternative is a
 * trip to the locker most players would never make.
 *
 * A trophy shows the gold dice instead, and no set: the set was the badge's.
 */
export function HolidayGift({ gift: id, onClose }: { gift: string; onClose: () => void }) {
  const t = useT();
  // Set down, thrown, landed: a die only spins when it goes from resting to
  // rolling, so it has to be on the felt for a moment before it is thrown.
  const [phase, setPhase] = useState<"set" | "thrown" | "landed">("set");
  useEffect(() => {
    const thrown = window.setTimeout(() => setPhase("thrown"), 80);
    const landed = window.setTimeout(() => setPhase("landed"), 80 + ROLL_MS);
    return () => {
      window.clearTimeout(thrown);
      window.clearTimeout(landed);
    };
  }, []);
  const gift = ACHIEVEMENTS.find((a) => a.id === id);
  const trophy = holidayForTrophy(id);
  const set = trophy ?? holidayForAchievement(id);
  const skin = DICE_SKINS.find((c) => c.id === (trophy ? set?.goldDice : set?.dice));
  if (!gift || !set || !skin) return null;
  const dice = t(`cosmetic.${skin.id}.name` as MsgKey);
  const event = t(`holiday.event.${set.holiday}` as MsgKey);
  const felt = TABLE_THEMES.find((c) => c.id === set.table);
  const face = AVATARS.find((a) => a.id === set.avatar);

  return (
    <Modal
      className="holiday-gift"
      onClose={onClose}
      icon={gift.icon}
      title={
        trophy ? t("holiday.trophy.title", { event }) : t(`holiday.${set.holiday}.title` as MsgKey)
      }
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("holiday.later")}
          </Button>
          <Button
            variant="roll"
            size="lg"
            onClick={() => {
              equipCosmetic("dice", skin.id);
              void syncProfileUp();
              onClose();
            }}
          >
            {t("holiday.equip")}
          </Button>
        </>
      }
    >
      <div className="holiday-gift__dice" style={diceSkinVars(skin)} aria-hidden="true">
        {SHOWN.map((v, i) => (
          <Die
            key={i}
            value={v}
            size={i === 1 ? 64 : 52}
            dimensional
            rolling={phase === "thrown"}
            locked={phase === "landed" && i === 1}
          />
        ))}
      </div>
      <p className="holiday-gift__lead">
        {trophy
          ? t("holiday.trophy.body", { event, dice })
          : t(`holiday.${set.holiday}.body` as MsgKey, { dice })}
      </p>
      {!trophy && face && felt && isHatId(set.hat) && (
        <>
          <p className="holiday-gift__set-title">{t("holiday.set")}</p>
          <ul className="holiday-gift__set">
            <li>
              <span className="holiday-gift__piece holiday-gift__piece--face" aria-hidden="true">
                {face.emoji}
              </span>
              <span className="holiday-gift__kind">{t("holiday.piece.avatar")}</span>
              <strong>{t(`cosmetic.${face.id}.name` as MsgKey)}</strong>
            </li>
            <li>
              <span className="holiday-gift__piece" aria-hidden="true">
                <HatSwatch hat={set.hat} />
              </span>
              <span className="holiday-gift__kind">{t("holiday.piece.hat")}</span>
              <strong>{t(`beta.look.${set.hat}` as MsgKey)}</strong>
            </li>
            <li>
              <span
                className="holiday-gift__piece holiday-gift__piece--felt"
                style={felt.vars as CSSProperties}
                aria-hidden="true"
              />
              <span className="holiday-gift__kind">{t("holiday.piece.table")}</span>
              <strong>{t(`cosmetic.${felt.id}.name` as MsgKey)}</strong>
            </li>
          </ul>
        </>
      )}
      <p className="holiday-gift__note">
        {trophy
          ? `🏆 ${t(`ach.${gift.id}.title` as MsgKey)}`
          : `🏅 ${t(`ach.${gift.id}.title` as MsgKey)} · ${t("holiday.rare")}`}
      </p>
    </Modal>
  );
}
