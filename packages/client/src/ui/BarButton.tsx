import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx.js";

/**
 * A button in the in-game top bar. Below 760px these collapse to icon-only
 * squares — the glyph comes from a `::before` keyed off the `bar-btn--*`
 * modifier, while the label stays in the DOM for screen readers.
 *
 * `name` is required precisely because that modifier is what supplies the
 * glyph: hand-written call sites could (and did) forget it, leaving a button
 * that renders as an empty square on phones.
 */

export type BarButtonName = "menu" | "hints" | "history" | "rules" | "restart";

export interface BarButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  name: BarButtonName;
  /** Toggle state: renders the `on` styling and sets aria-pressed. */
  pressed?: boolean;
  children: ReactNode;
}

export function BarButton({ name, pressed, className, children, ...rest }: BarButtonProps) {
  return (
    <button
      {...rest}
      className={cx(
        "btn",
        "btn--ghost",
        pressed && "btn--on",
        "bar-btn",
        `bar-btn--${name}`,
        className,
      )}
      aria-pressed={pressed}
    >
      {children}
    </button>
  );
}
