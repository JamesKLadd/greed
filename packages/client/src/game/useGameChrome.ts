import { useEffect, useRef, useState } from "react";
import type { GameState, LegalActions } from "@greed/core";
import { recordGame, summarize, type Achievement, type GameSummary } from "./profile.js";
import { syncSteamAchievements } from "./steam.js";
import { claimHolidayDice } from "./holidayDice.js";
import { claimAdventDoor } from "./adventClaim.js";
import { rollGameFromState, tableFaces } from "@greed/bots";
import type { PlayerRolls } from "./useGreed.js";
import { recordLocalRollGame } from "./rollRecords.js";
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
  /**
   * Whoever holds this device played the game, even with no one seat to record
   * against — pass-and-play. Earns the holiday dice when it finishes on the day,
   * since those ask only that you played. Implied by `youId`.
   */
  playedHere?: boolean;
  /**
   * The throws and choices this device recorded, for a game played HERE — a
   * solo game. Online games omit it: the server threw those dice and keeps
   * their record.
   */
  rollsFor?: (playerId: string) => PlayerRolls;
  /** True while the opening roll-off overlay is up (suppresses the turn chime). */
  rollOffActive?: boolean;
  /** A presentation-owned dialog, such as the table menu or player details. */
  blockingOverlayActive?: boolean;
  onRoll: () => void;
  onBank: () => void;
  /** Hold or release a die, when the local player is allowed to. */
  onToggleDie?: (index: number) => void;
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
  playedHere = youId !== null,
  rollsFor,
  isRolling = false,
  rollOffActive = false,
  blockingOverlayActive = false,
  onRoll,
  onBank,
  onToggleDie,
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
    if (recordedRef.current || !(youId || playedHere)) return;
    recordedRef.current = true;
    const s = youId ? summarize(state, youId) : null;
    const earned = s ? recordGame(s).unlocked : [];
    if (youId && rollsFor) {
      const { throws, decisions } = rollsFor(youId);
      recordLocalRollGame(
        rollGameFromState("local", state, youId, throws, new Date(), { decisions }),
        tableFaces(state),
      );
    }
    const holiday = claimHolidayDice();
    if (holiday) earned.push(holiday);
    // December: a finished game opens the next advent door (advent.ts). Synced
    // with everything else just below.
    claimAdventDoor();
    setSummary(s);
    setUnlocked(earned);
    syncSteamAchievements(earned.map((a) => a.id));
    void syncProfileUp(); // push updated stats to the account if signed in
    // `rollsFor` reads a ref, and the record is made once per game whatever it
    // returns, so it is deliberately not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state, youId, playedHere]);

  useKeyboardShortcuts({
    enabled:
      !blockingOverlayActive &&
      !showRules &&
      !showHistory &&
      !rollOffActive &&
      state.phase !== "game-over",
    blockedByDialog:
      blockingOverlayActive || showRules || rollOffActive || state.phase === "game-over",
    canRoll: canAct && legal.canRoll,
    canBank: canAct && legal.canBank,
    onRoll,
    onBank,
    onToggleHistory: () => setShowHistory((h) => !h),
    onToggleDie: canAct ? onToggleDie : undefined,
  });

  return { showRules, setShowRules, showHistory, setShowHistory, summary, unlocked };
}
