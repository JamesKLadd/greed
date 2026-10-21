import { useEffect, useRef, useState } from "react";
import { Die } from "../components/Die.js";
import { UnlockProgress } from "../components/UnlockProgress.js";
import { ACHIEVEMENTS, loadProfile, type Profile } from "../game/profile.js";
import { DICE_SKINS, TABLE_THEMES, isUnlocked } from "../game/cosmetics.js";
import { useT, type MsgKey } from "../i18n/i18n.js";
import { useAuth } from "../game/auth.js";
import { Brand } from "./Brand.js";
import { Mascot } from "./Mascot.js";
import { useAppearance } from "./AppearanceContext.js";
import {
  appearanceVars,
  canEquipAppearance,
  MASCOTS,
  FRAMES,
  BACKGROUNDS,
  NAMEPLATES,
  HATS,
  SAMPLE_DICE,
  SAMPLE_TABLES,
  DEFAULT_APPEARANCE,
  type Appearance,
} from "./appearance.js";
import { CelebrationArt } from "./Celebration.js";
import { CELEBRATION_MS, type CelebrationKind } from "./celebrations.js";
import { playBetaCue } from "../game/sfx.js";
import { achievementUnlockProgress, cosmeticUnlockProgress } from "../game/unlockProgress.js";
import { adventDoorFor } from "../game/advent.js";
import { holidayUnlocker } from "../game/holidayDice.js";

type Category =
  "dice" | "table" | "mascot" | "hat" | "frame" | "background" | "nameplate" | "badge";
