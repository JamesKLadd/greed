import { useState } from "react";
import { loadSettings, updateSettings, type Settings } from "../game/settings.js";
import { play } from "../game/sfx.js";
import { LOCALES, useI18n } from "../i18n/i18n.js";

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const { t, locale, setLocale } = useI18n();
  const [settings, setSettings] = useState<Settings>(() => loadSettings());

  const patch = (p: Partial<Settings>) => setSettings(updateSettings(p));

  const Toggle = ({
    label,
    hint,
    value,
    onChange,
  }: {
    label: string;
    hint: string;
    value: boolean;
    onChange: (v: boolean) => void;
  }) => (
    <div className="settings-row">
      <div className="settings-row__text">
        <span className="settings-row__label">{label}</span>
        <span className="settings-row__hint">{hint}</span>
      </div>
      <button
        className={`switch${value ? " switch--on" : ""}`}
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
      >
        <span className="switch__knob" />
      </button>
    </div>
  );

  return (
    <div className="setup">
      <div className="setup__hero">
        <h1 className="setup__logo">{t("settings.title")}</h1>
        <p className="setup__tagline">{t("settings.tagline")}</p>
      </div>

      <div className="setup__panel">
        <div className="settings-row">
          <div className="settings-row__text">
            <span className="settings-row__label">{t("settings.language")}</span>
            <span className="settings-row__hint">{t("settings.language.hint")}</span>
          </div>
          <div className="segmented" role="group" aria-label={t("settings.language")}>
            {LOCALES.map((l) => (
              <button
                key={l.code}
                className={
                  locale === l.code ? "segmented__btn segmented__btn--on" : "segmented__btn"
                }
                aria-pressed={locale === l.code}
                onClick={() => setLocale(l.code)}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row__text">
            <span className="settings-row__label">{t("settings.textSize")}</span>
            <span className="settings-row__hint">{t("settings.textSize.hint")}</span>
          </div>
          <div className="segmented" role="group" aria-label={t("settings.textSize")}>
            {(["normal", "large"] as const).map((ts) => (
              <button
                key={ts}
                className={
                  settings.textScale === ts ? "segmented__btn segmented__btn--on" : "segmented__btn"
                }
                aria-pressed={settings.textScale === ts}
                onClick={() => patch({ textScale: ts })}
              >
                {ts === "normal" ? t("settings.textSize.normal") : t("settings.textSize.large")}
              </button>
            ))}
          </div>
        </div>

        <Toggle
          label={t("settings.contrast")}
          hint={t("settings.contrast.hint")}
          value={settings.highContrast}
          onChange={(v) => patch({ highContrast: v })}
        />
        <Toggle
          label={t("settings.colorblind")}
          hint={t("settings.colorblind.hint")}
          value={settings.colorblind}
          onChange={(v) => patch({ colorblind: v })}
        />
        <Toggle
          label={t("settings.motion")}
          hint={t("settings.motion.hint")}
          value={settings.reduceMotion}
          onChange={(v) => patch({ reduceMotion: v })}
        />
        <Toggle
          label={t("settings.guidance")}
          hint={t("settings.guidance.hint")}
          value={settings.showGuidance}
          onChange={(v) => patch({ showGuidance: v })}
        />
        <Toggle
          label={t("settings.turnScore")}
          hint={t("settings.turnScore.hint")}
          value={settings.showTurnScore}
          onChange={(v) => patch({ showTurnScore: v })}
        />
        <Toggle
          label={t("settings.hideCode")}
          hint={t("settings.hideCode.hint")}
          value={settings.hideRoomCode}
          onChange={(v) => patch({ hideRoomCode: v })}
        />

        <div className="settings-row">
          <div className="settings-row__text">
            <span className="settings-row__label">{t("settings.sfx")}</span>
            <span className="settings-row__hint">{Math.round(settings.sfxVolume * 100)}%</span>
          </div>
          <input
            className="slider"
            type="range"
            min={0}
            max={100}
            value={Math.round(settings.sfxVolume * 100)}
            aria-label={t("settings.sfx")}
            onChange={(e) => patch({ sfxVolume: Number(e.target.value) / 100 })}
            onMouseUp={() => play("bank")}
            onKeyUp={() => play("bank")}
          />
        </div>

        <div className="settings-row">
          <div className="settings-row__text">
            <span className="settings-row__label">{t("settings.music")}</span>
            <span className="settings-row__hint">{Math.round(settings.musicVolume * 100)}%</span>
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

        <div className="setup__actions">
          <button className="btn btn--ghost" onClick={onBack}>
            {t("bar.home")}
          </button>
        </div>
      </div>
    </div>
  );
}
