import { useEffect, type RefObject } from "react";

/**
 * Dialog focus management. Before these existed no overlay in the app trapped
 * focus, handled Escape, or restored focus on close — keyboard users could tab
 * straight out of a modal into the page behind it.
 */

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Keep Tab focus inside `ref`, move focus in on mount, and restore it to
 * whatever was focused before on unmount.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  initialFocus?: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const previous = document.activeElement as HTMLElement | null;

    (initialFocus?.current ?? node).focus?.();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === node)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      previous?.focus?.();
    };
  }, [ref, initialFocus]);
}

/** Call `onEscape` when Escape is pressed (no-op when `onEscape` is undefined). */
export function useEscapeKey(onEscape?: () => void): void {
  useEffect(() => {
    if (!onEscape) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onEscape();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onEscape]);
}

/** Depth counter so nested/stacked dialogs don't clobber each other's restore. */
let lockCount = 0;
let savedOverflow = "";

/** Prevent the page behind a dialog from scrolling while it is open. */
export function useBodyScrollLock(): void {
  useEffect(() => {
    if (lockCount === 0) {
      // Preserve whatever the page already set (body carries overflow-x: hidden).
      savedOverflow = document.body.style.overflowY;
      document.body.style.overflowY = "hidden";
    }
    lockCount += 1;
    return () => {
      lockCount -= 1;
      if (lockCount === 0) document.body.style.overflowY = savedOverflow;
    };
  }, []);
}
