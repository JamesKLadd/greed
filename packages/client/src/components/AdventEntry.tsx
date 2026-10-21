import { ADVENT_LAST_DOOR, adventOpenedIn, adventSeason } from "../game/advent.js";
import { loadProfile } from "../game/profile.js";
import { useI18n } from "../i18n/i18n.js";

/** Home's way into the advent calendar, in December only, with how far along it is. */
export function AdventEntry({ onOpen }: { onOpen: () => void }) {
  const { t, n } = useI18n();
  const year = adventSeason();
  if (year === null) return null;
  const opened = adventOpenedIn(loadProfile(), year);
  return (
    <button type="button" className="advent-entry" onClick={onOpen}>
      <span className="advent-entry__icon" aria-hidden="true">
        🎁
      </span>
      <span className="advent-entry__copy">
        <strong>{t("advent.title")}</strong>
        <small>
          {opened >= ADVENT_LAST_DOOR
            ? t("advent.done")
            : t("advent.progress", { opened: n(opened), total: n(ADVENT_LAST_DOOR) })}
        </small>
      </span>
      <span className="advent-entry__arrow" aria-hidden="true">
        →
      </span>
    </button>
  );
}
