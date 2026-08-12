import { useEffect, useState } from "react";
import type { DieValue } from "@greed/core";
import { Die } from "./Die.js";
import { Button, Modal } from "../ui/index.js";
import { useT } from "../i18n/i18n.js";
import { teamName } from "../game/teams.js";

export interface RollOffDisplayEntry {
  name: string;
  dice: number[];
  sum: number;
  /** Side, in a team game — the order alternates sides, so it needs showing. */
  team?: number;
}

interface RollOffViewProps {
  /** Players in the resulting turn order (index 0 goes first, last plays last). */
  entries: RollOffDisplayEntry[];
  /** Local play: called to start once shown. Omit for online (server-driven). */
  onContinue?: () => void;
}

export function RollOffView({ entries, onContinue }: RollOffViewProps) {
  const t = useT();
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setRevealed(true), 1100);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!onContinue) return;
    const t = window.setTimeout(onContinue, 4200);
    return () => clearTimeout(t);
  }, [onContinue]);

  return (
    // No onClose: the roll-off is a timed reveal, not something to dismiss.
    <Modal
      title={t("rolloff.title")}
      size="wide"
      actions={
        onContinue ? (
          <Button variant="roll" onClick={onContinue} disabled={!revealed}>
            {t("common.startGame")}
          </Button>
        ) : (
          <span className="overlay__note">{t("lobby.starting")}</span>
        )
      }
    >
      <p className="rolloff__hint">{t("rolloff.hint")}</p>
      <ul className="rolloff">
        {entries.map((e, i) => {
          const first = i === 0;
          const last = i === entries.length - 1;
          return (
            <li key={i} className="rolloff__row" data-team={e.team}>
              <span className="rolloff__name">
                {e.team !== undefined && (
                  <span className="seat__tag seat__tag--team" data-team={e.team}>
                    {teamName(t, e.team)}
                  </span>
                )}
                {e.name}
                {first && <span className="seat__tag">{t("rolloff.goesFirst")}</span>}
                {last && <span className="seat__tag">{t("rolloff.playsLast")}</span>}
              </span>
              <span className="rolloff__dice">
                {e.dice.map((d, di) => (
                  <Die key={di} value={d as DieValue} rolling={!revealed} size={34} />
                ))}
              </span>
              <span className="rolloff__sum">{revealed ? e.sum : "…"}</span>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
