import { useEffect, useState } from "react";
import type { DieValue } from "@greed/core";
import { Die } from "./Die.js";
import { useT } from "../i18n/i18n.js";

export interface RollOffDisplayEntry {
  name: string;
  dice: number[];
  sum: number;
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
    <div className="overlay">
      <div className="overlay__card overlay__card--wide">
        <h2 className="overlay__title">{t("rolloff.title")}</h2>
        <p className="rolloff__hint">{t("rolloff.hint")}</p>
        <ul className="rolloff">
          {entries.map((e, i) => {
            const first = i === 0;
            const last = i === entries.length - 1;
            return (
              <li key={i} className="rolloff__row">
                <span className="rolloff__name">
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
        {onContinue ? (
          <div className="overlay__actions">
            <button className="btn btn--roll" onClick={onContinue} disabled={!revealed}>
              {t("common.startGame")}
            </button>
          </div>
        ) : (
          <p className="overlay__note">{t("lobby.starting")}</p>
        )}
      </div>
    </div>
  );
}
