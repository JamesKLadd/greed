import { useId, useRef, type ReactNode } from "react";
import { useT } from "../i18n/i18n.js";
import { useBodyScrollLock, useEscapeKey, useFocusTrap } from "../ui/useFocusTrap.js";

export interface GameMenuDrawerProps {
  children: ReactNode;
  onClose: () => void;
  title: string;
}

export function GameMenuDrawer({ children, onClose, title }: GameMenuDrawerProps) {
  const t = useT();
  const titleId = useId();
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useFocusTrap(drawerRef, closeRef);
  useEscapeKey(onClose);
  useBodyScrollLock();

  return (
    <div
      className="scene-menu-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={drawerRef}
        className="scene-menu"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <button
          ref={closeRef}
          className="scene-menu__close"
          type="button"
          aria-label={t("common.close")}
          onClick={onClose}
        >
          <span aria-hidden="true">×</span>
        </button>
        <h2 className="scene-menu__title" id={titleId}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
