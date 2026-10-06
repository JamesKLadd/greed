import type { GrowthFunnelReport, GrowthReport } from "@greed/protocol";
import { api } from "./auth.js";

export type MeasuredGrowthReport = Omit<GrowthReport, "funnels"> & {
  funnels: GrowthFunnelReport[] | null;
};

/** Older servers have totals only during the staggered deployment window. */
export async function fetchGrowthReport(): Promise<MeasuredGrowthReport> {
  const report = await api<GrowthReport>("/api/growth/report", { auth: true });
  return { ...report, funnels: report.funnels ?? null };
}
