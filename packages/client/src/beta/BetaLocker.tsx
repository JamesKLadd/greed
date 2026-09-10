import { useEffect, useRef, useState } from "react";
import { Die } from "../components/Die.js";
import { ACHIEVEMENTS, loadProfile } from "../game/profile.js";
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
  SAMPLE_DICE,
  SAMPLE_TABLES,
  DEFAULT_APPEARANCE,
  type Appearance,
} from "./appearance.js";
import { CelebrationArt } from "./Celebration.js";
import { CELEBRATION_MS, type CelebrationKind } from "./celebrations.js";
import { playBetaCue } from "../game/sfx.js";

type Category = "dice" | "table" | "mascot" | "frame" | "background" | "nameplate" | "badge";
export default function BetaLocker({ onBack }: { onBack: () => void }) {
  const t = useT();
  const { user } = useAuth();
  const { appearance, equip } = useAppearance();
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
  const profile = loadProfile();
  const shown = compare ? appearance : draft;
  const allowed = canEquipAppearance(draft, profile);
  const categories: Category[] = [
    "dice",
    "table",
    "mascot",
    "frame",
    "background",
    "nameplate",
    "badge",
  ];
  const label = (id: string) => t(`beta.look.${id}` as MsgKey);
  const items =
    category === "dice"
      ? [...SAMPLE_DICE, ...DICE_SKINS.map((c) => c.id)]
      : category === "table"
        ? [...SAMPLE_TABLES, ...TABLE_THEMES.map((c) => c.id)]
        : category === "mascot"
          ? [...MASCOTS]
          : category === "frame"
            ? [...FRAMES]
            : category === "background"
              ? [...BACKGROUNDS]
              : category === "nameplate"
                ? [...NAMEPLATES]
                : ["", ...ACHIEVEMENTS.map((a) => a.id)];
  const available = (id: string) =>
    canEquipAppearance({ ...DEFAULT_APPEARANCE, [category]: id }, profile);
  const itemName = (id: string) =>
    category === "badge"
      ? id
        ? t(`ach.${id}.title` as MsgKey)
        : t("beta.locker.none")
      : (category === "dice" && DICE_SKINS.some((c) => c.id === id)) ||
          (category === "table" && TABLE_THEMES.some((c) => c.id === id))
        ? t(`cosmetic.${id}.name` as MsgKey)
        : label(id);
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
        <span className="beta-pill">{t("beta.label")}</span>
      </header>
      <div className="beta-section-heading">
        <span>{t("beta.locker.studio")}</span>
        <span>02 / GREED</span>
      </div>
      <h1>{t("beta.locker.title")}</h1>
      <p className="beta-locker__intro">{t("beta.locker.description")}</p>
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
              <strong>{user?.username ?? t("beta.locker.yourName")}</strong>
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
            onClick={() => {
              equip(draft);
              setSaved(true);
            }}
          >
            {t(saved ? "beta.locker.saved" : "beta.locker.equip")}
          </button>
          <p className="beta-locker__note" role="status">
            {t(
              !allowed
                ? "beta.locker.locked"
                : saved
                  ? "beta.locker.savedNote"
                  : "beta.locker.temporary",
            )}
          </p>
        </section>
        <section className="beta-locker__collection" aria-label={t("beta.locker.collection")}>
          <div className="beta-locker__categories" aria-label={t("beta.locker.categories")}>
            {categories.map((c) => (
              <button
                key={c}
                className="btn btn--ghost"
                aria-pressed={category === c}
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
          <div className="beta-collection-grid">
            {items
              .filter((id) => !owned || available(id))
              .map((id) => {
                const look: Appearance = { ...draft, [category]: id };
                const cosmetic = (category === "dice" ? DICE_SKINS : TABLE_THEMES).find(
                  (c) => c.id === id,
                );
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
                    <small>{locked ? t("beta.locker.previewOnly") : t("beta.locker.try")}</small>
                    {locked && (
                      <span className="beta-collection-card__requirement">
                        {cosmetic && !isUnlocked(cosmetic, profile)
                          ? t(`cosmetic.${id}.req` as MsgKey)
                          : category === "badge"
                            ? t(`ach.${id}.desc` as MsgKey)
                            : ""}
                      </span>
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
