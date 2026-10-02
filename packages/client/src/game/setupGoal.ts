import { GOAL_DEFAULT } from "@greed/core";

export const MIN_SETUP_GOAL = 500;
export const MAX_SETUP_GOAL = 100000;

/** Commit the custom field at Start too: a mobile keyboard need not fire blur first. */
export function normalizeSetupGoal(value: string | number): number {
  if (typeof value === "string" && value.trim() === "") return GOAL_DEFAULT;
  const goal = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(goal)) return GOAL_DEFAULT;
  return Math.min(MAX_SETUP_GOAL, Math.max(MIN_SETUP_GOAL, Math.round(goal / 50) * 50));
}
