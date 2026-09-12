import { useEffect, useRef, useState } from "react";

interface FrameSample {
  intervals: number[];
  hidden: boolean;
}

/** Development instrumentation: real browser frames, without a render on every frame. */
export function DevFrameMeter() {
  const [measuring, setMeasuring] = useState(false);
  const [sample, setSample] = useState<FrameSample | null>(null);
  const frame = useRef<number>();
  const timeout = useRef<number>();
  const active = useRef(false);
  const hidden = useRef(false);
  useEffect(() => {
    const onVisibility = () => {
      if (active.current && document.hidden) hidden.current = true;
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active.current = false;
      cancelAnimationFrame(frame.current ?? 0);
      clearTimeout(timeout.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  if (!new URLSearchParams(window.location.search).has("measure")) return null;

  const start = () => {
    if (active.current) return;
    active.current = true;
    hidden.current = document.hidden;
    setMeasuring(true);
    setSample(null);
    const intervals: number[] = [];
    let previous: number | null = null;
    const tick = (now: number) => {
      if (!active.current) return;
      if (previous !== null) intervals.push(now - previous);
      previous = now;
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    timeout.current = window.setTimeout(() => {
      active.current = false;
      cancelAnimationFrame(frame.current ?? 0);
      setMeasuring(false);
      setSample({ intervals, hidden: hidden.current });
    }, 5000);
  };
  const intervals = sample?.intervals ?? [];
  const sorted = [...intervals].sort((a, b) => a - b);
  const mean = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
  const p95 = sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
  const maximum = sorted[sorted.length - 1];
  const slow = intervals.filter((interval) => interval > 25).length;

  return (
    <aside
      aria-label="Development frame meter"
      data-frame-meter="true"
      style={{
        position: "fixed",
        zIndex: 100,
        bottom: 0,
        left: "50%",
        transform: "translateX(-50%)",
        width: "min(620px, 100%)",
        minHeight: 44,
        padding: "3px 8px",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "#081019",
        color: "white",
        font: "11px/1.25 system-ui, sans-serif",
      }}
    >
      <button
        type="button"
        onClick={start}
        disabled={measuring}
        style={{ minWidth: 100, minHeight: 38, font: "inherit" }}
      >
        {measuring ? "Measuring 5s…" : "Measure frames"}
      </button>
      <output aria-live="polite" data-frame-result={sample ? "complete" : "waiting"}>
        {sample?.hidden
          ? "Invalid sample: tab was hidden. Keep this tab visible and measure again."
          : intervals.length
            ? `${intervals.length} frames · mean ${mean.toFixed(2)} ms · p95 ${p95.toFixed(2)} ms · max ${maximum.toFixed(2)} ms · >25 ms ${slow} (${((slow / intervals.length) * 100).toFixed(1)}%)`
            : measuring
              ? "Roll now. Keep this tab visible."
              : "5-second browser sample; compare the same viewport and motion setting."}
      </output>
    </aside>
  );
}
