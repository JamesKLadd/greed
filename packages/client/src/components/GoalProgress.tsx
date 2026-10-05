import { useI18n } from "../i18n/i18n.js";

/** Banked scores may exceed the goal while the final round continues. */
export function goalProgress(score: number, goal: number) {
  const value = Math.max(0, Math.min(score, goal));
  return { value, percent: (value / goal) * 100, remaining: Math.max(0, goal - score) };
}

export function GoalProgress({
  score,
  goal,
  name,
  className = "",
}: {
  score: number;
  goal: number;
  name: string;
  className?: string;
}) {
  const { t, n } = useI18n();
  const progress = goalProgress(score, goal);
  const text = t("goal.progress", { name, score: n(score), goal: n(goal) });
  return (
    <div
      className={`goal-progress ${className}`}
      role="progressbar"
      aria-label={text}
      aria-valuemin={0}
      aria-valuemax={goal}
      aria-valuenow={progress.value}
      aria-valuetext={text}
      title={text}
      data-reached={score >= goal || undefined}
    >
      <span className="goal-progress__fill" style={{ width: `${progress.percent}%` }} />
    </div>
  );
}
