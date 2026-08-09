/**
 * Reactions during an online game.
 *
 * A fixed set, chosen so the table stays sociable without opening a channel that
 * would need moderating — this is a game meant to be played with family.
 */

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
  return (
    <div className="emotes" role="group" aria-label={t("emote.label")}>
      {EMOTES.map((id) => (
        <button
          key={id}
          className="emotes__btn"
          title={t(`emote.${id}` as MsgKey)}
          aria-label={t(`emote.${id}` as MsgKey)}
          onClick={() => onSend(id)}
        >
          {EMOTE_GLYPH[id]}
        </button>
      ))}
    </div>
  );
}
