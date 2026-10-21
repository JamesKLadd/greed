import { useMemo } from "react";
import {
  ADVENT_DOORS,
  ADVENT_LAST_DOOR,
  adventDoorsOpened,
  adventOpenedIn,
  adventSeason,
  adventToday,
} from "../game/advent.js";
import { loadProfile } from "../game/profile.js";
import { AdventItemArt, useAdventItemName } from "../components/AdventItem.js";
import { useI18n, type MsgKey } from "../i18n/i18n.js";
import { Button, Screen } from "../ui/index.js";

/**
 * The advent calendar: twenty-four doors, opened one per finished game or run
 * and never ahead of the date. Open doors show what was behind them; the next
 * one says how to open it; the rest say which day they open on.
 *
 * Outside December the doors show the most a player has ever opened, so the
 * calendar is also the record of what they collected.
 */
export function AdventScreen({ onBack }: { onBack: () => void }) {
  const { t, n } = useI18n();
  const name = useAdventItemName();
  const profile = useMemo(() => loadProfile(), []);
  const now = new Date();
  const season = adventSeason(now);
  const today = adventToday(now);
  const opened = season !== null ? adventOpenedIn(profile, season) : adventDoorsOpened(profile);
  const reachable = today ? today.day : season !== null ? ADVENT_LAST_DOOR : 0;

  return (
    <Screen
      hero={false}
      className="support-screen"
      panelClassName="support-panel advent"
      actions={
        <Button variant="ghost" onClick={onBack}>
          {t("rollData.back")}
        </Button>
      }
    >
      <header className="support-panel__heading">
        <h1>{t("advent.title")}</h1>
        <p className="support-panel__intro">{t("advent.intro")}</p>
      </header>
      <p className="advent__progress" role="status">
        {opened >= ADVENT_LAST_DOOR
          ? t("advent.done")
          : season === null
            ? t("advent.over")
            : t("advent.progress", { opened: n(opened), total: n(ADVENT_LAST_DOOR) })}
      </p>
      <ol className="advent__doors">
        {ADVENT_DOORS.map((door) => {
          const open = door.door <= opened;
          // Behind today's date: openable now, one finished game each, the
          // first of them next.
          const ready = !open && door.door <= reachable;
          const next = ready && door.door === opened + 1;
          const state = open ? "open" : next ? "next" : ready ? "ready" : "shut";
          return (
            <li key={door.door} className={`advent-door advent-door--${state}`}>
              <span className="advent-door__number">{n(door.door)}</span>
              {open ? (
                <>
                  <span className="advent-door__art" aria-hidden="true">
                    <AdventItemArt door={door} size={34} />
                  </span>
                  <span className="advent-door__name">{name(door)}</span>
                  <span className="advent-door__kind">
                    {t(`advent.kind.${door.kind}` as MsgKey)}
                  </span>
                </>
              ) : (
                <span className="advent-door__hint">
                  {next
                    ? t("advent.ready")
                    : ready
                      ? t("advent.waiting")
                      : t("advent.locked", { door: n(door.door) })}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="roll-data__note">{t("advent.catchUp")}</p>
    </Screen>
  );
}
