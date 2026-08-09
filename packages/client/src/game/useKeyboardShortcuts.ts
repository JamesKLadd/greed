import { useEffect } from "react";

interface ShortcutHandlers {
  /** Whether shortcuts are live (false while overlays are open, game over, etc.). */
  enabled: boolean;
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
 * Keyboard controls for a live game:
 *   Space / R → roll,  Enter / B → bank,  H → toggle turn history.
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
}: ShortcutHandlers): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (isTypingTarget(e.target)) return;
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
  }, [enabled, blockedByDialog, canRoll, canBank, onRoll, onBank, onToggleHistory]);
}
