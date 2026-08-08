import { useEffect } from "react";

interface ShortcutHandlers {
  /** Whether shortcuts are live (false while overlays are open, game over, etc.). */
  enabled: boolean;
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

      const key = e.key.toLowerCase();

      // History toggle works whenever shortcuts are live, regardless of turn.
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
  }, [enabled, canRoll, canBank, onRoll, onBank, onToggleHistory]);
}
