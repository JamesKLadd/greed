import { useEffect, useRef, useState } from "react";
import type { GameState, LegalActions } from "@greed/core";
import { recordGame, summarize, type Achievement, type GameSummary } from "./profile.js";
import { syncSteamAchievements } from "./steam.js";
import { syncProfileUp } from "../net/auth.js";
import { useGameSounds, useRollSound } from "./useGameSounds.js";
import { useTurnCue } from "./useTurnCue.js";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts.js";

/**
 * Everything an in-game screen needs that isn't layout: the two modal toggles,
 * sound, the turn chime, keyboard shortcuts, and folding a finished game into
 * the local profile.
 *
 * Offline and online play used to carry their own near-identical copy of all of
 * this, which is how they drifted — the online screen quietly lost the "was the
 * roll-off up?" guard on its turn chime, for instance.
 */

interface GameChromeOptions {
  state: GameState;
  legal: LegalActions;
  /** Whether the local user may act right now. */
  canAct: boolean;
  /** True while dice are in the air — drives the tumble sound. */
  isRolling?: boolean;
  /** The seat progression is recorded against, or null to record nothing. */
  youId: string | null;
  /** True while the opening roll-off overlay is up (suppresses the turn chime). */
  rollOffActive?: boolean;
  onRoll: () => void;
  onBank: () => void;
}

export interface GameChrome {
  showRules: boolean;
  setShowRules: (v: boolean) => void;
  showHistory: boolean;
  setShowHistory: (v: boolean) => void;
  /** The finished game's summary, once there is one. */
  summary: GameSummary | null;
  /** Badges earned by that game. */
  unlocked: Achievement[];
}

export function useGameChrome({
  state,
  legal,
  canAct,
  youId,
  isRolling = false,
  rollOffActive = false,
  onRoll,
  onBank,
}: GameChromeOptions): GameChrome {
  const [showRules, setShowRules] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [summary, setSummary] = useState<GameSummary | null>(null);
  const [unlocked, setUnlocked] = useState<Achievement[]>([]);
  const recordedRef = useRef(false);

  useGameSounds(state);
  useRollSound(isRolling);
  // Chime when it becomes the local player's turn — but not while the roll-off
  // is still on screen, where it would fire for a turn that hasn't begun.
  useTurnCue(state, canAct && !rollOffActive);

  useEffect(() => {
    if (state.phase !== "game-over") {
      recordedRef.current = false;
      setSummary(null);
      setUnlocked([]);
      return;
    }
    if (recordedRef.current || !youId) return;
    recordedRef.current = true;
    const s = summarize(state, youId);
    const result = recordGame(s);
    setSummary(s);
    setUnlocked(result.unlocked);
    syncSteamAchievements(result.unlocked.map((a) => a.id));
    void syncProfileUp(); // push updated stats to the account if signed in
  }, [state.phase, state, youId]);

  useKeyboardShortcuts({
    enabled: !showRules && !showHistory && !rollOffActive && state.phase !== "game-over",
    blockedByDialog: showRules || rollOffActive || state.phase === "game-over",
    canRoll: canAct && legal.canRoll,
    canBank: canAct && legal.canBank,
    onRoll,
    onBank,
    onToggleHistory: () => setShowHistory((h) => !h),
  });

  return { showRules, setShowRules, showHistory, setShowHistory, summary, unlocked };
}
