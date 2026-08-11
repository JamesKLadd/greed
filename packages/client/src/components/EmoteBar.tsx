/**
 * Reactions during an online game.
 *
 * A fixed set, chosen so the table stays sociable without opening a channel that
 * would need moderating — this is a game meant to be played with family.
 *
 * It lives behind a small button on the edge of the screen rather than as a
 * permanent strip of six. On a phone the vertical budget is the scarcest thing
 * in the whole layout, and a row of reactions is not worth a permanent band of
 * it — it's the thing you reach for occasionally, not the thing you're reading.
 */

import { useEffect, useRef, useState } from "react";
import { EMOTES, type EmoteId } from "@greed/protocol";
import { useT } from "../i18n/i18n.js";
import type { MsgKey } from "../i18n/i18n.js";

/** The face shown for each reaction. */
export const EMOTE_GLYPH: Record<EmoteId, string> = {
  clap: "👏",
  wow: "😮",
  laugh: "😄",
  think: "🤔",
  unlucky: "😬",
  nice: "👍",
};

export function EmoteBar({ onSend }: { onSend: (emote: EmoteId) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Dismiss on an outside tap or Escape — the popover sits over the table, and
  // being stuck open would cover the seats it's meant to react to.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="emotes" ref={rootRef}>
      <button
        className="emotes__toggle"
        aria-label={t("emote.label")}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        🙂
      </button>
      {open && (
        <div className="emotes__pop" role="group" aria-label={t("emote.label")}>
          {EMOTES.map((id) => (
            <button
              key={id}
              className="emotes__btn"
              title={t(`emote.${id}` as MsgKey)}
              aria-label={t(`emote.${id}` as MsgKey)}
              onClick={() => {
                onSend(id);
                setOpen(false);
              }}
            >
              {EMOTE_GLYPH[id]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
