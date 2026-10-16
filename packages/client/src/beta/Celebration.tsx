import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { GameState } from "@greed/core";
import { useI18n, useT } from "../i18n/i18n.js";
import { playBetaCue } from "../game/sfx.js";
import { createCelebrationPlayer } from "./celebrationPlayer.js";
import { SeasonalWinFlourish } from "../components/SeasonalScenery.js";
import {
  CELEBRATION_MS,
  readCelebration,
  type Celebration as Cue,
  type CelebrationCursor,
} from "./celebrations.js";

export function CelebrationArt({
  cue,
  nonce,
  variant = "sign",
}: {
  cue: Cue;
  nonce: number;
  variant?: "sign" | "scene";
}) {
  const t = useT();
  if (variant === "scene") return <SceneCelebrationArt cue={cue} nonce={nonce} />;
  const major = ["hot", "five", "win", "bigBank"].includes(cue.kind);
  return (
    <div
      key={nonce}
      className={`beta-celebration beta-celebration--${cue.kind}`}
      aria-hidden="true"
      style={{ "--celebration-ms": `${CELEBRATION_MS[cue.kind]}ms` } as CSSProperties}
    >
      {major && <div className="beta-celebration__rays" />}
      {cue.kind === "win" && <SeasonalWinFlourish />}
      <div className="beta-celebration__sign">
        <span className="beta-celebration__pips">● ● ● ● ●</span>
        <strong>{t(`beta.event.${cue.kind}`)}</strong>
        <span>
          {cue.player}
          {cue.points != null && cue.points > 0
            ? ` · ${cue.kind === "bust" ? "−" : "+"}${cue.points}`
            : ""}
        </span>
      </div>
      {major && (
        <div className="beta-celebration__particles">
          {Array.from({ length: 18 }, (_, i) => (
            <i
              key={i}
              style={
                {
                  "--angle": `${i * 20}deg`,
                  "--distance": `${100 + (i % 4) * 30}px`,
                  "--delay": `${(i % 5) * 35}ms`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** A clipped, noninteractive felt lane: no screen wash or sign/card chrome. */
function SceneCelebrationArt({ cue, nonce }: { cue: Cue; nonce: number }) {
  const { t, n } = useI18n();
  const title = t(`beta.event.${cue.kind}`);
  const longestWord = Math.max(...title.split(/\s+/).map((word) => word.length));
  return (
    <div
      key={nonce}
      className={`scene-event scene-event--${cue.kind}`}
      aria-hidden="true"
      style={
        {
          "--celebration-ms": `${CELEBRATION_MS[cue.kind]}ms`,
          "--event-word-length": longestWord,
        } as CSSProperties
      }
    >
      <div className="scene-event__lettering">
        {cue.kind === "win" && <SeasonalWinFlourish />}
        <strong>{title}</strong>
        <span className="scene-event__player">{cue.player}</span>
        {cue.points != null && cue.points > 0 && (
          <span className="scene-event__points">
            {cue.kind === "bust" ? "−" : "+"}
            {n(cue.points)}
          </span>
        )}
      </div>
      {cue.kind !== "score" && cue.kind !== "bust" && (
        <div className="scene-event__sparks">
          {[0, 1, 2, 3].map((i) => (
            <i key={i} style={{ "--spark-index": i } as CSSProperties}>
              ✦
            </i>
          ))}
        </div>
      )}
    </div>
  );
}

export function GameCelebration({
  state,
  isRolling,
  showVisuals = true,
  variant = "sign",
  suspended = false,
}: {
  state: GameState;
  isRolling: boolean;
  showVisuals?: boolean;
  variant?: "sign" | "scene";
  suspended?: boolean;
}) {
  const t = useT();
  const cursor = useRef<CelebrationCursor>();
  const [visible, setVisible] = useState<{ cue: Cue; nonce: number } | null>(null);
  const player = useRef<ReturnType<typeof createCelebrationPlayer>>();
  const latest = useRef(state);
  latest.current = state;
  if (!player.current)
    player.current = createCelebrationPlayer((cue) => {
      setVisible(cue ? { cue, nonce: Date.now() } : null);
      if (cue) playBetaCue(cue.kind);
    });
  useEffect(() => {
    if (suspended || document.hidden) {
      player.current?.reset();
      cursor.current = readCelebration(state).cursor;
      return;
    }
    if (isRolling) {
      return;
    }
    const result = readCelebration(state, cursor.current);
    if (
      cursor.current &&
      (state.log.length < cursor.current.length || result.cursor.game !== cursor.current.game)
    )
      player.current?.reset();
    cursor.current = result.cursor;
    if (!result.cue) return;
    player.current?.push(result.cue);
  }, [state, isRolling, suspended]);
  useEffect(() => {
    const resync = () => {
      player.current?.reset();
      cursor.current = readCelebration(latest.current).cursor;
    };
    document.addEventListener("visibilitychange", resync);
    return () => {
      document.removeEventListener("visibilitychange", resync);
      player.current?.dispose();
    };
  }, []);
  return (
    <>
      {variant === "scene" && showVisuals && (
        <span className="guide--muted" role="status">
          {visible && !suspended && ["triple", "straight", "five"].includes(visible.cue.kind)
            ? `${visible.cue.player ?? ""} · ${t(`beta.event.${visible.cue.kind}`)}`
            : ""}
        </span>
      )}
      {showVisuals && visible && !suspended && <CelebrationArt {...visible} variant={variant} />}
    </>
  );
}
