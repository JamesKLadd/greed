import { useEffect, useState } from "react";
import { dailyKey, msUntilNextDaily } from "@greed/core";
import { useAuth } from "./auth.js";
import { fetchDaily, resumeDaily } from "../net/daily.js";

/** Read-only background status; entering Home never starts a challenge. */
export function useDailyHomeStatus(): "ready" | "resume" | "completed" | null {
  const { status, user } = useAuth();
  const [value, setValue] = useState<"ready" | "resume" | "completed" | null>(null);
  useEffect(() => {
    setValue(null);
    if (status !== "authed") return;
    let active = true;
    let timer: number;
    let inFlight = false;
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const [daily, open] = await Promise.all([fetchDaily(), resumeDaily()]);
        if (active && daily.day === dailyKey())
          setValue(daily.run?.complete ? "completed" : open.run ? "resume" : "ready");
      } catch {
        if (active) setValue(null);
      } finally {
        inFlight = false;
      }
    };
    const rollover = () => {
      setValue(null);
      void refresh();
      timer = window.setTimeout(rollover, msUntilNextDaily() + 100);
    };
    const visible = () => {
      if (document.visibilityState === "visible") {
        setValue(null);
        void refresh();
      }
    };
    void refresh();
    timer = window.setTimeout(rollover, msUntilNextDaily() + 100);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [status, user?.id]);
  return value;
}
