import type { UnlockProgress as Progress } from "../game/unlockProgress.js";
import { useI18n, type MsgKey } from "../i18n/i18n.js";

/** Compact progress for both locker styles, using only known profile counters. */
export function UnlockProgress({ progress }: { progress: Progress | null }) {
  const { t, n } = useI18n();
  if (!progress) return null;
  if (progress.kind === "holiday") {
    const { daysAway } = progress;
    return (
      <span
        className={`locker-progress locker-progress--hint${daysAway === 0 ? " locker-progress--today" : ""}`}
      >
        {daysAway === 0
          ? t("locker.progress.holidayToday")
          : daysAway === 1
            ? t("locker.progress.holidayTomorrow")
            : t("locker.progress.holidayAway", { days: n(daysAway) })}
      </span>
    );
  }
  if (progress.kind === "hint")
    return (
      <span className="locker-progress locker-progress--hint">
        {t(`locker.progress.${progress.hint}` as MsgKey)}
      </span>
    );
  const label = t(`locker.progress.${progress.metric}` as MsgKey, {
    current: n(progress.current),
    target: n(progress.target),
  });
  return (
    <span className="locker-progress">
      <span aria-hidden="true">{label}</span>
      <progress
        max={progress.target}
        value={Math.min(progress.current, progress.target)}
        aria-label={label}
      />
    </span>
  );
}
