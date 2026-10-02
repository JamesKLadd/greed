/** Keep seconds rounded up; a displayed zero must mean the boundary arrived. */
export function formatChallengeCountdown(ms: number): { days: number; clock: string } {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return {
    days,
    clock: `${days > 0 ? String(hours).padStart(2, "0") : hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
  };
}
