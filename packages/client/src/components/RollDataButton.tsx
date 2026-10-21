import { Button } from "../ui/index.js";
import { useT } from "../i18n/i18n.js";

/** "View Statistical Data": small, centred, at the foot of the screen it serves. */
export function RollDataButton({ onOpen }: { onOpen: () => void }) {
  const t = useT();
  return (
    <div className="roll-data-link">
      <Button variant="ghost" onClick={onOpen}>
        {t("rollData.open")}
      </Button>
    </div>
  );
}
