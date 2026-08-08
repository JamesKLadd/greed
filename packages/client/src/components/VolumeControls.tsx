import { useEffect, useRef, useState } from "react";
import { loadSettings, updateSettings, type Settings } from "../game/settings.js";
import { play, isMuted, setMuted } from "../game/sfx.js";
import { useT } from "../i18n/i18n.js";

/**
 * In-game sound control: a speaker button (reflecting mute state) that opens a
 * popover with the sound-effects and music sliders plus a Mute toggle. Reads and
 * writes the same persisted settings as the Settings screen, so changes apply
 * live and stick across sessions.
 */
export function VolumeControls() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [muted, setMutedState] = useState(isMuted());
  const ref = useRef<HTMLDivElement>(null);

  const patch = (p: Partial<Settings>) => setSettings(updateSettings(p));
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  };

  // Close the popover when clicking outside it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <div className="volume" ref={ref}>
      <button
        className={open ? "btn btn--ghost btn--icon btn--on" : "btn btn--ghost btn--icon"}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={t("bar.volume")}
        title={t("bar.volume")}
      >
        {muted ? "🔇" : "🔊"}
      </button>

      {open && (
        <div className="volume__pop" role="group" aria-label={t("bar.volume")}>
          <div className="volume__row">
            <div className="volume__labels">
              <span className="volume__label">{t("settings.sfx")}</span>
              <span className="volume__pct">{Math.round(settings.sfxVolume * 100)}%</span>
            </div>
            <input
              className="slider"
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.sfxVolume * 100)}
              aria-label={t("settings.sfx")}
              onChange={(e) => patch({ sfxVolume: Number(e.target.value) / 100 })}
              onMouseUp={() => !muted && play("bank")}
              onKeyUp={() => !muted && play("bank")}
            />
          </div>

          <div className="volume__row">
            <div className="volume__labels">
              <span className="volume__label">{t("settings.music")}</span>
              <span className="volume__pct">{Math.round(settings.musicVolume * 100)}%</span>
            </div>
            <input
              className="slider"
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.musicVolume * 100)}
              aria-label={t("settings.music")}
              onChange={(e) => patch({ musicVolume: Number(e.target.value) / 100 })}
            />
          </div>

          <button
            className={muted ? "btn btn--bank volume__mute volume__mute--on" : "btn volume__mute"}
            role="switch"
            aria-checked={muted}
            onClick={toggleMute}
          >
            {muted ? `🔇 ${t("volume.unmute")}` : `🔊 ${t("volume.mute")}`}
          </button>
        </div>
      )}
    </div>
  );
}
