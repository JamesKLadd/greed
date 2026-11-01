import { useState } from "react";
import { holidayOfChallenge, holidayTrophy } from "@greed/core";

export type ChallengeKind = "daily" | "weekly";

/**
 * The trophy a Daily (by its day) or Weekly (by its Monday) is played for, or
 * null for an ordinary one. The same rule the server grants by
 * (holidayOfChallenge), so the lobby can never announce a prize the result
 * will not pay.
 */
export function challengeStake(kind: ChallengeKind, period: string): string | null {
  const holiday = holidayOfChallenge(kind, period);
  return holiday ? holidayTrophy(holiday) : null;
}

/** Per account as well as per period: a shared device tells each player once. */
export function stakeSeenKey(userId: string, kind: ChallengeKind, period: string): string {
  return `greed:stake-seen:${userId}:${kind}:${period}`;
}

// Also kept in memory, so a browser that refuses storage shows it once a visit
// rather than every time the lobby renders.
const seenHere = new Set<string>();

function seen(key: string): boolean {
  if (seenHere.has(key)) return true;
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

function markSeen(key: string): void {
  seenHere.add(key);
  try {
    localStorage.setItem(key, "1");
  } catch {
    // Remembered for this visit only.
  }
}

/**
 * "You're playing for the golden pumpkin": the trophy to announce when a
 * player opens a challenge that has one on the line, the first time they open
 * that day's or week's. Pass the period the SERVER reports, so nothing is
 * announced until the challenge has loaded, and a week that rolls over while
 * the lobby is open announces its own prize.
 */
export function useChallengeStake(
  kind: ChallengeKind,
  period: string | undefined,
  userId: string | undefined,
): { trophy: string | null; dismiss: () => void } {
  const [, rerender] = useState(0);
  const trophy = period && userId ? challengeStake(kind, period) : null;
  const key = trophy && period && userId ? stakeSeenKey(userId, kind, period) : null;
  return {
    trophy: key && !seen(key) ? trophy : null,
    dismiss: () => {
      if (key) markSeen(key);
      rerender((n) => n + 1);
    },
  };
}
