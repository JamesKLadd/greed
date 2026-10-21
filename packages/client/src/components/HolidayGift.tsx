import { useEffect, useState } from "react";
import type { DieValue } from "@greed/core";
import { Die } from "./Die.js";
import { Button, Modal } from "../ui/index.js";
import { DICE_SKINS, diceSkinVars } from "../game/cosmetics.js";
import { holidayForAchievement } from "../game/holidayDice.js";
import { ACHIEVEMENTS, equipCosmetic } from "../game/profile.js";
import { syncProfileUp } from "../net/auth.js";
import { useT, type MsgKey } from "../i18n/i18n.js";

const SHOWN: DieValue[] = [3, 5, 1];
/** Matches --cube-roll-ms, the length of a throw's spin. */
const ROLL_MS = 600;

/**
 * "You've received the holiday dice", shown when a player earns them — by
 * signing in on the day (auth.tsx) or finishing a game or run on it. The dice
 * tumble in wearing the new skin — the shape is the news — with the middle one
 * held, so its lit pips are part of the first look. One tap equips them; the
 * alternative is a trip to the locker most players would never make.
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
  const holiday = holidayForAchievement(id);
  const skin = DICE_SKINS.find((c) => c.id === holiday?.dice);
  if (!gift || !holiday || !skin) return null;
  const dice = t(`cosmetic.${skin.id}.name` as MsgKey);

  return (
    <Modal
      className="holiday-gift"
      onClose={onClose}
      icon={gift.icon}
      title={t(`holiday.${holiday.holiday}.title` as MsgKey)}
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
        {t(`holiday.${holiday.holiday}.body` as MsgKey, { dice })}
      </p>
      <p className="holiday-gift__note">
        🏅 {t(`ach.${gift.id}.title` as MsgKey)} · {t("holiday.rare")}
      </p>
    </Modal>
  );
}
