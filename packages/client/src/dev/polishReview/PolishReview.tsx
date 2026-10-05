import { useLayoutEffect, useMemo, useState } from "react";
import { applyAction, getLegalActions, isWinner, type GameState } from "@greed/core";
import { BetaActiveContext, useBetaActive } from "../../beta/BetaContext.js";
import { LocalTableGame, type SceneOverlay } from "../../beta/LocalTableGame.js";
import { appearanceVars, DEFAULT_APPEARANCE } from "../../beta/appearance.js";
import { canActOnline } from "../../beta/onlineScene.js";
import { GameOver } from "../../components/GameOver.js";
import { SetupScreen } from "../../screens/SetupScreen.js";
import { GameShell } from "../../screens/GameShell.js";
import { ACHIEVEMENTS, summarize } from "../../game/profile.js";
import { teamsAvailable, type MatchSetup } from "../../game/setup.js";
import { useI18n } from "../../i18n/i18n.js";
import { Button } from "../../ui/index.js";
import { createPolishMatch, createPolishSetup, createPolishTableEvent } from "./polishFixtures.js";
import "./polishReview.css";

const VARIANTS = [
  "local",
  "solo-win",
  "solo-loss",
  "win",
  "loss",
  "host",
  "voted",
  "waiting",
  "spectator",
] as const;
type Variant = (typeof VARIANTS)[number];
const STAGES = ["initial", "decision", "hot", "bank", "bust", "final"] as const;
type Stage = (typeof STAGES)[number];
type Screen = "choose" | "setup" | "results" | "table";

