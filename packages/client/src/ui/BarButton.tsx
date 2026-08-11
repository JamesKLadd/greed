import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx.js";
import { Icon, type IconName } from "./Icon.js";

/**
 * A button in the in-game top bar: icon plus label, where the label is hidden
 * (but still announced) below 760px so all of them fit across a phone.
 *
 * `name` is required and drives the icon, so a call site cannot render a bar
 * button with no glyph — which is exactly what happened when this markup was
 * hand-written and the online screen's leave button lost its modifier class.
 */

export type BarButtonName = "menu" | "history" | "rules" | "restart";

const ICONS: Record<BarButtonName, IconName> = {
  menu: "back",
  history: "scroll",
  rules: "book",
  restart: "refresh",
};

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
      <Icon name={ICONS[name]} />
      <span className="bar-btn__label">{children}</span>
    </button>
  );
}
