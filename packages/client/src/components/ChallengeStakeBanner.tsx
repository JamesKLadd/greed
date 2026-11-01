import { Die } from "./Die.js";
import { DICE_SKINS, diceSkinVars } from "../game/cosmetics.js";
import { holidayForTrophy } from "../game/holidayDice.js";
import type { ChallengeKind } from "../game/challengeStake.js";
import { useT, type MsgKey } from "../i18n/i18n.js";

/**
 * The prize on the line, kept in view in the lobby for the whole day or week:
 * the popup says it once, and a player who dismissed it — or returns on
 * Thursday — still needs to know what the board is for. A gold die in the
 * prize's own skin, the dice by name, and what it takes to win them. Tapping
 * it brings the popup back for the full story.
 */
export function ChallengeStakeBanner({
  trophy,
  kind,
  onOpen,
}: {
  trophy: string;
  kind: ChallengeKind;
  onOpen: () => void;
}) {
  const t = useT();
  const set = holidayForTrophy(trophy);
  const skin = DICE_SKINS.find((c) => c.id === set?.goldDice);
  if (!set || !skin) return null;
  const dice = t(`cosmetic.${skin.id}.name` as MsgKey);
  const event = t(`holiday.event.${set.holiday}` as MsgKey);
  return (
    <button
      type="button"
      className={`stake-banner stake-banner--${set.holiday}`}
      onClick={onOpen}
      aria-haspopup="dialog"
    >
      <span className="stake-banner__die" style={diceSkinVars(skin)} aria-hidden="true">
        <Die value={5} size={40} dimensional locked />
      </span>
      <span className="stake-banner__body">
        <strong className="stake-banner__title">{t("holiday.stake.title", { dice })}</strong>
        <span className="stake-banner__sub">
          {t(kind === "daily" ? "holiday.stake.bannerDaily" : "holiday.stake.bannerWeekly", {
            event,
          })}
        </span>
      </span>
      <span className="stake-banner__more" aria-hidden="true">
        ›
      </span>
    </button>
  );
}