function ReviewTable({
  initial,
  online,
  offline,
  spectator,
  reconnecting,
  clock,
  onBack,
}: {
  initial: GameState;
  online: boolean;
  offline: boolean;
  spectator: boolean;
  reconnecting: boolean;
  clock: boolean;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const beta = useBetaActive();
  const Layout = beta ? LocalTableGame : GameShell;
  const [state, setState] = useState(initial);
  const [overlay, setOverlay] = useState<SceneOverlay>(null);
  const [clockTimer] = useState(() => ({
    // TurnRing expects a performance.now deadline. Keep this DEV sample at
    // 20/30 seconds so screenshots do not depend on capture timing or expire.
    get endsAt() {
      return performance.now() + 20000;
    },
    total: 30000,
  }));
  const youId = state.players[0].id;
  const presence = Object.fromEntries(state.players.map((p) => [p.id, true]));
  if (offline) presence[state.players[state.turn.playerIndex].id] = false;
  const canAct = online
    ? canActOnline(state, youId, spectator, reconnecting) && !offline
    : state.phase !== "game-over";
  return (
    <Layout
      state={state}
      legal={getLegalActions(state)}
      isRolling={false}
      rollingIndices={[]}
      canAct={canAct}
      online={online}
      roomCode="REVIEW"
      presence={presence}
      spectating={spectator}
      turnTimer={
        online && clock && state.turn.rollCount === 0 && !state.turn.outcome ? clockTimer : null
      }
      notice={
        reconnecting ? <div className="banner banner--sd">{t("net.reconnecting")}</div> : undefined
      }
      onRoll={() => setState((s) => applyAction(s, { type: "ROLL" }))}
      onBank={() => setState((s) => applyAction(s, { type: "BANK" }))}
      onToggleDie={(index) => setState((s) => applyAction(s, { type: "TOGGLE_LOCK", index }))}
      toast={null}
      cosmetics={appearanceVars(DEFAULT_APPEARANCE)}
      perspectiveId={youId}
      sceneOverlay={overlay}
      onSceneOverlay={setOverlay}
      barTitle={<h1 className="game__logo">GREED</h1>}
      barLeft={
        <button className="tp-icon" onClick={onBack} aria-label="Back to polish review">
          ←
        </button>
      }
      barRight={
        <>
          {beta && <p>Isolated sample: no server, recording or progression writes.</p>}
          <Button
            size={beta ? "md" : "icon"}
            aria-label="Reset sample"
            onClick={() => {
              setState(initial);
              setOverlay(null);
            }}
          >
            {beta ? "Reset sample" : "↻"}
          </Button>
          {beta && <Button onClick={onBack}>Choose another sample</Button>}
        </>
      }
    />
  );
}

/** Real production screens with isolated callbacks, and core-generated match data. */
export default function PolishReview() {
  const { t, locale, setLocale } = useI18n();
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const [screen, setScreen] = useState<Screen>(() => {
    const requested = params.get("screen");
    return ["setup", "results", "table"].includes(requested ?? "")
      ? (requested as Screen)
      : "choose";
  });
  const [beta, setBeta] = useState(!params.has("classic"));
  const [count, setCount] = useState(() =>
    Math.max(2, Math.min(8, Math.trunc(Number(params.get("players"))) || 4)),
  );
  const [teams, setTeams] = useState(params.has("teams"));
  const [stress, setStress] = useState(params.has("stress"));
  const [variant, setVariant] = useState<Variant>(
    () => VARIANTS.find((v) => v === params.get("variant")) ?? "local",
  );
  const [stage, setStage] = useState<Stage>(
    () => STAGES.find((v) => v === params.get("stage")) ?? "decision",
  );
  const [online, setOnline] = useState(params.has("online"));
  const [offline, setOffline] = useState(params.has("offline"));
  const [spectator, setSpectator] = useState(params.has("spectator"));
  const [reconnecting, setReconnecting] = useState(params.has("reconnecting"));
  const [clock, setClock] = useState(params.has("clock"));
  const [voted, setVoted] = useState(variant === "voted");
  const [selection, setSelection] = useState<string | null>(null);
  const [started, setStarted] = useState<MatchSetup | null>(null);
  const setup = useMemo(
    () => createPolishSetup(count, teams && teamsAvailable(count), stress, online),
    [count, teams, stress, online],
  );
  const match = useMemo(() => {
    if (screen !== "results") return createPolishMatch(setup);
    // Online samples have only human seats. Solo samples replay the same legal
    // script with the selected winner/loser as the sole human, not a bot id
    // handed to an online client as its own identity.
    const humans = { ...setup, seats: setup.seats.map((seat) => ({ ...seat, isBot: false })) };
    const sample = createPolishMatch(humans);
    if (!variant.startsWith("solo")) return sample;
    const index = sample.completed.players.findIndex(
      (p) => isWinner(sample.completed, p.id) === (variant === "solo-win"),
    );
    return createPolishMatch({
      ...humans,
      seats: humans.seats.map((seat, i) => ({ ...seat, isBot: i !== index })),
    });
  }, [setup, variant, screen]);
  const win = match.completed.players.find((p) => isWinner(match.completed, p.id))!;
  const loss = match.completed.players.find((p) => !isWinner(match.completed, p.id))!;
  const personal = ["solo-win", "solo-loss", "win", "loss", "host", "voted", "waiting"].includes(
    variant,
  );
  const youId = ["loss", "solo-loss", "waiting"].includes(variant) ? loss.id : win.id;
  const tableState = useMemo(() => {
    if (stage === "initial") return match.initial;
    if (stage === "final") return match.finalRound ?? match.completed;
    const event = stage === "decision" ? "score" : stage;
    return createPolishTableEvent(event, setup);
  }, [stage, match, setup]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.dataset.presentation;
    root.dataset.presentation = beta ? "beta" : "classic";
    return () => {
      if (previous === undefined) delete root.dataset.presentation;
      else root.dataset.presentation = previous;
    };
  }, [beta]);

  const choose = (action: string) => {
    setSelection(action);
    setScreen("choose");
  };
  const controls = (
    <section className="polish-review__controls" aria-label="Polish sample controls">
      <p>No real games, profiles, challenge attempts or accounts are changed by these samples.</p>
      <p role="status">Selected action: {selection ?? "None"}</p>
      <label>
        Presentation
        <select
          value={beta ? "beta" : "classic"}
          onChange={(e) => setBeta(e.target.value === "beta")}
        >
          <option value="beta">Visual beta</option>
          <option value="classic">Classic</option>
        </select>
      </label>
      <label>
        Language
        <select value={locale} onChange={(e) => setLocale(e.target.value as typeof locale)}>
          <option value="en">English</option>
          <option value="es">Español</option>
          <option value="fr">Français</option>
        </select>
      </label>
      <label>
        Players
        <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
          {[2, 3, 4, 5, 6, 7, 8].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>
          <input
            type="checkbox"
            checked={teams}
            disabled={!teamsAvailable(count)}
            onChange={(e) => setTeams(e.target.checked)}
          />{" "}
          Teams (4 or 6 players)
        </span>
      </label>
      <label>
        <span>
          <input type="checkbox" checked={stress} onChange={(e) => setStress(e.target.checked)} />{" "}
          Long names
        </span>
      </label>
      <label>
        Results scenario
        <select
          value={variant}
          onChange={(e) => {
            setVariant(e.target.value as Variant);
            setVoted(e.target.value === "voted");
          }}
        >
          {VARIANTS.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label>
        Table state
        <select value={stage} onChange={(e) => setStage(e.target.value as Stage)}>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>
          <input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} />{" "}
          Online presentation
        </span>
      </label>
      <label>
        <span>
          <input type="checkbox" checked={offline} onChange={(e) => setOffline(e.target.checked)} />{" "}
          Active seat disconnected
        </span>
      </label>
      <label>
        <span>
          <input
            type="checkbox"
            checked={spectator}
            onChange={(e) => setSpectator(e.target.checked)}
          />{" "}
          Spectator
        </span>
      </label>
      <label>
        <span>
          <input
            type="checkbox"
            checked={reconnecting}
            onChange={(e) => setReconnecting(e.target.checked)}
          />{" "}
          Reconnecting notice
        </span>
      </label>
      <label>
        <span>
          <input type="checkbox" checked={clock} onChange={(e) => setClock(e.target.checked)} />
          Stable clock (online, before the first roll)
        </span>
      </label>
      <Button variant="roll" onClick={() => setScreen("setup")}>
        Review local setup
      </Button>{" "}
      <Button variant="roll" onClick={() => setScreen("results")}>
        Review results
      </Button>{" "}
      <Button variant="roll" onClick={() => setScreen("table")}>
        Review table state
      </Button>
      <p>
        <a href="?table-events">Animated table events</a>
        <a
          href={`?table-play&players=${count}${teams && teamsAvailable(count) ? "&teams" : ""}${stress ? "&stress" : ""}`}
        >
          Playable local table
        </a>
        <a href="/">Return to game</a>
      </p>
      {started && (
        <pre className="polish-review__receipt" aria-label="Reviewed setup">
          {JSON.stringify(started, null, 2)}
        </pre>
      )}
    </section>
  );

  return (
    <BetaActiveContext.Provider value={beta}>
      {screen === "setup" ? (
        <>
          <SetupScreen
            onStart={(s) => {
              setStarted(s);
              choose("Start game (configuration captured only)");
            }}
            onBack={() => choose("Back from setup")}
          />
          <details className="polish-review__tools">
            <summary>Polish sample controls</summary>
            {controls}
          </details>
        </>
      ) : screen === "table" ? (
        <ReviewTable
          key={`${stage}-${count}-${teams}-${online}-${offline}-${spectator}-${reconnecting}-${clock}`}
          initial={tableState}
          online={online}
          offline={offline}
          spectator={spectator}
          reconnecting={reconnecting}
          clock={clock}
          onBack={() => choose("Back from table")}
        />
      ) : (
        <main className="polish-review">
          <h1>Table and match polish review</h1>
          {controls}
        </main>
      )}
      {screen === "results" && (
        <GameOver
          state={match.completed}
          youId={personal ? youId : undefined}
          summary={personal ? summarize(match.completed, youId) : undefined}
          unlocked={params.has("unlocks") ? ACHIEVEMENTS.slice(0, 3) : []}
          onPlayAgain={
            variant === "spectator" || variant === "waiting"
              ? undefined
              : () => {
                  if (variant === "local" || variant.startsWith("solo")) choose("Play again");
                  else {
                    setVoted((v) => !v);
                    setSelection(voted ? "Rematch vote withdrawn" : "Rematch vote cast");
                  }
                }
          }
          playAgainLabel={
            !variant.startsWith("solo") && variant !== "local"
              ? voted
                ? t("gameOver.rematchWaiting", { have: Math.min(2, count - 1), need: count })
                : t("gameOver.rematch")
              : undefined
          }
          playAgainActive={voted}
          onSecondary={variant === "host" ? () => choose("Back to lobby") : undefined}
          secondaryLabel={t("gameOver.backToLobby")}
          waitingNote={variant === "waiting" ? t("gameOver.waitingRematch") : undefined}
          onMenu={() => choose("Leave results")}
          menuLabel={
            !variant.startsWith("solo") && variant !== "local" ? t("common.leavePlain") : undefined
          }
        />
      )}
    </BetaActiveContext.Provider>
  );
}
