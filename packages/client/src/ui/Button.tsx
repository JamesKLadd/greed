import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx.js";

/**
 * The one button. Every variant/size combination the app uses is expressed
 * here, so restyling buttons is a change to `.btn` in primitives.css rather than
 * an edit across ~55 call sites.
 *
 * The emitted class strings intentionally match what the screens hand-wrote
 * before this component existed, so adopting it changes no pixels.
 */

export type ButtonVariant = "secondary" | "ghost" | "roll" | "bank";
export type ButtonSize = "md" | "lg" | "icon";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  secondary: "",
  ghost: "btn--ghost",
  roll: "btn--roll",
  bank: "btn--bank",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  md: "",
  lg: "btn--big",
  icon: "btn--icon",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Toggle state: renders the `on` styling and sets aria-pressed. */
  pressed?: boolean;
  /** A pending action: keep the label, show feedback, and prevent duplicate presses. */
  loading?: boolean;
  /** Secondary line under the label (the tall home-menu buttons). */
  subLabel?: ReactNode;
  children: ReactNode;
}

export function Button({
  variant = "secondary",
  size = "md",
  pressed,
  loading = false,
  disabled,
  subLabel,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={cx(
        "btn",
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        pressed && "btn--on",
        loading && "btn--loading",
        className,
      )}
      aria-pressed={pressed}
      aria-busy={loading || rest["aria-busy"]}
      disabled={disabled || loading}
    >
      {loading && <span className="btn__spinner" aria-hidden="true" />}
      {children}
      {subLabel != null && <span className="home-menu__sub">{subLabel}</span>}
    </button>
  );
}
