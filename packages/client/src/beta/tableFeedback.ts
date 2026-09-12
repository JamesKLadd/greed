import { useEffect, useRef, useState } from "react";
import type { GameState } from "@greed/core";
import { readCelebration, type CelebrationCursor } from "./celebrations.js";

export interface TableFeedback {
  banked?: { playerId: string; points: number; sequence: number };
  bustedId?: string;
}

/** Read actual bank events, never total deltas from a reconnect or rematch. */
export function readTableFeedback(state: GameState, previous?: CelebrationCursor): TableFeedback {
  const result = readCelebration(state, previous);
  if (!previous || !result.cue) return {};
  const events = state.log.slice(previous.length);
  const bank = events.find((event) => event.type === "bank");
  if (bank?.type === "bank")
    return { banked: { playerId: bank.playerId, points: bank.gained, sequence: state.log.length } };
  const bust = events.find((event) => event.type === "bust");
  return bust?.type === "bust" ? { bustedId: bust.playerId } : {};
}

export function useTableFeedback(state: GameState, suspended = false, epoch = 0): TableFeedback {
  const cursor = useRef<CelebrationCursor>();
  const previousEpoch = useRef(epoch);
  const [feedback, setFeedback] = useState<TableFeedback>({});
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const latest = useRef(state);
  latest.current = state;
  useEffect(() => {
    const current = readCelebration(state).cursor;
    const reset =
      suspended ||
      document.hidden ||
      previousEpoch.current !== epoch ||
      (cursor.current &&
        (current.game !== cursor.current.game || current.length < cursor.current.length));
    const next = reset ? {} : readTableFeedback(state, cursor.current);
    previousEpoch.current = epoch;
    cursor.current = current;
    if (reset || next.banked || next.bustedId) {
      clearTimeout(timer.current);
      setFeedback(next);
      if (!reset) timer.current = setTimeout(() => setFeedback({}), 950);
    }
  }, [state, suspended, epoch]);
  useEffect(() => {
    const resync = () => {
      clearTimeout(timer.current);
      cursor.current = readCelebration(latest.current).cursor;
      setFeedback({});
    };
    document.addEventListener("visibilitychange", resync);
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", resync);
    };
  }, []);
  return suspended ? {} : feedback;
}
