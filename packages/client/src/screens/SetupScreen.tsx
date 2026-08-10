import { useState } from "react";
import type { BotPersonality } from "@greed/core";
import { GOAL_DEFAULT } from "@greed/core";
import {
  PERSONALITIES,
  defaultSetup,
  randomPersonality,
  type MatchSetup,
  type SeatSetup,
} from "../game/setup.js";
import { RulesModal } from "../components/RulesModal.js";
import { Button, Modal } from "../ui/index.js";
import { useAuth } from "../game/auth.js";
import { useT } from "../i18n/i18n.js";

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
  const { user } = useAuth();
  const [setup, setSetup] = useState<MatchSetup>(() => {
    const s = defaultSetup();
    // Signed-in players show up under their account username by default.
    if (user) {
      const i = s.seats.findIndex((seat) => !seat.isBot);
      if (i >= 0) s.seats[i] = { ...s.seats[i], name: user.username };
    }
    return s;
  });
  const [showRules, setShowRules] = useState(false);
  const [showRandomBots, setShowRandomBots] = useState(false);
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

  /** Append `count` bot seats, each built by `make` from its bot number. */
  const addBots = (count: number, make: (botNumber: number) => SeatSetup) => {
    setSetup((s) => {
      const room = MAX_SEATS - s.seats.length;
      const n = Math.min(count, room);
      if (n <= 0) return s;
      let botNumber = s.seats.filter((x) => x.isBot).length;
      const added = Array.from({ length: n }, () => make(++botNumber));
      return { ...s, seats: [...s.seats, ...added] };
    });
  };

  const addSeat = () =>
    addBots(1, (n) => ({ name: `Robo ${n}`, isBot: true, personality: "balanced" }));

  const addRandomBots = (count: number) => {
    addBots(count, (n) => ({ name: `Robo ${n}`, isBot: true, personality: randomPersonality() }));
    setShowRandomBots(false);
  };

  const removeSeat = (index: number) => {
    setSetup((s) =>
      s.seats.length <= MIN_SEATS ? s : { ...s, seats: s.seats.filter((_, i) => i !== index) },
    );
  };

  const humanCount = setup.seats.filter((s) => !s.isBot).length;
  const freeSeats = MAX_SEATS - setup.seats.length;

  return (
    <div className="setup">
      <div className="setup__hero">
        <h1 className="setup__logo">GREED</h1>
        <p className="setup__tagline">{t("home.tagline")}</p>
      </div>

      <div className="setup__panel">
        <div className="setup__row setup__row--head">
          <h2>{t("setup.table", { count: setup.seats.length })}</h2>
          <div className="setup__add">
            <button className="btn btn--ghost" onClick={addSeat} disabled={freeSeats <= 0}>
              {t("setup.addPlayer")}
            </button>
            <button
              className="btn btn--ghost"
              onClick={() => setShowRandomBots(true)}
              disabled={freeSeats <= 0}
            >
              {t("setup.addRandomBots")}
            </button>
          </div>
        </div>

        <ul className="seats-config">
          {setup.seats.map((seat, i) => (
            <li key={i} className="seats-config__row seats-config__row--edit">
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

      {showRandomBots && (
        <Modal
          onClose={() => setShowRandomBots(false)}
          title={t("setup.randomBotsTitle")}
          actions={
            <Button variant="ghost" onClick={() => setShowRandomBots(false)}>
              {t("common.cancel")}
            </Button>
          }
        >
          <p className="setup__random-note">{t("setup.randomBotsNote", { free: freeSeats })}</p>
          <div className="setup__random-counts">
            {Array.from({ length: freeSeats }, (_, i) => i + 1).map((n) => (
              <Button key={n} variant="roll" size="lg" onClick={() => addRandomBots(n)}>
                {n}
              </Button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
