import type { CSSProperties, ReactNode } from "react";
import type { DieValue, GameState, LegalActions } from "@greed/core";
import type { EmoteId } from "@greed/protocol";
import { TableView } from "../components/TableView.js";
import { Placings } from "../components/Placings.js";
import { ActionBar } from "../components/ActionBar.js";
import { GuidanceLine } from "../components/GuidanceLine.js";
import { Toast } from "../components/Toast.js";
import type { ToastMessage } from "../game/toasts.js";
import { loadSettings } from "../game/settings.js";
import { useT } from "../i18n/i18n.js";

/**
 * The in-game screen's layout, shared by offline and online play.
 *
 * A fixed-height column: top bar, banners, the table (which absorbs whatever
 * room is left), the guidance line, then the two action buttons pinned to the
 * bottom edge. Everything mode-specific arrives as a slot — the bar's buttons,
 * the overlays, the spectator bar — so the two callers hold their differences
 * and nothing else.
 */

interface GameShellProps {
  state: GameState;
  legal: LegalActions;
  isRolling: boolean;
  rollingIndices: number[];
  rollingDice?: DieValue[] | null;
  canAct: boolean;
  onRoll: () => void;
  onBank: () => void;
  toast: ToastMessage | null;

  /** Equipped cosmetics, applied as inline custom properties on the root. */
  cosmetics?: CSSProperties;
  /** Which seat sits at the bottom of the table. */
  perspectiveId?: string | null;
  presence?: Record<string, boolean>;
  emotes?: Record<string, { emote: EmoteId; at: number }>;
  avatars?: Record<string, string>;
  turnTimer?: { endsAt: number; total: number } | null;

  /** A message about the connection, shown above the game's own banners. */
  notice?: ReactNode;
  /** Top bar: the leave/menu button, and the utility buttons on the right. */
  barLeft: ReactNode;
  barRight: ReactNode;
  /** Wordmark, or the wordmark plus a room code. */
  barTitle: ReactNode;
  /** Shown instead of the action buttons for a read-only watcher. */
  spectating?: boolean;
  /** Floating extras positioned over the board (the reactions button). */
  floating?: ReactNode;
  /** Modals: roll-off, game over, rules, history. */
  overlays?: ReactNode;
}

export function GameShell({
  state,
  legal,
  isRolling,
  rollingIndices,
  rollingDice,
  canAct,
  onRoll,
  onBank,
  toast,
  cosmetics,
  perspectiveId,
  presence,
  emotes,
  avatars,
  turnTimer,
  notice,
  barLeft,
  barRight,
  barTitle,
  spectating = false,
  floating,
  overlays,
}: GameShellProps) {
  const t = useT();
  const lastPlayer = state.players[state.order[state.order.length - 1]];
  // Read per render rather than once on mount, so coming back from Settings
  // takes effect immediately instead of on the next game.
  const { showGuidance, showTurnScore, dice3d } = loadSettings();

  return (
    <div className="game" style={cosmetics}>
      <header className="game__bar">
        {barLeft}
        {barTitle}
        <div className="game__bar-right">{barRight}</div>
      </header>

      {notice}

      {state.endgame.triggered && state.phase === "playing" && (
        <div className="banner banner--final">
          {t("banner.finalRoundPre")}
          <strong>{lastPlayer.name}</strong>
          {t("banner.finalRoundPost")}
        </div>
      )}
      {state.phase === "sudden-death" && (
        <div className="banner banner--sd">{t("banner.suddenDeath")}</div>
      )}

      <main className="game__main game__main--table">
        {/* The running order in the left gutter, the table in the middle, and a
            matching empty gutter on the right so the felt stays centred on
            screen rather than shifting when the rail appears. */}
        <div className="game__board">
          <Placings state={state} youId={perspectiveId} />

          <TableView
            state={state}
            rollingIndices={rollingIndices}
            isRolling={isRolling}
            rollingDice={rollingDice}
            perspectiveId={perspectiveId}
            presence={presence}
            emotes={emotes}
            avatars={avatars}
            turnTimer={turnTimer}
            showTurnScore={showTurnScore}
            dice3d={dice3d}
          />
        </div>

        <GuidanceLine state={state} canAct={canAct} muted={!showGuidance} />

        {spectating ? (
          <div className="spectator-bar">{t("spectate.watching")}</div>
        ) : (
          <ActionBar
            state={state}
            legal={legal}
            isRolling={isRolling}
            canAct={canAct}
            onRoll={onRoll}
            onBank={onBank}
          />
        )}
      </main>

      {floating}
      <Toast toast={toast} />
      {overlays}
    </div>
  );
}
