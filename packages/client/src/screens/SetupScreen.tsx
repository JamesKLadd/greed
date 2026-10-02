import { useState } from "react";
import type { BotPersonality } from "@greed/core";
import {
  PERSONALITIES,
  defaultSetup,
  defaultTeam,
  newSeatId,
  randomPersonality,
  rebalanceTeams,
  teamsAvailable,
  teamsBalanced,
  type MatchSetup,
  type SeatSetup,
} from "../game/setup.js";
import { RulesModal } from "../components/RulesModal.js";
import { Button, Modal, Screen } from "../ui/index.js";
import { useAuth } from "../game/auth.js";
import { useI18n } from "../i18n/i18n.js";
import { teamName } from "../game/teams.js";
import { useBetaActive } from "../beta/BetaContext.js";
import { MIN_SETUP_GOAL, MAX_SETUP_GOAL, normalizeSetupGoal } from "../game/setupGoal.js";

const GOALS = [1000, 2000, 3000, 5000];
const MAX_SEATS = 8;
const MIN_SEATS = 2;

interface SetupScreenProps {
  onStart: (setup: MatchSetup) => void;
  onBack: () => void;
}

export function SetupScreen({ onStart, onBack }: SetupScreenProps) {
  const { t, n } = useI18n();
  const beta = useBetaActive();
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
    addBots(1, (n) => ({
      id: newSeatId(),
      name: `Robo ${n}`,
      isBot: true,
      personality: "balanced",
      team: defaultTeam(setup.seats.length),
    }));

  const addRandomBots = (count: number) => {
    addBots(count, (n) => ({
      id: newSeatId(),
      name: `Robo ${n}`,
      isBot: true,
      personality: randomPersonality(),
      team: defaultTeam(setup.seats.length + n - 1),
    }));
    setShowRandomBots(false);
  };

  const removeSeat = (index: number) => {
    setSetup((s) =>
      s.seats.length <= MIN_SEATS ? s : { ...s, seats: s.seats.filter((_, i) => i !== index) },
    );
  };

  const humanCount = setup.seats.filter((s) => !s.isBot).length;
  const freeSeats = MAX_SEATS - setup.seats.length;
  // Retain the stored sides while changing seats, but never start an invalid table as teams.
  const canTeam = teamsAvailable(setup.seats.length);
  const teamsOn = setup.teams && canTeam;
  const balanced = teamsBalanced(setup.seats);
  const goal = normalizeSetupGoal(goalText);
  const start = () => {
    if (teamsOn && !balanced) return;
    setGoal(goal);
    onStart({ ...setup, goal, teams: teamsOn });
  };

  return (
    <div className="setup-lobby">
      <Screen hero={!beta} tagline={t("home.tagline")} panelClassName="setup-lobby__panel">
        <header className="setup-lobby__header">
          {beta ? <h1>{t("home.local")}</h1> : <h2>{t("home.local")}</h2>}
          <p>{t("home.local.sub")}</p>
        </header>
        <section className="setup-lobby__section" aria-labelledby="setup-seats-heading">
          <h3 id="setup-seats-heading">{t("setup.table", { count: setup.seats.length })}</h3>
          <div className="setup-lobby__add">
            <Button variant="ghost" onClick={addSeat} disabled={freeSeats <= 0}>
              {t("setup.addPlayer")}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setShowRandomBots(true)}
              disabled={freeSeats <= 0}
            >
              {t("setup.addRandomBots")}
            </Button>
          </div>
          {freeSeats === 0 && (
            <p className="setup-lobby__note" role="status">
              {t("setup.tableFull")}
            </p>
          )}

          <ul className="setup-lobby__seats">
            {setup.seats.map((seat, i) => (
              <li key={seat.id} className="setup-lobby__seat">
                <div className="setup-lobby__seat-head">
                  <label htmlFor={`setup-seat-${seat.id}`}>{t("setup.seat", { n: i + 1 })}</label>
                  <button
                    type="button"
                    className="setup-lobby__remove"
                    onClick={() => removeSeat(i)}
                    disabled={setup.seats.length <= MIN_SEATS}
                    aria-label={t("setup.aria.removeSeat", { n: i + 1 })}
                    aria-describedby={
                      setup.seats.length <= MIN_SEATS ? "setup-minimum-seats" : undefined
                    }
                  >
                    ✕
                  </button>
                </div>
                <input
                  id={`setup-seat-${seat.id}`}
                  className="seats-config__name"
                  value={seat.name}
                  maxLength={16}
                  onChange={(e) => updateSeat(i, { name: e.target.value })}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  enterKeyHint="done"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                  }}
                  aria-label={t("setup.aria.seatName", { n: i + 1 })}
                />
                <div
                  className="segmented setup-lobby__type"
                  role="group"
                  aria-label={t("setup.aria.seatType", { n: i + 1 })}
                >
                  <button
                    type="button"
                    aria-pressed={!seat.isBot}
                    className={!seat.isBot ? "segmented__btn segmented__btn--on" : "segmented__btn"}
                    onClick={() => updateSeat(i, { isBot: false })}
                  >
                    {t("common.human")}
                  </button>
                  <button
                    type="button"
                    aria-pressed={seat.isBot}
                    className={seat.isBot ? "segmented__btn segmented__btn--on" : "segmented__btn"}
                    onClick={() => updateSeat(i, { isBot: true })}
                  >
                    {t("common.bot")}
                  </button>
                </div>
                {seat.isBot && (
                  <label className="setup-lobby__personality">
                    <span>{t("setup.temperament")}</span>
                    <select
                      className="seats-config__diff"
                      value={seat.personality}
                      onChange={(e) =>
                        updateSeat(i, { personality: e.target.value as BotPersonality })
                      }
                      aria-label={t("setup.aria.seatPersonality", { n: i + 1 })}
                    >
                      {PERSONALITIES.map((p) => (
                        <option key={p} value={p}>
                          {t(`pers.${p}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {teamsOn && (
                  <div
                    className="segmented seats-config__team"
                    role="group"
                    aria-label={t("setup.aria.seatTeam", { n: i + 1 })}
                  >
                    {[0, 1].map((side) => (
                      <button
                        type="button"
                        key={side}
                        aria-pressed={seat.team === side}
                        className={
                          seat.team === side
                            ? "segmented__btn segmented__btn--on"
                            : "segmented__btn"
                        }
                        data-team={side}
                        onClick={() => updateSeat(i, { team: side })}
                      >
                        {teamName(t, side)}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {setup.seats.length === MIN_SEATS && (
            <p id="setup-minimum-seats" className="setup-lobby__note">
              {t("setup.minimumSeats")}
            </p>
          )}
          <p className="setup-lobby__note">{t("setup.botNote")}</p>
        </section>

        <section className="setup-lobby__section" aria-labelledby="setup-sides-heading">
          <h3 id="setup-sides-heading">{t("setup.teams")}</h3>
          <div
            className="segmented setup-lobby__sides"
            role="group"
            aria-labelledby="setup-sides-heading"
          >
            <button
              type="button"
              aria-pressed={!teamsOn}
              className={!teamsOn ? "segmented__btn segmented__btn--on" : "segmented__btn"}
              onClick={() => setSetup((s) => ({ ...s, teams: false }))}
            >
              {t("setup.freeForAll")}
            </button>
            <button
              type="button"
              aria-pressed={teamsOn}
              disabled={!canTeam}
              aria-describedby={!canTeam ? "setup-teams-unavailable" : undefined}
              className={teamsOn ? "segmented__btn segmented__btn--on" : "segmented__btn"}
              onClick={() =>
                // Snapping to alternating sides on the way in means the common
                // case never needs the per-seat pickers at all.
                setSetup((s) => ({
                  ...s,
                  teams: true,
                  seats: teamsBalanced(s.seats) ? s.seats : rebalanceTeams(s.seats),
                }))
              }
            >
              {canTeam
                ? t("setup.teamsOn", { size: setup.seats.length / 2 })
                : t("setup.teamsOption")}
            </button>
          </div>
          {!canTeam && (
            <p id="setup-teams-unavailable" className="setup-lobby__note">
              {t("setup.teamsUnavailable")}
            </p>
          )}
          {teamsOn && !balanced && (
            <button
              className="btn btn--ghost setup__rebalance"
              type="button"
              onClick={() => setSetup((s) => ({ ...s, seats: rebalanceTeams(s.seats) }))}
            >
              {t("setup.rebalance")}
            </button>
          )}
        </section>

        <section className="setup-lobby__section" aria-labelledby="setup-goal-heading">
          <h3 id="setup-goal-heading">{t("common.goal")}</h3>
          <div
            className="segmented setup-lobby__goals"
            role="group"
            aria-labelledby="setup-goal-heading"
          >
            {GOALS.map((g) => (
              <button
                type="button"
                key={g}
                aria-pressed={goalText === String(g)}
                className={
                  goalText === String(g) ? "segmented__btn segmented__btn--on" : "segmented__btn"
                }
                onClick={() => setGoal(g)}
              >
                {n(g)}
              </button>
            ))}
          </div>
          <label className="setup__goal-custom setup-lobby__custom">
            <span className="setup__goal-label">{t("setup.custom")}</span>
            <input
              className="setup__goal-input"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              enterKeyHint="done"
              value={goalText}
              onChange={(e) => setGoalText(e.target.value)}
              onBlur={() => setGoal(normalizeSetupGoal(goalText))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
              aria-describedby="setup-goal-note"
              aria-label={t("setup.aria.customGoal")}
            />
          </label>
          <p id="setup-goal-note" className="setup-lobby__note">
            {t("setup.goalNote", { min: n(MIN_SETUP_GOAL), max: n(MAX_SETUP_GOAL) })}
          </p>
        </section>

        <section className="setup-lobby__start">
          <p className="setup-lobby__summary">
            {t("setup.summary", { count: setup.seats.length, goal: n(goal) })}
          </p>
          {teamsOn && !balanced && (
            <p className="setup-lobby__warning" id="setup-unbalanced" role="status">
              {t("setup.unbalanced")}
            </p>
          )}
          <Button
            variant="roll"
            size="lg"
            className="setup-lobby__start-button"
            onClick={start}
            disabled={teamsOn && !balanced}
            aria-describedby={teamsOn && !balanced ? "setup-unbalanced" : undefined}
          >
            {humanCount === 0 ? t("setup.watchBots") : t("common.startGame")}
          </Button>
          <div className="setup-lobby__utilities">
            <Button variant="ghost" onClick={onBack}>
              {t("bar.home")}
            </Button>
            <Button variant="ghost" onClick={() => setShowRules(true)}>
              {t("home.howToPlay")}
            </Button>
          </div>
        </section>

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
      </Screen>
    </div>
  );
}
