import { lazy, Suspense, useState, type CSSProperties } from "react";
import { useBetaActive } from "../beta/BetaContext.js";
const BetaLocker = lazy(() => import("../beta/BetaLocker.js"));
import { Die } from "../components/Die.js";
import { UnlockProgress } from "../components/UnlockProgress.js";
import { equipCosmetic, loadProfile } from "../game/profile.js";
import { syncProfileUp } from "../net/auth.js";
import { DICE_SKINS, TABLE_THEMES, isUnlocked } from "../game/cosmetics.js";
import { AVATARS, isUnlocked as avatarUnlocked } from "../game/avatars.js";
import { seatColor } from "../game/theme.js";
import { cosmeticUnlockProgress } from "../game/unlockProgress.js";
import { useT } from "../i18n/i18n.js";
import type { MsgKey } from "../i18n/i18n.js";
import { Button, Screen } from "../ui/index.js";

export function LockerScreen({ onBack }: { onBack: () => void }) {
  const t = useT();
  const [profile, setProfile] = useState(() => loadProfile());
  const beta = useBetaActive();
  if (beta)
    return (
      <Suspense fallback={null}>
        <BetaLocker onBack={onBack} />
      </Suspense>
    );

  const unlockedCount =
    [...DICE_SKINS, ...TABLE_THEMES].filter((c) => isUnlocked(c, profile)).length +
    AVATARS.filter((a) => avatarUnlocked(a, profile)).length;
  const total = DICE_SKINS.length + TABLE_THEMES.length + AVATARS.length;

  // Structural, not `Cosmetic`: avatars are emoji rather than CSS-variable
  // bundles, so they satisfy this shape without pretending to be cosmetics.
  interface Equippable {
    id: string;
    unlock?: (p: typeof profile) => boolean;
  }

  const section = <T extends Equippable>(
    title: string,
    kind: "dice" | "table" | "avatar",
    items: T[],
    preview: (c: T, index: number) => JSX.Element,
  ) => (
    <>
      <div className="setup__row setup__row--head">
        <h2>{title}</h2>
      </div>
      <ul className="locker-grid">
        {items.map((c, i) => {
          const unlocked = !c.unlock || c.unlock(profile);
          const equipped = unlocked && profile[kind] === c.id;
          return (
            <li key={c.id}>
              <button
                type="button"
                className={[
                  "locker-card",
                  equipped ? "locker-card--equipped" : "",
                  unlocked ? "" : "locker-card--locked",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={!unlocked}
                aria-pressed={equipped}
                onClick={() => {
                  setProfile(equipCosmetic(kind, c.id));
                  void syncProfileUp();
                }}
              >
                {preview(c, i)}
                <span className="locker-name">{t(`cosmetic.${c.id}.name` as MsgKey)}</span>
                {equipped ? (
                  <span className="locker-tag locker-tag--on">{t("locker.equipped")}</span>
                ) : unlocked ? (
                  <span className="locker-tag">{t("locker.tapToEquip")}</span>
                ) : (
                  <>
                    <span className="locker-lock">🔒 {t(`cosmetic.${c.id}.req` as MsgKey)}</span>
                    <UnlockProgress progress={cosmeticUnlockProgress(c.id, profile)} />
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );

  return (
    <Screen
      className="classic-locker"
      title={t("locker.title")}
      tagline={t("locker.tagline", { done: unlockedCount, total })}
    >
      {section(t("locker.dice"), "dice", DICE_SKINS, (c) => (
        <div className="locker-preview locker-preview--dice" style={c.vars as CSSProperties}>
          <Die value={5} size={32} />
          <Die value={3} size={32} />
        </div>
      ))}

      {section(t("locker.table"), "table", TABLE_THEMES, (c) => (
        <div className="locker-preview locker-preview--table" style={c.vars as CSSProperties} />
      ))}

      {section(t("locker.avatars"), "avatar", AVATARS, (a, i) => (
        <div className="locker-preview locker-preview--avatar">
          <span
            className="avatar-disc"
            style={{ "--seat": seatColor(i) } as CSSProperties}
            aria-hidden="true"
          >
            {a.emoji}
          </span>
        </div>
      ))}

      <div className="setup__actions">
        <Button variant="ghost" onClick={onBack}>
          {t("bar.home")}
        </Button>
      </div>
    </Screen>
  );
}
