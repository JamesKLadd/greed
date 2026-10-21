import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { fetchAccountSuggestions } from "../net/rollStats.js";

/** Long enough that a quick typist sends one request, short enough to feel live. */
const DEBOUNCE_MS = 150;

/**
 * A username box that offers the accounts starting with what has been typed —
 * "j" offers James and Jimmy, "ja" just James — in a list under it. Click a
 * name, or arrow to it and press Enter, to pick it. A combobox in the ARIA
 * sense: the list is announced, the active option is tracked, and Escape
 * closes it. Typing a full name and submitting the form still works without
 * ever touching the list.
 */
export function AccountPicker({
  value,
  onChange,
  onPick,
  label,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onPick: (name: string) => void;
  label: string;
  placeholder: string;
}) {
  const ids = useId();
  const [options, setOptions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // Only the newest request's answer may land: an older, slower one would
  // replace "ja"'s list with "j"'s.
  const latest = useRef(0);

  useEffect(() => {
    const typed = value.trim();
    if (!typed) {
      setOptions([]);
      return;
    }
    const request = ++latest.current;
    const timer = window.setTimeout(() => {
      void fetchAccountSuggestions(typed).then((names) => {
        if (request !== latest.current) return;
        setOptions(names);
        setActive(-1);
      });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [value]);

  const shown = open && options.length > 0;
  const pick = (name: string) => {
    onChange(name);
    setOpen(false);
    setActive(-1);
    onPick(name);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (options.length === 0) return;
      e.preventDefault();
      setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + options.length) % options.length);
      return;
    }
    // Enter on a highlighted name picks it; otherwise the form submits as typed.
    if (e.key === "Enter" && shown && active >= 0) {
      e.preventDefault();
      pick(options[active]);
    }
  };

  return (
    <div className="account-picker">
      <label htmlFor={`${ids}-input`}>{label}</label>
      <input
        id={`${ids}-input`}
        role="combobox"
        aria-expanded={shown}
        aria-controls={`${ids}-list`}
        aria-autocomplete="list"
        aria-activedescendant={shown && active >= 0 ? `${ids}-opt-${active}` : undefined}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // Closing waits a beat so a click on an option lands first.
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={64}
      />
      {shown && (
        <ul id={`${ids}-list`} role="listbox" className="account-picker__list">
          {options.map((name, i) => (
            <li
              key={name}
              id={`${ids}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className="account-picker__option"
              // mousedown, not click: it lands before the input loses focus.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(name);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
