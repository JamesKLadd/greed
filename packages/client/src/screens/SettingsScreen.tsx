import { useId, useState } from "react";
import { loadSettings, updateSettings, type Settings } from "../game/settings.js";
import { play } from "../game/sfx.js";
import { LOCALES, useI18n } from "../i18n/i18n.js";
import { Button, Screen } from "../ui/index.js";
import { usageEnabled, setUsageEnabled } from "../game/growth.js";

// Keep this component outside the screen: changing a setting must not remount
// the switch and leave keyboard focus behind.
function SettingToggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const hintId = useId();
  return (
    <div className="settings-row settings-row--toggle">
      <div className="settings-row__text">
        <span className="settings-row__label">{label}</span>
        <span className="settings-row__hint" id={hintId}>
          {hint}
        </span>
      </div>
      <button
        className={`switch${value ? " switch--on" : ""}`}
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        aria-describedby={hintId}
        onClick={() => onChange(!value)}
      >
        <span className="switch__knob" />
      </button>
    </div>
  );
}

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const { t, n, locale, setLocale } = useI18n();
  const ids = useId();
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [usage, setUsage] = useState(usageEnabled);
  const patch = (p: Partial<Settings>) => setSettings(updateSettings(p));
  const sfxPercent = Math.round(settings.sfxVolume * 100);
  const musicPercent = Math.round(settings.musicVolume * 100);

  return (
    <Screen
      hero={false}
      className="support-screen"
      panelClassName="support-panel support-settings"
      actions={
        <Button variant="ghost" onClick={onBack}>
          {t("bar.home")}
        </Button>
      }
    >
      <header className="support-panel__heading">
        <h1>{t("settings.title")}</h1>
        <p className="support-panel__intro">{t("settings.tagline")}</p>
      </header>

      <section className="support-section" aria-labelledby={`${ids}-interface`}>
        <h2 id={`${ids}-interface`}>{t("settings.section.interface")}</h2>
        <div className="settings-row settings-row--choice">
          <div className="settings-row__text">
            <span className="settings-row__label">{t("settings.language")}</span>
            <span className="settings-row__hint" id={`${ids}-language-hint`}>
              {t("settings.language.hint")}
            </span>
          </div>
          <div
            className="segmented"
            role="group"
            aria-label={t("settings.language")}
            aria-describedby={`${ids}-language-hint`}
          >
            {LOCALES.map((l) => (
              <button
                key={l.code}
                type="button"
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
        <div className="settings-row settings-row--choice">
          <div className="settings-row__text">
            <span className="settings-row__label">{t("settings.textSize")}</span>
            <span className="settings-row__hint" id={`${ids}-text-hint`}>
              {t("settings.textSize.hint")}
            </span>
          </div>
          <div
            className="segmented"
            role="group"
            aria-label={t("settings.textSize")}
            aria-describedby={`${ids}-text-hint`}
          >
            {(["normal", "large"] as const).map((ts) => (
              <button
                key={ts}
                type="button"
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
        <SettingToggle
          label={t("settings.contrast")}
          hint={t("settings.contrast.hint")}
          value={settings.highContrast}
          onChange={(v) => patch({ highContrast: v })}
        />
        <SettingToggle
          label={t("settings.colorblind")}
          hint={t("settings.colorblind.hint")}
          value={settings.colorblind}
          onChange={(v) => patch({ colorblind: v })}
        />
        <SettingToggle
          label={t("settings.motion")}
          hint={t("settings.motion.hint")}
          value={settings.reduceMotion}
          onChange={(v) => patch({ reduceMotion: v })}
        />
      </section>

      <section className="support-section" aria-labelledby={`${ids}-table`}>
        <h2 id={`${ids}-table`}>{t("settings.section.table")}</h2>
        <SettingToggle
          label={t("settings.guidance")}
          hint={t("settings.guidance.hint")}
          value={settings.showGuidance}
          onChange={(v) => patch({ showGuidance: v })}
        />
        <SettingToggle
          label={t("settings.dice3d")}
          hint={t("settings.dice3d.hint")}
          value={settings.dice3d}
          onChange={(v) => patch({ dice3d: v })}
        />
        <SettingToggle
          label={t("settings.turnScore")}
          hint={t("settings.turnScore.hint")}
          value={settings.showTurnScore}
          onChange={(v) => patch({ showTurnScore: v })}
        />
        <SettingToggle
          label={t("settings.hideCode")}
          hint={t("settings.hideCode.hint")}
          value={settings.hideRoomCode}
          onChange={(v) => patch({ hideRoomCode: v })}
        />
      </section>

      <section className="support-section" aria-labelledby={`${ids}-privacy`}>
        <h2 id={`${ids}-privacy`}>{t("growth.privacy")}</h2>
        <SettingToggle
          label={t("growth.usage")}
          hint={t("growth.usageHint")}
          value={usage}
          onChange={(v) => {
            setUsageEnabled(v);
            setUsage(usageEnabled());
          }}
        />
        <a href="/privacy/" target="_blank" rel="noreferrer">
          {t("growth.privacyDetails")}
        </a>
      </section>

      <section className="support-section" aria-labelledby={`${ids}-audio`}>
        <h2 id={`${ids}-audio`}>{t("settings.section.audio")}</h2>
        <div className="settings-row settings-row--volume">
          <div className="settings-row__text">
            <label className="settings-row__label" htmlFor={`${ids}-sfx`}>
              {t("settings.sfx")}
            </label>
            <span className="settings-row__hint" id={`${ids}-sfx-hint`}>
              {t("settings.sfx.hint")}
            </span>
          </div>
          <div className="settings-volume">
            <input
              id={`${ids}-sfx`}
              className="slider"
              type="range"
              min={0}
              max={100}
              value={sfxPercent}
              aria-describedby={`${ids}-sfx-hint`}
              aria-valuetext={t("settings.volume", { value: n(sfxPercent) })}
              onChange={(e) => patch({ sfxVolume: Number(e.target.value) / 100 })}
              onPointerUp={() => play("bank")}
              onKeyUp={(e) => {
                if (
                  [
                    "ArrowLeft",
                    "ArrowRight",
                    "ArrowUp",
                    "ArrowDown",
                    "Home",
                    "End",
                    "PageUp",
                    "PageDown",
                  ].includes(e.key)
                )
                  play("bank");
              }}
            />
            <output htmlFor={`${ids}-sfx`}>{t("settings.volume", { value: n(sfxPercent) })}</output>
          </div>
        </div>
        <div className="settings-row settings-row--volume">
          <div className="settings-row__text">
            <label className="settings-row__label" htmlFor={`${ids}-music`}>
              {t("settings.music")}
            </label>
            <span className="settings-row__hint" id={`${ids}-music-hint`}>
              {t("settings.music.hint")}
            </span>
          </div>
          <div className="settings-volume">
            <input
              id={`${ids}-music`}
              className="slider"
              type="range"
              min={0}
              max={100}
              value={musicPercent}
              aria-describedby={`${ids}-music-hint`}
              aria-valuetext={t("settings.volume", { value: n(musicPercent) })}
              onChange={(e) => patch({ musicVolume: Number(e.target.value) / 100 })}
            />
            <output htmlFor={`${ids}-music`}>
              {t("settings.volume", { value: n(musicPercent) })}
            </output>
          </div>
        </div>
      </section>
    </Screen>
  );
}
