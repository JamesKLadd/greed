import type { CSSProperties } from "react";
import type { DieValue, GameState } from "@greed/core";
import { isWinner as isWinningSeat, teamTotal } from "@greed/core";
import { DiceTray } from "./DiceTray.js";
import { seatColor } from "../game/theme.js";
import { resolveAvatar } from "../game/avatars.js";
import { seatSlots, usesCompactSeats } from "./tableGeometry.js";
import { bigBankers, streakFlames } from "../game/flourishes.js";
import { TurnRing } from "./TurnRing.js";
import { useLayoutMode } from "../game/useLayoutMode.js";
import type { EmoteId } from "@greed/protocol";
import { EMOTE_GLYPH } from "./EmoteBar.js";
import { useT } from "../i18n/i18n.js";
import { teamName } from "../game/teams.js";

interface TableViewProps {
  state: GameState;
  rollingIndices: number[];
  isRolling: boolean;
  /** Faces the throw in flight lands on (see useGreed.rollingDice). */
  rollingDice?: DieValue[] | null;
  /** Player id to seat at the bottom-center (the local viewer). Defaults to seat 0. */
  perspectiveId?: string | null;
  /** Live connection status per player id (online only); omit for offline play. */
  presence?: Record<string, boolean>;
  /** Latest reaction per player id (online only). The timestamp is a nonce, so
   *  sending the same emote twice restarts the animation. */
  emotes?: Record<string, { emote: EmoteId; at: number }>;
  /** Equipped avatar id per player id. Anyone missing gets one from their name. */
  avatars?: Record<string, string>;
  /** Countdown for the active seat to start their turn (online only). */
  turnTimer?: { endsAt: number; total: number } | null;
  /** Show the running turn score above the dice (a display setting). */
  showTurnScore?: boolean;
  /** Draw the dice as 3D cubes (a display setting). */
  dice3d?: boolean;
}

/**
 * The players seated around the table, with the dice in the middle.
 *
 * Seat positions come from `seatSlots` (see tableGeometry.ts for the two
 * geometries and why portrait doesn't use the ellipse formula). The perspective
 * player always sits at the bottom, and later turn positions run clockwise from
 * there, so turn order reads the same way round in both layouts.
 */
