import type { CSSProperties } from "react";
import type { GameState } from "@greed/core";
import { placings } from "../game/placings.js";
import { seatColor } from "../game/theme.js";
import { teamName } from "../game/teams.js";
import { useI18n } from "../i18n/i18n.js";

/**
 * The running order, down the left of the board.
 *
 * The pods around the table each show one score; reading the race off them
 * means comparing numbers scattered round an oval, and on a crowded table the
 * far pods are the compact ones. This is the same information sorted: who is
 * ahead, and by how much.
 *
 * It is a LEFT RAIL, and the board is a three-column grid with a matching empty
 * gutter on the right — so the felt stays centred on screen whether or not this
 * is showing, instead of sliding sideways at the breakpoint. Below that
 * breakpoint the panel is display:none and the grid collapses to the table
 * alone: a phone has no room for a column beside the oval, and the pods are
 * already legible there.
 *
 * See placings.ts for the ranking itself — including why a team game is placed
 * by side rather than by seat.
 */

interface PlacingsProps {
  state: GameState;
  /** The local viewer's seat, when there is one — marks their line. */
  youId?: string | null;
}

export function Placings({ state, youId }: PlacingsProps) {
  const { t, n } = useI18n();
  const rows = placings(state, youId, (side) => teamName(t, side));
  // Nothing to rank on a one-player table.
  if (rows.length < 2) return null;

  return (
    <aside className="placings" aria-label={t("placings.title")}>
      <h2 className="placings__title">{t("placings.title")}</h2>
      <ol className="placings__list">
        {rows.map((row) => (
          <li
            key={row.key}
            className={[
              "placings__row",
              // Nobody leads a game nobody has scored in — without the floor,
              // an untouched table opens with every line lit gold.
              row.place === 1 && row.score > 0 ? "placings__row--lead" : "",
              row.isYou ? "placings__row--you" : "",
              row.side !== null ? "placings__row--team" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            data-team={row.side ?? undefined}
            // Player lines carry their seat's colour so a line and a pod are
            // recognisably the same player; team lines are tinted by side in CSS.
            style={
              row.seat !== null ? ({ "--seat": seatColor(row.seat) } as CSSProperties) : undefined
            }
          >
            <span className="placings__place">{row.place}</span>
            <span className="placings__who">
              <span className="placings__name">
                {row.name}
                {row.isYou && <span className="placings__you"> {t("common.youParen")}</span>}
              </span>
              {row.members.length > 0 && (
                // A side's line is the score; the seats under it are who put it
                // there, which is the number their own pod shows.
                <span className="placings__members">
                  {row.members.map((m) => (
                    <span key={m.id} className="placings__member">
                      <span className="placings__member-name">{m.name}</span>
                      <span className="placings__member-total">{n(m.total)}</span>
                    </span>
                  ))}
                </span>
              )}
            </span>
            <span className="placings__scores">
              <span className="placings__score">{n(row.score)}</span>
              {row.behind > 0 && (
                <span
                  className="placings__gap"
                  title={t("placings.behind", { points: n(row.behind) })}
                >
                  −{n(row.behind)}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
