import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { GameState } from "@greed/core";
import { useT } from "../i18n/i18n.js";
import { playBetaCue } from "../game/sfx.js";
import {
  CELEBRATION_MS,
  readCelebration,
  type Celebration as Cue,
  type CelebrationCursor,
} from "./celebrations.js";

export function CelebrationArt({ cue, nonce }: { cue: Cue; nonce: number }) {
  const t = useT();
  const major = ["hot", "five", "win", "bigBank"].includes(cue.kind);
  return (
    <div
      key={nonce}
      className={`beta-celebration beta-celebration--${cue.kind}`}
      aria-hidden="true"
      style={{ "--celebration-ms": `${CELEBRATION_MS[cue.kind]}ms` } as CSSProperties}
    >
      {major && <div className="beta-celebration__rays" />}
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

export function GameCelebration({ state, isRolling }: { state: GameState; isRolling: boolean }) {
  const cursor = useRef<CelebrationCursor>();
  const [visible, setVisible] = useState<{ cue: Cue; nonce: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (isRolling) {
      setVisible(null);
      clearTimeout(timer.current);
      return;
    }
    if (cursor.current && state.log.length < cursor.current.length) {
      setVisible(null);
      clearTimeout(timer.current);
    }
    const result = readCelebration(state, cursor.current);
    cursor.current = result.cursor;
    if (!result.cue) return;
    clearTimeout(timer.current);
    setVisible({ cue: result.cue, nonce: Date.now() });
    playBetaCue(result.cue.kind);
    timer.current = setTimeout(() => setVisible(null), CELEBRATION_MS[result.cue.kind]);
  }, [state, isRolling]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return visible ? <CelebrationArt {...visible} /> : null;
}