export function TableView({
  state,
  rollingIndices,
  isRolling,
  rollingDice,
  emotes,
  perspectiveId,
  presence,
  avatars,
  turnTimer,
  showTurnScore = true,
  dice3d = true,
}: TableViewProps) {
  const showPresence = presence != null;
  const t = useT();
  const layout = useLayoutMode();
  const landscape = layout === "wide";
  const goal = state.config.goal;
  const n = state.players.length;
  const leadTotal = Math.max(...state.players.map((p) => p.total));
  // In a team game the side's shared total is what races the goal; a seat's own
  // number stays on its pod as that player's contribution to it.
  const sides = state.teams;
  const sideTotals = sides ? sides.map((_, t) => teamTotal(state, t)) : null;
  const leadSide = sideTotals ? Math.max(...sideTotals) : 0;
  const currentIndex = state.turn.playerIndex;
  // Both flourishes are derived from the state, so every client and spectator
  // in an online game shows the same ones (see flourishes.ts).
  const flames = streakFlames(state.turn);
  const badged = bigBankers(state);
  // Player-list index of whoever acts last in the round order.
  const playsLast = state.order[state.order.length - 1];

  const slots = seatSlots(n, landscape);
  // On a phone every opponent is a disc over a name over a score — that's what
  // keeps a corridor open down the middle for the dice.
  const compact = usesCompactSeats(landscape);

  // Seats follow the turn order (going clockwise), not the player-list order.
  // state.order lists player-list indices in the sequence players take turns.
  const turnPosOf = (playerIndex: number) => state.order.indexOf(playerIndex);
  const found = state.players.findIndex((p) => p.id === perspectiveId);
  // Bottom seat: the local viewer if we have one, otherwise whoever acts first.
  const bottomListIndex = found >= 0 ? found : state.order[0];
  const bottomTurnPos = turnPosOf(bottomListIndex);

  // (There used to be a "whose turn" chip in the middle of the mat. It's gone:
  // the guidance line under the table already says it in a full sentence, and
  // the active seat wears an amber ring. Three ways of saying one thing is two
  // too many on a phone.)

  return (
    <div className="table-stage">
      <div className="felt" data-layout={layout} data-seats={compact ? "compact" : undefined}>
        <div className="felt__seats">
          {state.players.map((p, i) => {
            // rel = 0 is the bottom seat; each later turn sits one step clockwise
            // (i.e. to the left of the one before it) around the table.
            const rel = (turnPosOf(i) - bottomTurnPos + n) % n;
            const slot = slots[rel];

            const isCurrent = i === currentIndex && state.phase !== "game-over";
            // Every member of the winning side is a winner.
            const isWinner = state.phase === "game-over" && isWinningSeat(state, p.id);
            const side = sides ? (p.team as number) : null;
            // One crown per game: the leading side wears it on the scoreboard
            // instead, so four pods don't all sprout the same badge.
            const isLeader = !sides && p.total === leadTotal && p.total > 0;
            const progress = sideTotals && side !== null ? sideTotals[side] : p.total;
            const pct = Math.min(100, (progress / goal) * 100);
            const turnScore = isCurrent ? state.turn.turnScore : 0;
            const isYou = p.id === perspectiveId;
            const color = seatColor(i);
            const online = showPresence ? presence[p.id] !== false : true;
            const offline = showPresence && !p.isBot && !online;
            // "Thinking" = the server is playing this seat (a bot, or a dropped human).
            const thinking = isCurrent && !state.turn.outcome && (p.isBot || offline);
            // The bottom seat keeps the full pod even on a crowded portrait
            // table: it's the one seat you actually read numbers off.
            const isBottom = rel === 0;
            const isCompact = compact && !isBottom;

            const style = {
              "--x": slot.x,
              "--y": slot.y,
              "--ax": slot.ax,
              "--ay": slot.ay,
              "--seat": color,
            } as CSSProperties;

            return (
              <div
                key={p.id}
                className={[
                  "pseat",
                  isBottom ? "pseat--bottom" : "",
                  isCompact ? "pseat--compact" : "",
                  isCurrent ? "pseat--current" : "",
                  isWinner ? "pseat--winner" : "",
                  p.isBot ? "pseat--bot" : "",
                  isYou ? "pseat--you" : "",
                  offline ? "pseat--offline" : "",
                  badged.has(p.id) ? "pseat--rich" : "",
                  playsLast === i ? "pseat--last" : "",
                  side !== null ? "pseat--teamed" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={style}
                data-team={side ?? undefined}
              >
                {/* Banked a thousand or more last turn: the seat wears dollar
                    signs at its corners until they're back on the clock.
                    A plain "$" rather than the 💲 emoji, because the emoji is a
                    fixed green glyph on every platform — against the warm pod
                    it read as muddy, and it can't be recoloured. Text can be
                    gold, which is the colour the rest of this badge speaks. */}
                {badged.has(p.id) && (
                  <span
                    className="pseat__rich"
                    role="img"
                    aria-label={t("aria.bigBank", { name: p.name })}
                  >
                    {["tl", "tr", "bl", "br"].map((corner) => (
                      <span
                        key={corner}
                        className={`pseat__cash pseat__cash--${corner}`}
                        aria-hidden="true"
                      >
                        $
                      </span>
                    ))}
                  </span>
                )}
                {/* Whoever's turn closes the round — the best seat at the table,
                    since you act last knowing everyone else's score. It was only
                    ever named in the endgame banner, by which point it's too
                    late to be worth knowing. */}
                {playsLast === i && (
                  <span className="pseat__last" role="img" aria-label={t("aria.playsLast")}>
                    🏁
                  </span>
                )}
                {emotes?.[p.id] && (
                  // Keyed by timestamp so re-sending the same reaction remounts
                  // the element and replays the pop animation.
                  <span key={emotes[p.id].at} className="pseat__emote" aria-hidden="true">
                    {EMOTE_GLYPH[emotes[p.id].emote]}
                  </span>
                )}
                <div className="pseat__head">
                  <span className="pseat__avatar" aria-hidden="true">
                    {resolveAvatar(p.name, p.isBot, avatars?.[p.id])}
                    {showPresence && (
                      <span className={`pseat__conn${online ? " pseat__conn--on" : ""}`} />
                    )}
                    {isCurrent && turnTimer !== undefined && <TurnRing timer={turnTimer} />}
                  </span>
                  <span className="pseat__name">
                    {isLeader && (
                      <span className="pseat__crown" aria-label={t("aria.leader")}>
                        👑
                      </span>
                    )}
                    {p.name}
                    {isYou && <span className="pseat__you"> {t("common.youParen")}</span>}
                  </span>
                </div>
                {(thinking || offline) && (
                  <div className="pseat__status">
                    {offline ? t("table.offline") : t("table.thinking")}
                  </div>
                )}
                <div className="pseat__meta">
                  <span className="pseat__total">
                    {p.total}
                    {turnScore > 0 && <span className="pseat__turn"> +{turnScore}</span>}
                  </span>
                </div>
                <div className="pseat__bar">
                  <div className="pseat__fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="felt__center">
          {/* What the turn is worth right now, over the dice it is riding on —
              the number you are deciding whether to bank or gamble. Bust zeroes
              the turn score, so this simply disappears when the run ends. */}
          <div className="felt__pot" aria-live="polite">
            {showTurnScore && state.turn.turnScore > 0 && state.phase !== "game-over" && (
              // Keyed by the value so each gain replays the little pop.
              <span key={state.turn.turnScore} className="felt__pot-value">
                {/* Four rolls into a turn and still going: the number catches
                    fire, and gains a flame for every roll after that. */}
                {flames > 0 && (
                  <span
                    className="felt__pot-fire felt__pot-fire--left"
                    aria-label={t("aria.streak", { n: state.turn.rollCount })}
                  >
                    {"🔥".repeat(flames)}
                  </span>
                )}
                +{state.turn.turnScore}
                {flames > 0 && (
                  <span className="felt__pot-fire" aria-hidden="true">
                    {"🔥".repeat(flames)}
                  </span>
                )}
              </span>
            )}
          </div>
          <DiceTray
            turn={state.turn}
            rollingIndices={rollingIndices}
            isRolling={isRolling}
            rollingDice={rollingDice}
            dice3d={dice3d}
          />

          {sideTotals && (
            // The only score that decides a team game, so it gets a row of its
            // own — the pods carry contributions, this carries the match. It
            // sits UNDER the dice, inside the centre corridor the pods already
            // leave clear: anywhere on the mat's edge collides with a seat.
            <div className="felt__teams" aria-live="polite">
              {sideTotals.map((total, side) => (
                <div
                  key={side}
                  className={`teamchip${total === leadSide && total > 0 ? " teamchip--lead" : ""}`}
                  data-team={side}
                >
                  <span className="teamchip__name">{teamName(t, side)}</span>
                  <span className="teamchip__score">{total}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
