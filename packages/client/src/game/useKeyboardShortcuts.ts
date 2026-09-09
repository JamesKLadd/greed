import { useEffect } from "react";

interface ShortcutHandlers {
  /** Whether shortcuts are live (false while overlays are open, game over, etc.). */
  enabled: boolean;
  /** Hold or release die `index` (1-5 on the keyboard). Optional. */
  onToggleDie?: (index: number) => void;
  /**
   * True when a dialog OTHER than the turn history owns the keyboard (rules,
   * game over, the roll-off). Suppresses every shortcut, including the history
   * toggle — without this, pressing H inside the rules dialog opened the history
   * panel underneath it. The history dialog itself must not set this, so H still
   * closes an open history.
   */
  blockedByDialog?: boolean;
  canRoll: boolean;
  canBank: boolean;
  onRoll: () => void;
  onBank: () => void;
  /** Toggle the turn-history panel (H). Optional. */
  onToggleHistory?: () => void;
}

/** Elements where a keypress means "type", not "play". */
function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable ||
    el.getAttribute("role") === "textbox"
  );
}

/**
 * Is the player's focus on a die?
 *
 * A die is a real button labelled "tap to hold this die", so a keyboard user
 * tabs to it and presses Enter — and Enter was claimed here for Bank, with
 * preventDefault, so the button never activated. The die could not be held by
 * keyboard at all, and trying ENDED THE TURN. Space was taken by Roll the same
 * way. A focused die keeps its own keys.
 */
function isDie(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && el.classList.contains("die");
}

/**
 * Keyboard controls for a live game:
 *   Space / R → roll,  Enter / B → bank,  1-5 → hold a die,  H → turn history.
 * Ignored while typing in a field, when a modifier is held, or when disabled
 * (which the caller sets false during overlays / other players' turns).
 */
export function useKeyboardShortcuts({
  enabled,
  blockedByDialog = false,
  canRoll,
  canBank,
  onRoll,
  onBank,
  onToggleHistory,
  onToggleDie,
}: ShortcutHandlers): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (isTypingTarget(e.target)) return;
      // A focused die answers Space and Enter itself, the way any button does.
      if (isDie(e.target) && (e.key === " " || e.key === "Enter")) return;
      // Another dialog has the keyboard — let it handle its own keys.
      if (blockedByDialog) return;

      const key = e.key.toLowerCase();

      // The history toggle deliberately sits above the `enabled` check so it
      // works when it isn't your turn, and so H can close an open history.
      if ((key === "h" || key === "?") && onToggleHistory) {
        e.preventDefault();
        onToggleHistory();
        return;
      }

      if (!enabled) return;

      // 1-5 hold or release that die, so the mat is reachable without a mouse
      // and quicker with one. Refused taps are the engine's call, as ever.
      if (onToggleDie && key >= "1" && key <= "5") {
        e.preventDefault();
        onToggleDie(Number(key) - 1);
        return;
      }

      if (key === " " || key === "spacebar" || key === "r") {
        if (canRoll) {
          e.preventDefault();
          onRoll();
        }
        return;
      }
      if (key === "enter" || key === "b") {
        if (canBank) {
          e.preventDefault();
          onBank();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, blockedByDialog, canRoll, canBank, onRoll, onBank, onToggleHistory, onToggleDie]);
}
