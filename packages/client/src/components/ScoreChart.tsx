import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useI18n } from "../i18n/i18n.js";

export interface ScorePoint {
  /** ISO instant (one game) or YYYY-MM-DD (a day's average). */
  at: string;
  score: number;
  /** Games behind the point: 1 for a single game, more for a day's average. */
  games: number;
}

const HEIGHT = 220;
const PAD = { top: 16, right: 64, bottom: 28, left: 46 };

function timeOf(at: string): number {
  // A bare date is a Chicago calendar day; noon UTC keeps it on that date
  // wherever the chart is read.
  return /^\d{4}-\d{2}-\d{2}$/.test(at) ? Date.parse(`${at}T12:00:00Z`) : Date.parse(at);
}

/** About four gridlines on round numbers: the step first, then the top. */
function niceScale(v: number): { max: number; step: number } {
  const raw = Math.max(v, 100) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag;
  return { max: Math.ceil(Math.max(v, 1) / step) * step, step };
}

/**
 * Score over time: each game (or each day's average) as a dot, and the running
 * average through them as the line the eye follows. One y-axis, hairline grid,
 * a crosshair that snaps to the nearest point, the same readout on keyboard
 * focus, and the numbers as a table for anyone who would rather read them.
 */
export function ScoreChart({
  points,
  perDay,
  runs = false,
  title,
}: {
  points: ScorePoint[];
  /** The points are days averaged across players, not single games. */
  perDay: boolean;
  /** Each point is a challenge run rather than a game. */
  runs?: boolean;
  title: string;
}) {
  const { t, n, locale } = useI18n();
  const ids = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(260, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rows = useMemo(() => {
    let games = 0;
    let total = 0;
    return points.map((p) => {
      games += p.games;
      total += p.score * p.games;
      return { ...p, t: timeOf(p.at), avg: total / games };
    });
  }, [points]);

  const date = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }),
    [locale],
  );
  const dateTime = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
    [locale],
  );
  const when = (p: ScorePoint) =>
    perDay ? date.format(new Date(timeOf(p.at))) : dateTime.format(new Date(p.at));

  if (rows.length === 0) return null;

  const t0 = rows[0].t;
  const t1 = rows[rows.length - 1].t;
  const scale = niceScale(Math.max(...rows.map((r) => Math.max(r.score, r.avg))));
  const yMax = scale.max;
  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  // A single point, or several at one instant, sit in the middle.
  const x = (tm: number) => PAD.left + (t1 > t0 ? ((tm - t0) / (t1 - t0)) * plotW : plotW / 2);
  const y = (v: number) => PAD.top + plotH - (v / yMax) * plotH;
  const ticks = Array.from({ length: Math.round(yMax / scale.step) + 1 }, (_, i) => i * scale.step);
  const line = rows.map((r, i) => `${i ? "L" : "M"}${x(r.t).toFixed(1)} ${y(r.avg).toFixed(1)}`);
  const last = rows[rows.length - 1];
  const shown = active === null ? null : rows[active];

  const nearest = (clientX: number) => {
    const box = wrap.current?.getBoundingClientRect();
    if (!box) return;
    const px = clientX - box.left;
    let best = 0;
    for (let i = 1; i < rows.length; i++) {
      if (Math.abs(x(rows[i].t) - px) < Math.abs(x(rows[best].t) - px)) best = i;
    }
    setActive(best);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End")
      return;
    e.preventDefault();
    const i = active ?? rows.length - 1;
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? rows.length - 1
          : Math.min(rows.length - 1, Math.max(0, i + (e.key === "ArrowRight" ? 1 : -1)));
    setActive(next);
  };

  const dotLabel = perDay
    ? t("rollData.chart.day")
    : runs
      ? t("rollData.chart.run")
      : t("rollData.chart.game");
  return (
    <figure className="roll-chart" aria-labelledby={`${ids}-title`}>
      <figcaption className="roll-chart__head">
        <h3 id={`${ids}-title`}>{title}</h3>
        <ul className="roll-chart__legend">
          <li>
            <span className="roll-chart__key roll-chart__key--dot" aria-hidden="true" />
            {dotLabel}
          </li>
          <li>
            <span className="roll-chart__key roll-chart__key--line" aria-hidden="true" />
            {t("rollData.chart.avg")}
          </li>
        </ul>
      </figcaption>
      <div
        ref={wrap}
        className="roll-chart__plot"
        tabIndex={0}
        role="img"
        aria-label={t("rollData.chart.aria", {
          count: n(rows.length),
          avg: n(Math.round(last.avg)),
        })}
        onPointerMove={(e) => nearest(e.clientX)}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive(rows.length - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={onKey}
      >
        <svg width={width} height={HEIGHT} aria-hidden="true">
          {ticks.map((v) => (
            <g key={v}>
              <line
                className="roll-chart__grid"
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(v)}
                y2={y(v)}
              />
              <text className="roll-chart__tick" x={PAD.left - 8} y={y(v) + 4} textAnchor="end">
                {v >= 1000 ? `${n(v / 1000)}K` : n(v)}
              </text>
            </g>
          ))}
          <text className="roll-chart__tick" x={PAD.left} y={HEIGHT - 8} textAnchor="start">
            {when(rows[0])}
          </text>
          {rows.length > 1 && (
            <text
              className="roll-chart__tick"
              x={width - PAD.right}
              y={HEIGHT - 8}
              textAnchor="end"
            >
              {when(last)}
            </text>
          )}
          {shown && (
            <line
              className="roll-chart__crosshair"
              x1={x(shown.t)}
              x2={x(shown.t)}
              y1={PAD.top}
              y2={PAD.top + plotH}
            />
          )}
          {rows.map((r, i) => (
            <circle
              key={i}
              className="roll-chart__dot"
              cx={x(r.t)}
              cy={y(r.score)}
              r={active === i ? 5.5 : 4}
            />
          ))}
          <path className="roll-chart__line" d={line.join("")} />
          <circle className="roll-chart__end" cx={x(last.t)} cy={y(last.avg)} r={4.5} />
          <text className="roll-chart__end-label" x={x(last.t) + 9} y={y(last.avg) + 4}>
            {n(Math.round(last.avg))}
          </text>
        </svg>
        {shown && (
          <div
            className="roll-chart__tip"
            style={{
              left: Math.min(Math.max(x(shown.t), 70), width - 70),
              top: Math.max(4, y(Math.max(shown.score, shown.avg)) - 64),
            }}
          >
            <span className="roll-chart__tip-when">{when(shown)}</span>
            <span>
              <i className="roll-chart__key roll-chart__key--dot" aria-hidden="true" />
              <strong>{n(shown.score)}</strong> {dotLabel}
              {perDay && shown.games > 1
                ? ` · ${t("rollData.chart.games", { n: n(shown.games) })}`
                : ""}
            </span>
            <span>
              <i className="roll-chart__key roll-chart__key--line" aria-hidden="true" />
              <strong>{n(Math.round(shown.avg))}</strong> {t("rollData.chart.avg")}
            </span>
          </div>
        )}
      </div>
      <details className="roll-chart__table">
        <summary>{t("rollData.chart.table")}</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">{t("rollData.chart.date")}</th>
              <th scope="col">{dotLabel}</th>
              <th scope="col">{t("rollData.chart.avg")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{when(r)}</td>
                <td>{n(r.score)}</td>
                <td>{n(Math.round(r.avg))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/**
 * Each face's share of every die thrown, against the fair one in six. A single
 * series, so one colour and no legend; the fair line is the reference.
 */
export function FaceChart({ counts, title }: { counts: number[]; title: string }) {
  const { t, locale } = useI18n();
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const pct = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  const shares = counts.map((c) => c / total);
  const top = Math.max(0.25, ...shares) * 1.15;
  const W = 300;
  const H = 150;
  const base = H - 24;
  const slot = W / 6;
  const bar = Math.min(24, slot * 0.5);
  const yOf = (s: number) => base - (s / top) * (base - 18);
  const fair = yOf(1 / 6);
  return (
    <figure className="roll-faces">
      <figcaption className="roll-chart__head">
        <h3>{title}</h3>
        {/* Keyed here rather than labelled on the line, where it collided with
            whichever bar stood under it. */}
        <ul className="roll-chart__legend">
          <li>
            <span className="roll-chart__key roll-faces__key" aria-hidden="true" />
            {t("rollData.faces.fair", { pct: pct.format(1 / 6) })}
          </li>
        </ul>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("rollData.faces.aria")}>
        <line className="roll-chart__grid" x1={0} x2={W} y1={base} y2={base} />
        {shares.map((s, i) => {
          const cx = slot * i + slot / 2;
          const top = yOf(s);
          const h = base - top;
          // 4px rounded data end, square at the baseline.
          const r = Math.min(4, h);
          const d = `M${cx - bar / 2} ${base} V${top + r} Q${cx - bar / 2} ${top} ${cx - bar / 2 + r} ${top} H${cx + bar / 2 - r} Q${cx + bar / 2} ${top} ${cx + bar / 2} ${top + r} V${base} Z`;
          return (
            <g key={i}>
              <title>
                {t("rollData.faces.face", { face: i + 1 })}: {pct.format(s)}
              </title>
              <path className="roll-faces__bar" d={d} />
              <text className="roll-faces__value" x={cx} y={top - 5} textAnchor="middle">
                {pct.format(s)}
              </text>
              <text className="roll-chart__tick" x={cx} y={H - 6} textAnchor="middle">
                {i + 1}
              </text>
            </g>
          );
        })}
        <line className="roll-faces__fair" x1={0} x2={W} y1={fair} y2={fair} />
      </svg>
    </figure>
  );
}
