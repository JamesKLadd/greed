import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import { useI18n, type MsgKey } from "../i18n/i18n.js";

export interface ScorePoint {
  /** ISO instant (one game) or YYYY-MM-DD (a day's average). */
  at: string;
  score: number;
  /** Games behind the point: 1 for a single game, more for a day's average. */
  games: number;
}

const HEIGHT = 220;
const PAD = { top: 16, right: 64, bottom: 28, left: 46 };

/** The plot's width, followed as the panel resizes. */
function usePlotWidth() {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(260, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { wrap, width };
}

/**
 * The point being read: the nearest to the pointer, or stepped through with the
 * arrow keys, Home and End. Focus starts on the latest point.
 */
function useCursor(count: number, xs: (i: number) => number, wrap: RefObject<HTMLDivElement>) {
  const [active, setActive] = useState<number | null>(null);
  const nearest = (clientX: number) => {
    const box = wrap.current?.getBoundingClientRect();
    if (!box || count === 0) return;
    const px = clientX - box.left;
    let best = 0;
    for (let i = 1; i < count; i++) {
      if (Math.abs(xs(i) - px) < Math.abs(xs(best) - px)) best = i;
    }
    setActive(best);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End")
      return;
    e.preventDefault();
    const i = active ?? count - 1;
    setActive(
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? count - 1
          : Math.min(count - 1, Math.max(0, i + (e.key === "ArrowRight" ? 1 : -1))),
    );
  };
  const handlers = {
    onPointerMove: (e: PointerEvent) => nearest(e.clientX),
    onPointerLeave: () => setActive(null),
    onFocus: () => setActive(count - 1),
    onBlur: () => setActive(null),
    onKeyDown,
  };
  return { active: active !== null && active < count ? active : null, handlers };
}

/** A short date for a day's point, date and time for a single game's. */
function useWhen(perDay: boolean) {
  const { locale } = useI18n();
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
  return (at: string) =>
    perDay ? date.format(new Date(timeOf(at))) : dateTime.format(new Date(at));
}

function timeOf(at: string): number {
  // A bare date is a Chicago calendar day; noon UTC keeps it on that date
  // wherever the chart is read.
  return /^\d{4}-\d{2}-\d{2}$/.test(at) ? Date.parse(`${at}T12:00:00Z`) : Date.parse(at);
}

/**
 * About four gridlines on round numbers, always including zero: the step
 * first, then the ends. `minSpan` keeps a nearly flat series from being blown
 * up into steep-looking noise; `whole` keeps counts off fractional ticks.
 */
function niceRange(
  lo: number,
  hi: number,
  minSpan = 100,
  whole = false,
): { min: number; max: number; step: number } {
  const low = Math.min(0, lo);
  const high = Math.max(0, hi);
  const raw = Math.max(high - low, minSpan) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const steps = whole && mag < 10 ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10];
  const step = Math.max(whole ? 1 : 0, (steps.find((m) => m * mag >= raw) ?? 10) * mag);
  const min = Math.floor(low / step) * step;
  return { min, max: Math.max(Math.ceil(high / step) * step, min + step), step };
}

/** A y-axis tick: compact from a thousand up, with a true minus sign. */
function tickText(v: number, n: (v: number) => string): string {
  const sign = v < 0 ? "−" : "";
  const a = Math.abs(v);
  return sign + (a >= 1000 ? `${n(a / 1000)}K` : n(a));
}

/**
 * Score over time: each game (or each day's average) as a dot, and the running
 * average through them as the line the eye follows. One y-axis, hairline grid,
 * a crosshair that snaps to the nearest point, the same readout on keyboard
 * focus, and the numbers as a table for anyone who would rather read them.
 *
 * `byAttempt` spaces the points evenly, one per attempt, instead of by the
 * clock. The weekly's attempts come in bursts — ten in a sitting, then nothing
 * until tomorrow — and on a time axis each burst piled into one column while
 * the gap between them took the whole width.
 */
