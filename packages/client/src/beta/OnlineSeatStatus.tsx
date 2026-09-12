import type { EmoteId } from "@greed/protocol";
import { useEffect, useState } from "react";
import { emoteGlyph } from "../components/EmoteBar.js";
import { useT } from "../i18n/i18n.js";

/** Noninteractive status stays on the seated body, outside the felt's hit corridors. */
export function OnlineSeatStatus({
  connected,
  emote,
}: {
  connected: boolean;
  emote?: { emote: EmoteId; at: number };
}) {
  const t = useT();
  const [expiredAt, setExpiredAt] = useState<number | null>(null);
  useEffect(() => {
    if (!emote) return;
    const timer = window.setTimeout(
      () => setExpiredAt(emote.at),
      Math.max(0, emote.at + 4000 - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [emote]);
  // The lifetime is independent of CSS so reduced motion keeps the same
  // readable static reaction instead of jumping to an invisible final frame.
  const visibleEmote = emote && expiredAt !== emote.at && Date.now() < emote.at + 4000;
  return (
    <span className="scene-seat-status" aria-hidden="true">
      {!connected && (
        <span className="scene-seat-status__offline" title={t("table.offline")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 9a15 15 0 0 1 16-1M6 13a10 10 0 0 1 9-1M9 17a5 5 0 0 1 2-1M12 21h.01M3 3l18 18" />
          </svg>
        </span>
      )}
      {visibleEmote && (
        <span key={emote.at} className="scene-seat-status__emote">
          {emoteGlyph(emote.emote)}
        </span>
      )}
    </span>
  );
}
