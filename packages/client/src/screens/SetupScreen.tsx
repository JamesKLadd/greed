import { useState } from "react";
import type { BotDifficulty, BotPersonality } from "@greed/core";
import { GOAL_DEFAULT } from "@greed/core";
import { defaultSetup, type MatchSetup, type SeatSetup } from "../game/setup.js";
import { RulesModal } from "../components/RulesModal.js";
import { useT } from "../i18n/i18n.js";

const DIFFICULTIES: BotDifficulty[] = ["easy", "medium", "hard", "expert"];
const PERSONALITIES: BotPersonality[] = ["cautious", "balanced", "reckless"];
const GOALS = [1000, 2000, 3000, 5000];
const MIN_GOAL = 500;
const MAX_GOAL = 100000;
const MAX_SEATS = 8;
const MIN_SEATS = 2;

/** Snap a custom goal into a sane range, rounded to the nearest 50. */
function clampGoal(n: number): number {
  if (!Number.isFinite(n)) return GOAL_DEFAULT;
  return Math.min(MAX_GOAL, Math.max(MIN_GOAL, Math.round(n / 50) * 50));
}

interface SetupScreenProps {
  onStart: (setup: MatchSetup) => void;
  onBack: () => void;
}

export function SetupScreen({ onStart, onBack }: SetupScreenProps) {
  const t = useT();
  const [setup, setSetup] = useState<MatchSetup>(() => defaultSetup());
  const [showRules, setShowRules] = useState(false);
  const [goalText, setGoalText] = useState(() => String(setup.goal));

  const setGoal = (g: number) => {
    setSetup((s) => ({ ...s, goal: g }));
    setGoalText(String(g));
  };

  const updateSeat = (index: number, patch: Partial<SeatSetup>) => {
    setSetup((s) => ({
      ...s,
      seats: s.seats.map((seat, i) => (i === index ? { ...seat, ...patch } : seat)),
    }));
  };

  const addSeat = () => {
    setSetup((s) =>
      s.seats.length >= MAX_SEATS
        ? s
        : {
            ...s,
            seats: [
              ...s.seats,
              {
                name: `Robo ${s.seats.filter((x) => x.isBot).length + 1}`,
                isBot: true,
                difficulty: "medium",
                personality: "balanced",
              },
            ],
          },
    );
  };

  const removeSeat = (index: number) => {
    setSetup((s) =>
      s.seats.length <= MIN_SEATS ? s : { ...s, seats: s.seats.filter((_, i) => i !== index) },
    );
  };

  const humanCount = setup.seats.filter((s) => !s.isBot).length;

  return (
    <div className="setup">
      <div className="setup__hero">
        <h1 className="setup__logo">GREED</h1>
        <p className="setup__tagline">{t("home.tagline")}</p>
      </div>

      <div className="setup__panel">
        <div className="setup__row setup__row--head">
          <h2>{t("setup.table", { count: setup.seats.length })}</h2>
          <button
            className="btn btn--ghost"
            onClick={addSeat}
            disabled={setup.seats.length >= MAX_SEATS}
          >
            {t("setup.addPlayer")}
          </button>
        </div>

        <ul className="seats-config">
          {setup.seats.map((seat, i) => (
            <li key={i} className="seats-config__row">
              <span className="seats-config__num">{i + 1}</span>
              <input
                className="seats-config__name"
                value={seat.name}
                maxLength={16}
                onChange={(e) => updateSeat(i, { name: e.target.value })}
                aria-label={t("setup.aria.seatName", { n: i + 1 })}
              />
              <div className="segmented">
                <button
                  className={!seat.isBot ? "segmented__btn segmented__btn--on" : "segmented__btn"}
                  onClick={() => updateSeat(i, { isBot: false })}
                >
                  {t("common.human")}
                </button>
                <button
                  className={seat.isBot ? "segmented__btn segmented__btn--on" : "segmented__btn"}
                  onClick={() => updateSeat(i, { isBot: true })}
                >
                  {t("common.bot")}
                </button>
              </div>
              <select
                className="seats-config__diff"
                value={seat.difficulty}
                disabled={!seat.isBot}
                onChange={(e) => updateSeat(i, { difficulty: e.target.value as BotDifficulty })}
                aria-label={t("setup.aria.seatDifficulty", { n: i + 1 })}
              >
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>
                    {t(`diff.${d}`)}
                  </option>
                ))}
              </select>
              <select
                className="seats-config__diff"
                value={seat.personality}
                disabled={!seat.isBot}
                onChange={(e) => updateSeat(i, { personality: e.target.value as BotPersonality })}
                aria-label={t("setup.aria.seatPersonality", { n: i + 1 })}
              >
                {PERSONALITIES.map((p) => (
                  <option key={p} value={p}>
                    {t(`pers.${p}`)}
                  </option>
                ))}
              </select>
              <button
                className="seats-config__remove"
                onClick={() => removeSeat(i)}
                disabled={setup.seats.length <= MIN_SEATS}
                aria-label={t("setup.aria.removeSeat", { n: i + 1 })}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>

        <div className="setup__row">
          <span className="setup__label">{t("common.goal")}</span>
          <div className="segmented">
            {GOALS.map((g) => (
              <button
                key={g}
                className={
                  setup.goal === g ? "segmented__btn segmented__btn--on" : "segmented__btn"
                }
                onClick={() => setGoal(g)}
              >
                {g}
              </button>
            ))}
          </div>
          <label className="setup__goal-custom">
            <span className="setup__goal-label">{t("setup.custom")}</span>
            <input
              className="setup__goal-input"
              type="number"
              inputMode="numeric"
              min={MIN_GOAL}
              max={MAX_GOAL}
              step={50}
              value={goalText}
              onChange={(e) => {
                setGoalText(e.target.value);
                const v = parseInt(e.target.value, 10);
                if (Number.isFinite(v)) setSetup((s) => ({ ...s, goal: v }));
              }}
              onBlur={() => setGoal(clampGoal(parseInt(goalText, 10)))}
              aria-label={t("setup.aria.customGoal")}
            />
          </label>
        </div>

        <div className="setup__actions">
          <button className="btn btn--ghost" onClick={onBack}>
            {t("bar.home")}
          </button>
          <button className="btn btn--ghost" onClick={() => setShowRules(true)}>
            {t("home.howToPlay")}
          </button>
          <button className="btn btn--roll btn--big" onClick={() => onStart(setup)}>
            {humanCount === 0 ? t("setup.watchBots") : t("common.startGame")}
          </button>
        </div>
      </div>

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  );
}
