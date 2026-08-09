import { useId, useRef, type ReactNode, type RefObject } from "react";
import { cx } from "./cx.js";
import { useBodyScrollLock, useEscapeKey, useFocusTrap } from "./useFocusTrap.js";

/**
 * The one dialog. Replaces four independently hand-written `.overlay` blocks
 * that had drifted apart (two closed on backdrop click, two didn't) and none of
 * which were reachable or escapable by keyboard.
 *
 * Dismissal policy: a dialog is dismissible IFF it is given `onClose`. Rules and
 * turn-history pass one (Escape + backdrop both work); game-over and the
 * roll-off don't, so a terminal state can't be dismissed by a stray click. The
 * old inconsistency is now intentional and encoded in one place.
 *
 * Deliberately NOT rendered through a portal: `.overlay` is `position: fixed`,
 * so it already escapes layout, and the dice inside these dialogs inherit the
 * equipped cosmetic custom properties from the `.game` subtree. Portalling to
 * document.body would silently revert every dialog's dice to the ivory default.
 */

export interface ModalProps {
  /** Omit to make the dialog non-dismissible (no backdrop click, no Escape). */
  onClose?: () => void;
  title?: ReactNode;
  /** Rendered above the title — the 🏆/🏁 game-over crown slot. */
  icon?: ReactNode;
  size?: "md" | "wide";
  /** Cap the height and scroll the body (long content: rules, history). */
  scroll?: boolean;
  /** Focus this instead of the dialog itself on open. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Footer action row. */
  actions?: ReactNode;
  children: ReactNode;
}

export function Modal({
  onClose,
  title,
  icon,
  size = "md",
  scroll = false,
  initialFocusRef,
  actions,
  children,
}: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useFocusTrap(cardRef, initialFocusRef);
  useEscapeKey(onClose);
  useBodyScrollLock();

  return (
    <div className="overlay" onClick={onClose}>
      <div
        ref={cardRef}
        className={cx(
          "overlay__card",
          size === "wide" && "overlay__card--wide",
          scroll && "overlay__card--scroll",
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title != null ? titleId : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {icon != null && <div className="overlay__crown">{icon}</div>}
        {title != null && (
          <h2 className="overlay__title" id={titleId}>
            {title}
          </h2>
        )}
        {children}
        {actions != null && <div className="overlay__actions">{actions}</div>}
      </div>
    </div>
  );
}
