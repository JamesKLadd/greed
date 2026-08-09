import { useState, type CSSProperties } from "react";
import { Die } from "../components/Die.js";
import { equipCosmetic, loadProfile } from "../game/profile.js";
import { syncProfileUp } from "../net/auth.js";
import { DICE_SKINS, TABLE_THEMES, isUnlocked, type Cosmetic } from "../game/cosmetics.js";
import { useT } from "../i18n/i18n.js";
import type { MsgKey } from "../i18n/i18n.js";

export function LockerScreen({ onBack }: { onBack: () => void }) {
  const t = useT();
  const [profile, setProfile] = useState(() => loadProfile());

  const unlockedCount = [...DICE_SKINS, ...TABLE_THEMES].filter((c) =>
    isUnlocked(c, profile),
  ).length;
  const total = DICE_SKINS.length + TABLE_THEMES.length;

  const section = (
    title: string,
    kind: "dice" | "table",
    items: Cosmetic[],
    preview: (c: Cosmetic) => JSX.Element,
  ) => (
    <>
      <div className="setup__row setup__row--head">
        <h2>{title}</h2>
      </div>
      <ul className="locker-grid">
        {items.map((c) => {
          const unlocked = isUnlocked(c, profile);
          const equipped = profile[kind] === c.id;
          return (
            <li
              key={c.id}
              className={[
                "locker-card",
                equipped ? "locker-card--equipped" : "",
                unlocked ? "" : "locker-card--locked",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={
                unlocked
                  ? () => {
                      setProfile(equipCosmetic(kind, c.id));
                      void syncProfileUp();
                    }
                  : undefined
              }
              role={unlocked ? "button" : undefined}
              aria-disabled={!unlocked}
            >
              {preview(c)}
              <span className="locker-name">{t(`cosmetic.${c.id}.name` as MsgKey)}</span>
              {equipped ? (
                <span className="locker-tag locker-tag--on">{t("locker.equipped")}</span>
              ) : unlocked ? (
                <span className="locker-tag">{t("locker.tapToEquip")}</span>
              ) : (
                <span className="locker-lock">🔒 {t(`cosmetic.${c.id}.req` as MsgKey)}</span>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );

  return (
    <div className="setup">
      <div className="setup__hero">
        <h1 className="setup__logo">{t("locker.title")}</h1>
        <p className="setup__tagline">{t("locker.tagline", { done: unlockedCount, total })}</p>
      </div>

      <div className="setup__panel">
        {section(t("locker.dice"), "dice", DICE_SKINS, (c) => (
          <div className="locker-preview locker-preview--dice" style={c.vars as CSSProperties}>
            <Die value={5} size={32} />
            <Die value={3} size={32} />
          </div>
        ))}

        {section(t("locker.table"), "table", TABLE_THEMES, (c) => (
          <div className="locker-preview locker-preview--table" style={c.vars as CSSProperties} />
        ))}

        <div className="setup__actions">
          <button className="btn btn--ghost" onClick={onBack}>
            {t("bar.home")}
          </button>
        </div>
      </div>
    </div>
  );
}