export default function BetaLocker({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const { appearance, equip } = useAppearance();
  return (
    <BetaLockerView
      onBack={onBack}
      username={user?.username}
      appearance={appearance}
      profile={loadProfile()}
      onEquip={equip}
    />
  );
}

/** The same locker with explicit data/actions, also used by isolated visual reviews. */
export function BetaLockerView({
  onBack,
  username,
  appearance,
  profile,
  onEquip,
}: {
  onBack: () => void;
  username?: string;
  appearance: Appearance;
  profile: Profile;
  onEquip: (look: Appearance) => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState(appearance);
  const [category, setCategory] = useState<Category>("dice");
  const [owned, setOwned] = useState(false);
  const [compare, setCompare] = useState(false);
  const [sound, setSound] = useState(false);
  const [saved, setSaved] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [effect, setEffect] = useState<{ kind: CelebrationKind; nonce: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const rollTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      clearTimeout(rollTimer.current);
    },
    [],
  );
  const shown = compare ? appearance : draft;
  const allowed = canEquipAppearance(draft, profile);
  const categories: Category[] = [
    "dice",
    "table",
    "mascot",
    "hat",
    "frame",
    "background",
    "nameplate",
    "badge",
  ];
  const label = (id: string) => t(`beta.look.${id}` as MsgKey);
  const items =
    category === "dice"
      ? [...SAMPLE_DICE, ...DICE_SKINS.filter((c) => c.id !== "ivory").map((c) => c.id)]
      : category === "table"
        ? [...SAMPLE_TABLES, ...TABLE_THEMES.filter((c) => c.id !== "classic").map((c) => c.id)]
        : category === "mascot"
          ? [...MASCOTS]
          : category === "hat"
            ? [...HATS]
            : category === "frame"
              ? [...FRAMES]
              : category === "background"
                ? [...BACKGROUNDS]
                : category === "nameplate"
                  ? [...NAMEPLATES]
                  : ["", ...ACHIEVEMENTS.map((a) => a.id)];
  const available = (id: string, kind: Category = category) =>
    canEquipAppearance({ ...DEFAULT_APPEARANCE, [kind]: id }, profile);
  const itemName = (id: string, kind: Category = category) =>
    kind === "badge" || kind === "hat"
      ? id && id !== "none"
        ? t((kind === "badge" ? `ach.${id}.title` : `beta.look.${id}`) as MsgKey)
        : t(kind === "hat" ? "beta.locker.noHat" : "beta.locker.none")
      : (kind === "dice" && DICE_SKINS.some((c) => c.id === id)) ||
          (kind === "table" && TABLE_THEMES.some((c) => c.id === id))
        ? t(`cosmetic.${id}.name` as MsgKey)
        : label(id);
  const requirement = (kind: Category, id: string) => {
    if (kind === "badge") return t(`ach.${id}.desc` as MsgKey);
    if (kind === "hat") {
      const door = adventDoorFor(id);
      if (door !== undefined) return t("advent.requirement", { door });
      const badge = holidayUnlocker(id);
      return badge ? t(`ach.${badge}.desc` as MsgKey) : t("locker.previewSample");
    }
    const cosmetic =
      kind === "dice"
        ? DICE_SKINS.find((c) => c.id === id)
        : kind === "table"
          ? TABLE_THEMES.find((c) => c.id === id)
          : undefined;
    return cosmetic && !isUnlocked(cosmetic, profile)
      ? t(`cosmetic.${id}.req` as MsgKey)
      : t("locker.previewSample");
  };
  const progress = (kind: Category, id: string) =>
    kind === "badge"
      ? achievementUnlockProgress(id, profile)
      : kind === "hat"
        ? adventDoorFor(id) === undefined && holidayUnlocker(id)
          ? achievementUnlockProgress(holidayUnlocker(id)!, profile)
          : null
        : cosmeticUnlockProgress(id, profile);
  const lockedSelections = categories.filter((kind) => !available(draft[kind], kind));
  const preview = (kind: CelebrationKind) => {
    clearTimeout(timer.current);
    setEffect({ kind, nonce: Date.now() });
    if (sound) playBetaCue(kind);
    timer.current = setTimeout(() => setEffect(null), CELEBRATION_MS[kind]);
  };
  const choose = (id: string) => {
    setDraft({ ...draft, [category]: id });
    setCompare(false);
    setSaved(false);
  };
  const badge = ACHIEVEMENTS.find((a) => a.id === shown.badge);
  return (
    <main className="beta-locker">
      <header className="beta-locker__header">
        <button className="btn btn--ghost" onClick={onBack}>
          {t("bar.home")}
        </button>
        <Brand compact />
      </header>
      <div className="beta-section-heading">
        <span>{t("beta.locker.studio")}</span>
      </div>
      <h1>{t("beta.locker.title")}</h1>
      <p className="beta-locker__intro">{t("beta.locker.description")}</p>
      <a className="btn btn--ghost beta-locker__browse" href="#beta-look-collection">
        {t("beta.locker.browse")}
      </a>
      <div className="beta-locker__layout">
        <section
          id="beta-look-preview"
          className="beta-locker__preview"
          aria-label={t("beta.locker.preview")}
        >
          <div className="beta-look-stage" style={appearanceVars(shown)}>
            <span className="beta-look-stage__label">
              {t(compare ? "beta.locker.current" : "beta.locker.preview")}
            </span>
            <div className={`beta-player-card beta-nameplate--${shown.nameplate}`}>
              <Mascot look={shown} />
              <strong>{username ?? t("beta.locker.yourName")}</strong>
              {badge && (
                <small>
                  {badge.icon} {t(`ach.${badge.id}.title` as MsgKey)}
                </small>
              )}
            </div>
            <div className="beta-look-stage__dice">
              {([5, 3, 1] as const).map((v, i) => (
                <Die
                  key={i}
                  value={v}
                  dimensional
                  size={44}
                  rolling={rolling}
                  locked={i === 0 && !rolling}
                />
              ))}
            </div>
            <span className="beta-look-stage__engraving">G / 5 · GREED</span>
            {effect && <CelebrationArt cue={{ kind: effect.kind }} nonce={effect.nonce} />}
          </div>
          <div className="beta-locker__tools">
            <button
              className="btn btn--ghost"
              aria-pressed={compare}
              onClick={() => setCompare(!compare)}
            >
              {t("beta.locker.compare")}
            </button>
            <button
              className="btn btn--ghost"
              disabled={rolling}
              onClick={() => {
                setRolling(true);
                rollTimer.current = setTimeout(() => setRolling(false), 900);
              }}
            >
              {t("beta.locker.roll")}
            </button>
            <button className="btn btn--ghost" onClick={() => preview("hot")}>
              {t("beta.event.hot")}
            </button>
            <button className="btn btn--ghost" onClick={() => preview("five")}>
              {t("beta.event.five")}
            </button>
          </div>
          <label className="beta-demo-sound">
            <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} />
            {t("beta.demoSound")}
          </label>
          <button
            className="btn btn--roll beta-locker__equip"
            disabled={!allowed}
            aria-describedby={
              allowed ? "beta-locker-equip-note" : "beta-locker-equip-note beta-locker-requirements"
            }
            onClick={() => {
              onEquip(draft);
              setSaved(true);
            }}
          >
            {t(saved ? "beta.locker.saved" : "beta.locker.equip")}
          </button>
          <p id="beta-locker-equip-note" className="beta-locker__note" role="status">
            {t(
              !allowed
                ? "beta.locker.locked"
                : saved
                  ? "beta.locker.savedNote"
                  : "beta.locker.equipmentNote",
            )}
          </p>
          {!allowed && (
            <ul id="beta-locker-requirements" className="beta-locker__requirements">
              {lockedSelections.map((kind) => (
                <li key={kind}>
                  <strong>{itemName(draft[kind], kind)}</strong>
                  <span>{requirement(kind, draft[kind])}</span>
                  <UnlockProgress progress={progress(kind, draft[kind])} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <section
          id="beta-look-collection"
          className="beta-locker__collection"
          aria-label={t("beta.locker.collection")}
        >
          <div
            className="beta-locker__categories"
            role="group"
            aria-label={t("beta.locker.categories")}
          >
            {categories.map((c) => (
              <button
                key={c}
                className="btn btn--ghost"
                aria-pressed={category === c}
                aria-controls="beta-category-items"
                onClick={() => setCategory(c)}
              >
                {t(`beta.category.${c}`)}
              </button>
            ))}
          </div>
          <label className="beta-demo-sound">
            <input type="checkbox" checked={owned} onChange={(e) => setOwned(e.target.checked)} />
            {t("beta.locker.available")}
          </label>
          <h2 className="beta-locker__category-title">{t(`beta.category.${category}`)}</h2>
          <div
            id="beta-category-items"
            className="beta-collection-grid"
            role="group"
            aria-label={t(`beta.category.${category}`)}
          >
            {items
              .filter((id) => !owned || available(id))
              .map((id) => {
                const look: Appearance = { ...draft, [category]: id };
                const locked = !available(id);
                return (
                  <button
                    key={id}
                    className="beta-collection-card"
                    aria-pressed={draft[category] === id}
                    onClick={() => choose(id)}
                  >
                    <div
                      className={`beta-collection-card__art beta-collection-card__art--${category}`}
                      style={appearanceVars(look)}
                    >
                      {category === "dice" ? (
                        <Die value={5} size={32} dimensional />
                      ) : category === "table" ? (
                        <span className="beta-table-swatch">G / 5</span>
                      ) : category === "badge" ? (
                        <span className="beta-badge-swatch">
                          {ACHIEVEMENTS.find((a) => a.id === id)?.icon ?? "—"}
                        </span>
                      ) : (
                        <div className={`beta-player-card beta-nameplate--${look.nameplate}`}>
                          <Mascot look={look} />
                          {category === "nameplate" && <strong>GREED</strong>}
                        </div>
                      )}
                    </div>
                    <strong>{itemName(id)}</strong>
                    {draft[category] === id && (
                      <span className="beta-collection-card__selected">
                        ✓ {t("beta.locker.selected")}
                      </span>
                    )}
                    <small>{locked ? t("beta.locker.previewOnly") : t("beta.locker.try")}</small>
                    {locked && (
                      <>
                        <span className="beta-collection-card__requirement">
                          {requirement(category, id)}
                        </span>
                        <UnlockProgress progress={progress(category, id)} />
                      </>
                    )}
                  </button>
                );
              })}
          </div>
          <a className="btn beta-locker__jump" href="#beta-look-preview">
            ↑ {t("beta.locker.preview")}
          </a>
        </section>
      </div>
    </main>
  );
}
