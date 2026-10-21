import { ADVENT_DOORS } from "../game/advent.js";
import { equipCosmetic } from "../game/profile.js";
import { syncProfileUp } from "../net/auth.js";
import { useT, type MsgKey } from "../i18n/i18n.js";
import { Button, Modal } from "../ui/index.js";
import { AdventItemArt, useAdventItemName } from "./AdventItem.js";

/**
 * "Door 7 is open!" — what the advent calendar just gave, the moment a game or
 * run opened it. One tap uses it (a hat is worn from the new look's locker,
 * where the character is), or opens the calendar to see the rest.
 */
export function AdventDoorGift({
  door: number,
  onClose,
  onOpenCalendar,
}: {
  door: number;
  onClose: () => void;
  onOpenCalendar?: () => void;
}) {
  const t = useT();
  const name = useAdventItemName();
  const door = ADVENT_DOORS[number - 1];
  if (!door) return null;
  const item = `${name(door)} (${t(`advent.kind.${door.kind}` as MsgKey).toLowerCase()})`;
  return (
    <Modal
      className="holiday-gift advent-gift"
      onClose={onClose}
      icon="🎁"
      title={t("advent.popupTitle", { door: number })}
      actions={
        <>
          {onOpenCalendar && (
            <Button
              variant="ghost"
              onClick={() => {
                onClose();
                onOpenCalendar();
              }}
            >
              {t("advent.view")}
            </Button>
          )}
          {door.kind === "hat" ? (
            <Button variant="roll" size="lg" onClick={onClose}>
              {t("common.close")}
            </Button>
          ) : (
            <Button
              variant="roll"
              size="lg"
              onClick={() => {
                equipCosmetic(door.kind as "dice" | "table" | "avatar", door.id);
                void syncProfileUp();
                onClose();
              }}
            >
              {t("advent.use")}
            </Button>
          )}
        </>
      }
    >
      <div className="advent-gift__art" aria-hidden="true">
        <AdventItemArt door={door} size={72} />
      </div>
      <p className="holiday-gift__lead">{t("advent.popupBody", { item })}</p>
      {door.kind === "hat" && <p className="holiday-gift__note">{t("advent.hatNote")}</p>}
    </Modal>
  );
}
