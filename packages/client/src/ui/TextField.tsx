import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { cx } from "./cx.js";

/**
 * Text/number inputs and selects.
 *
 * These consolidate what used to be four divergent treatments — most visibly
 * `.seats-config__name`, a class named for the seat-configuration screen that
 * had been borrowed for every password and email field on the auth screen.
 * The class strings are unchanged for now so adoption is visually neutral;
 * label/description wiring via useId() is new.
 */

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size">;

export interface TextFieldProps extends InputProps {
  label?: ReactNode;
  hint?: ReactNode;
  /** `code` renders the wide-tracked uppercase room-code input. */
  tone?: "default" | "code" | "goal";
}

const TONE_CLASS = {
  default: "seats-config__name",
  code: "seats-config__name join-row__code",
  goal: "setup__goal-input",
} as const;

export function TextField({ label, hint, tone = "default", className, ...rest }: TextFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const input = (
    <input
      {...rest}
      id={rest.id ?? id}
      className={cx(TONE_CLASS[tone], className)}
      aria-describedby={hint != null ? hintId : rest["aria-describedby"]}
    />
  );

  if (label == null && hint == null) return input;

  return (
    <label className="field" htmlFor={rest.id ?? id}>
      {label != null && <span className="field__label">{label}</span>}
      {input}
      {hint != null && (
        <span className="field__hint" id={hintId}>
          {hint}
        </span>
      )}
    </label>
  );
}

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
}

export function SelectField({ label, className, children, ...rest }: SelectFieldProps) {
  const id = useId();
  const select = (
    <select {...rest} id={rest.id ?? id} className={cx("seats-config__diff", className)}>
      {children}
    </select>
  );
  if (label == null) return select;
  return (
    <label className="field" htmlFor={rest.id ?? id}>
      <span className="field__label">{label}</span>
      {select}
    </label>
  );
}
