import { useState } from "react";
import { isMuted, setMuted } from "../game/sfx.js";

/** Toggles game sound on/off; the choice is persisted across sessions. */
export function MuteButton() {
  const [muted, setMutedState] = useState(isMuted());

  const toggle = () => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  };

  return (
    <button
      className="btn btn--ghost btn--icon"
      onClick={toggle}
      aria-pressed={muted}
      aria-label={muted ? "Unmute sound" : "Mute sound"}
      title={muted ? "Sound off" : "Sound on"}
    >
      {muted ? "🔇" : "🔊"}
    </button>
  );
}
