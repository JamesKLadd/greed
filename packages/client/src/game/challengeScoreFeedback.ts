/** Unknown history must not turn a completed run into an invented record. */
export type ScoreBaseline = number | null | undefined;

export function scoreBaseline(best: { score: number } | null | undefined): ScoreBaseline {
  if (best === null) return null;
  return best && Number.isFinite(best.score) && best.score >= 0 ? best.score : undefined;
}

/** The all-time board is optional here: a stalled request must not stall play. */
export async function readScoreBaseline(
  read: () => Promise<{ yourBest?: { score: number } | null }>,
  timeoutMs = 1500,
): Promise<ScoreBaseline> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      read().then(
        (view) => scoreBaseline(view.yourBest),
        () => undefined,
      ),
      new Promise<undefined>((resolve) => {
        timeout = setTimeout(() => resolve(undefined), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

/** A first recorded result establishes a baseline; only an improvement gets the highlight. */
export function improvesPersonalBest(score: number, before: ScoreBaseline): boolean {
  return typeof before === "number" && Number.isFinite(score) && score > before;
}

export type WeeklyScoreOutcome =
  { kind: "improved"; gain: number } | { kind: "first" } | { kind: "stands"; score: number };

/** Score ties can improve a tiebreak, but they do not increase the weekly total. */
export function weeklyScoreOutcome(
  attempt: number,
  before: number | null,
  standing: number,
): WeeklyScoreOutcome {
  if (attempt === standing) {
    if (before === null) return { kind: "first" };
    if (attempt > before) return { kind: "improved", gain: attempt - before };
  }
  return { kind: "stands", score: standing };
}