export function ScoreChart({
  points,
  perDay,
  runs = false,
  byAttempt = false,
  title,
}: {
  points: ScorePoint[];
  /** The points are days averaged across players, not single games. */
  perDay: boolean;
  /** Each point is a challenge run rather than a game. */
  runs?: boolean;
  /** One evenly spaced point per attempt, numbered, rather than placed by time. */
  byAttempt?: boolean;
  title: string;
}) {
  const { t, n } = useI18n();
  const ids = useId();
  const { wrap, width } = usePlotWidth();
  const when = useWhen(perDay);
  const attempt = (i: number) => t("rollData.chart.attemptN", { n: n(i + 1) });

  const rows = useMemo(() => {
    let games = 0;
    let total = 0;
    return points.map((p, i) => {
      games += p.games;
      total += p.score * p.games;
      return { ...p, t: byAttempt ? i : timeOf(p.at), avg: total / games };
    });
  }, [points, byAttempt]);

  const t0 = rows[0]?.t ?? 0;
  const t1 = rows[rows.length - 1]?.t ?? 0;
  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  // A single point, or several at one instant, sit in the middle.
  const x = (tm: number) => PAD.left + (t1 > t0 ? ((tm - t0) / (t1 - t0)) * plotW : plotW / 2);
  const { active, handlers } = useCursor(rows.length, (i) => x(rows[i].t), wrap);

  if (rows.length === 0) return null;

  const scale = niceRange(0, Math.max(...rows.map((r) => Math.max(r.score, r.avg))));
  const yMax = scale.max;
  const y = (v: number) => PAD.top + plotH - (v / yMax) * plotH;
  const ticks = Array.from({ length: Math.round(yMax / scale.step) + 1 }, (_, i) => i * scale.step);
  const line = rows.map((r, i) => `${i ? "L" : "M"}${x(r.t).toFixed(1)} ${y(r.avg).toFixed(1)}`);
  const last = rows[rows.length - 1];
  const shown = active === null ? null : rows[active];

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
        {...handlers}
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
                {tickText(v, n)}
              </text>
            </g>
          ))}
          <text className="roll-chart__tick" x={PAD.left} y={HEIGHT - 8} textAnchor="start">
            {byAttempt ? attempt(0) : when(rows[0].at)}
          </text>
          {rows.length > 1 && (
            <text
              className="roll-chart__tick"
              x={width - PAD.right}
              y={HEIGHT - 8}
              textAnchor="end"
            >
              {byAttempt ? attempt(rows.length - 1) : when(last.at)}
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
            <span className="roll-chart__tip-when">
              {byAttempt ? `${attempt(active!)} · ${when(shown.at)}` : when(shown.at)}
            </span>
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
              {byAttempt && <th scope="col">{t("rollData.chart.attempt")}</th>}
              <th scope="col">{t("rollData.chart.date")}</th>
              <th scope="col">{dotLabel}</th>
              <th scope="col">{t("rollData.chart.avg")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {byAttempt && <td>{n(i + 1)}</td>}
                <td>{when(r.at)}</td>
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

export interface TrendPoint {
  /** ISO instant (one game) or YYYY-MM-DD (a day). */
  at: string;
  value: number;
  /** Games behind a day's point, for the readout. */
  games?: number;
}

/**
 * One measure over time as a line — luck, or players a day. A single series,
 * so no legend: the title names it. `signed` values sit above or below a zero
 * line (luck), which is drawn a step stronger than the grid because it is the
 * reference the whole chart is read against.
 */
export function TrendChart({
  points,
  perDay,
  title,
  valueLabel,
  ariaKey,
  signed = false,
  whole = false,
}: {
  points: TrendPoint[];
  perDay: boolean;
  title: string;
  /** What each value is: the readout's and the table's label for it. */
  valueLabel: string;
  /** Takes {title}, {count} and {value}. */
  ariaKey: MsgKey;
  signed?: boolean;
  /** Counts: no fractional ticks, and a small span is still a small span. */
  whole?: boolean;
}) {
  const { t, n } = useI18n();
  const ids = useId();
  const { wrap, width } = usePlotWidth();
  const when = useWhen(perDay);
  const rows = useMemo(() => points.map((p) => ({ ...p, t: timeOf(p.at) })), [points]);

  const t0 = rows[0]?.t ?? 0;
  const t1 = rows[rows.length - 1]?.t ?? 0;
  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (tm: number) => PAD.left + (t1 > t0 ? ((tm - t0) / (t1 - t0)) * plotW : plotW / 2);
  const { active, handlers } = useCursor(rows.length, (i) => x(rows[i].t), wrap);

  if (rows.length === 0) return null;

  const values = rows.map((r) => r.value);
  const scale = niceRange(Math.min(...values), Math.max(...values), whole ? 4 : 100, whole);
  const y = (v: number) => PAD.top + plotH - ((v - scale.min) / (scale.max - scale.min)) * plotH;
  const ticks = Array.from(
    { length: Math.round((scale.max - scale.min) / scale.step) + 1 },
    (_, i) => scale.min + i * scale.step,
  );
  const fmt = (v: number) => {
    const r = Math.round(v);
    return signed ? (r > 0 ? "+" : r < 0 ? "−" : "") + n(Math.abs(r)) : n(r);
  };
  const line = rows.map((r, i) => `${i ? "L" : "M"}${x(r.t).toFixed(1)} ${y(r.value).toFixed(1)}`);
  const last = rows[rows.length - 1];
  const shown = active === null ? null : rows[active];

  return (
    <figure className="roll-chart" aria-labelledby={`${ids}-title`}>
      <figcaption className="roll-chart__head">
        <h3 id={`${ids}-title`}>{title}</h3>
      </figcaption>
      <div
        ref={wrap}
        className="roll-chart__plot"
        tabIndex={0}
        role="img"
        aria-label={t(ariaKey, { title, count: n(rows.length), value: fmt(last.value) })}
        {...handlers}
      >
        <svg width={width} height={HEIGHT} aria-hidden="true">
          {ticks.map((v) => (
            <g key={v}>
              <line
                className={signed && v === 0 ? "roll-chart__zero" : "roll-chart__grid"}
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(v)}
                y2={y(v)}
              />
              <text className="roll-chart__tick" x={PAD.left - 8} y={y(v) + 4} textAnchor="end">
                {tickText(v, n)}
              </text>
            </g>
          ))}
          <text className="roll-chart__tick" x={PAD.left} y={HEIGHT - 8} textAnchor="start">
            {when(rows[0].at)}
          </text>
          {rows.length > 1 && (
            <text
              className="roll-chart__tick"
              x={width - PAD.right}
              y={HEIGHT - 8}
              textAnchor="end"
            >
              {when(last.at)}
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
          <path className="roll-chart__line" d={line.join("")} />
          {shown && (
            <circle className="roll-chart__end" cx={x(shown.t)} cy={y(shown.value)} r={5} />
          )}
          <circle className="roll-chart__end" cx={x(last.t)} cy={y(last.value)} r={4.5} />
          <text className="roll-chart__end-label" x={x(last.t) + 9} y={y(last.value) + 4}>
            {fmt(last.value)}
          </text>
        </svg>
        {shown && (
          <div
            className="roll-chart__tip"
            style={{
              left: Math.min(Math.max(x(shown.t), 70), width - 70),
              top: Math.max(4, y(shown.value) - 56),
            }}
          >
            <span className="roll-chart__tip-when">{when(shown.at)}</span>
            <span>
              <strong>{fmt(shown.value)}</strong> {valueLabel}
              {perDay && shown.games && shown.games > 1
                ? ` · ${t("rollData.chart.games", { n: n(shown.games) })}`
                : ""}
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
              <th scope="col">{valueLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{when(r.at)}</td>
                <td>{fmt(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

export interface ShareRow {
  key: string;
  label: string;
  value: number;
  /** The readout for the value itself, shown on hover ("42 banks"). */
  detail: string;
}

/**
 * A handful of ordered or named categories as horizontal bars, each one's share
 * of the total at its tip. One series: one colour, no legend. The longest bar
 * fills the track, so small differences stay visible; the shares say the rest.
 */
export function ShareBars({ rows, title }: { rows: ShareRow[]; title: string }) {
  const { locale } = useI18n();
  const ids = useId();
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  if (total <= 0) return null;
  const pct = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });
  const top = Math.max(...rows.map((r) => r.value));
  return (
    <figure className="roll-bars">
      <figcaption className="roll-chart__head">
        <h3 id={`${ids}-title`}>{title}</h3>
      </figcaption>
      <ul className="roll-bars__list" aria-labelledby={`${ids}-title`}>
        {rows.map((r) => (
          <li key={r.key} className="roll-bars__row" title={r.detail}>
            <span className="roll-bars__label">{r.label}</span>
            <span className="roll-bars__track" aria-hidden="true">
              {r.value > 0 && (
                <span className="roll-bars__bar" style={{ width: `${(r.value / top) * 100}%` }} />
              )}
            </span>
            <span className="roll-bars__value">
              {pct.format(r.value / total)}
              <span className="roll-bars__detail"> · {r.detail}</span>
            </span>
          </li>
        ))}
      </ul>
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
