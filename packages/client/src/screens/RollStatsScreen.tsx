import { useCallback, useEffect, useId, useMemo, useState } from "react";
import {
  faceComparisons,
  gamesCsv,
  oddsComparisons,
  tallyGames,
  throwsCsv,
  type OddsComparison,
  type RollTally,
} from "@greed/bots";
import { useAuth } from "../game/auth.js";
import { deviceRollGames } from "../game/rollRecords.js";
import {
  StatsUnavailable,
  fetchRollCsv,
  fetchRollSummary,
  type RollSummary,
  type StatsScope,
  type StatsView,
} from "../net/rollStats.js";
import { FaceChart, ScoreChart } from "../components/ScoreChart.js";
import { apiErrorText } from "../i18n/apiError.js";
import { useI18n, type MsgKey } from "../i18n/i18n.js";
import { Button, Screen } from "../ui/index.js";

/** The modes a view can be switched between. */
const ADMIN_VIEWS: readonly ("games" | "daily" | "weekly")[] = ["games", "daily", "weekly"];
const GAME_SPLITS: readonly ("games" | "local" | "online")[] = ["games", "local", "online"];

/** A gap this many standard deviations from expectation is luck, not noise. */
const LUCK_Z = 2;
/** Fewer chances than this and the verdict would be guesswork. */
const MIN_CHANCES = 20;

function luckOf(row: OddsComparison): "good" | "bad" | "normal" | "few" {
  if (row.chances < MIN_CHANCES || row.z === null) return "few";
  if (Math.abs(row.z) < LUCK_Z) return "normal";
  const above = row.z > 0;
  return above === (row.leaning === "good") ? "good" : "bad";
}

/** Everything the screen draws, from either the server or this device. */
interface Data {
  summary: RollSummary;
  /** Saves a CSV; for a guest it is built here, from the device's games. */
  csv: (kind: "games" | "throws") => Promise<string>;
  guest: boolean;
}

function deviceData(): Data {
  const games = deviceRollGames();
  return {
    guest: true,
    summary: {
      view: "local",
      days: 100,
      tally: tallyGames(games),
      playerCount: games.length ? 1 : 0,
      series: games.map((g) => ({ at: g.playedAt, score: g.score, games: 1 })),
    },
    csv: async (kind) =>
      kind === "games"
        ? gamesCsv(games.map((game) => ({ game })))
        : throwsCsv(games.map((game) => ({ game }))),
  };
}

function save(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Roll statistics: how a player's dice actually fell against the exact odds of
 * every throw they made — or, for the game's owner, everyone's combined.
 */
export function RollStatsScreen({
  scope,
  initialView,
  onBack,
}: {
  scope: StatsScope;
  initialView: StatsView;
  onBack: () => void;
}) {
  const { t, n, locale } = useI18n();
  const ids = useId();
  const { status: authStatus } = useAuth();
  const [view, setView] = useState<StatsView>(initialView);
  const [data, setData] = useState<Data | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"games" | "throws" | null>(null);
  const [exportFailed, setExportFailed] = useState(false);

  const guest = scope === "me" && authStatus !== "authed";
  const isGames = view === "games" || view === "local" || view === "online";

  const load = useCallback(async () => {
    setLoading(true);
    setProblem(null);
    try {
      if (guest) {
        setData(deviceData());
      } else {
        const summary = await fetchRollSummary(scope, view);
        setData({ summary, guest: false, csv: (kind) => fetchRollCsv(scope, view, kind) });
      }
    } catch (err) {
      setData(null);
      setProblem(
        err instanceof StatsUnavailable
          ? t("rollData.unavailable")
          : apiErrorText(t, err, "rollData.failed"),
      );
    } finally {
      setLoading(false);
    }
  }, [guest, scope, view, t]);

  useEffect(() => {
    if (authStatus === "loading") return;
    void load();
  }, [authStatus, load]);

  const pct = useMemo(
    () => new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }),
    [locale],
  );
  const dec = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }), [locale]);

  const runs = view === "daily" || view === "weekly";
  const title = scope === "all" ? t("rollData.titleAll") : t("rollData.title");

  const exportCsv = async (kind: "games" | "throws") => {
    if (!data) return;
    setExporting(kind);
    setExportFailed(false);
    try {
      const prefix = scope === "all" ? "greed-all-players" : "greed";
      save(await data.csv(kind), `${prefix}-${view}-${kind}.csv`);
    } catch {
      setExportFailed(true);
    } finally {
      setExporting(null);
    }
  };

  const tally = data?.summary.tally;
  const empty = !loading && !problem && (!tally || tally.throws === 0);

  return (
    <Screen
      hero={false}
      className="support-screen"
      panelClassName="support-panel roll-data"
      actions={
        <Button variant="ghost" onClick={onBack}>
          {t("rollData.back")}
        </Button>
      }
    >
      <header className="support-panel__heading">
        <h1>{title}</h1>
        <p className="support-panel__intro">
          {/* A guest has no online games: only solo games live on a device. */}
          {t(guest ? "rollData.view.local" : (`rollData.view.${view}` as MsgKey))} ·{" "}
          {t("rollData.window", { days: n(data?.summary.days ?? 100) })}
        </p>
      </header>

      {scope === "all" && (
        <div className="roll-data__tabs" role="group" aria-label={t("rollData.chooseView")}>
          {ADMIN_VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              className="btn btn--ghost"
              aria-pressed={v === "games" ? isGames : view === v}
              onClick={() => setView(v)}
            >
              {t(`rollData.view.${v}` as MsgKey)}
            </button>
          ))}
        </div>
      )}
      {isGames && !guest && (
        <div
          className="roll-data__tabs roll-data__tabs--sub"
          role="group"
          aria-label={t("rollData.chooseSplit")}
        >
          {GAME_SPLITS.map((v) => (
            <button
              key={v}
              type="button"
              className="btn btn--ghost"
              aria-pressed={view === v}
              onClick={() => setView(v)}
            >
              {t(v === "games" ? "rollData.view.both" : (`rollData.view.${v}` as MsgKey))}
            </button>
          ))}
        </div>
      )}
      {guest && <p className="roll-data__note">{t("rollData.guestNote")}</p>}

      <div
        className="roll-data__body"
        aria-busy={loading}
        data-refreshing={loading && data ? "" : undefined}
      >
        {loading && !data && (
          <p className="daily__note" role="status">
            {t("rollData.loading")}
          </p>
        )}
        {problem && (
          <div className="challenge-lobby__error">
            <p role="alert">{problem}</p>
            <Button onClick={() => void load()}>{t("challenge.retry")}</Button>
          </div>
        )}
        {empty && <p className="daily__note">{t("rollData.empty")}</p>}
        {tally && tally.throws > 0 && (
          <Report
            tally={tally}
            summary={data!.summary}
            scope={scope}
            runs={runs}
            pct={pct}
            dec={dec}
          />
        )}
      </div>

      {tally && tally.games > 0 && (
        <section className="support-section roll-data__export" aria-labelledby={`${ids}-export`}>
          <h2 id={`${ids}-export`}>{t("rollData.export.title")}</h2>
          <p className="roll-data__note">{t("rollData.export.note")}</p>
          <div className="roll-data__export-buttons">
            <Button disabled={exporting !== null} onClick={() => void exportCsv("games")}>
              {exporting === "games" ? t("rollData.export.working") : t("rollData.export.games")}
            </Button>
            <Button disabled={exporting !== null} onClick={() => void exportCsv("throws")}>
              {exporting === "throws" ? t("rollData.export.working") : t("rollData.export.throws")}
            </Button>
          </div>
          {exportFailed && (
            <p className="roll-data__note" role="alert">
              {t("rollData.export.failed")}
            </p>
          )}
        </section>
      )}
    </Screen>
  );
}

function Report({
  tally: tl,
  summary,
  scope,
  runs,
  pct,
  dec,
}: {
  tally: RollTally;
  summary: RollSummary;
  scope: StatsScope;
  runs: boolean;
  pct: Intl.NumberFormat;
  dec: Intl.NumberFormat;
}) {
  const { t, n } = useI18n();
  const ids = useId();
  const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);
  const p = (a: number, b: number) => (b > 0 ? pct.format(a / b) : "—");
  const luckPoints = tl.gain - tl.eGain;

  const tiles: { label: MsgKey; value: string }[] = [
    { label: runs ? "rollData.tile.runs" : "rollData.tile.games", value: n(tl.games) },
    ...(scope === "all"
      ? [{ label: "rollData.tile.players" as MsgKey, value: n(summary.playerCount) }]
      : []),
    { label: "rollData.tile.throws", value: n(tl.throws) },
    { label: "rollData.tile.avgScore", value: n(Math.round(ratio(tl.scoreSum, tl.games))) },
    { label: "rollData.tile.perTurn", value: n(Math.round(ratio(tl.bankedPoints, tl.turns))) },
    ...(!runs && tl.decided > 0
      ? [{ label: "rollData.tile.winRate" as MsgKey, value: p(tl.wins, tl.decided) }]
      : []),
  ];

  const risk: { label: MsgKey; value: string }[] = [
    { label: "rollData.risk.avgRisk", value: p(tl.volRisk, tl.vol) },
    { label: "rollData.risk.volBust", value: p(tl.volBust, tl.vol) },
    { label: "rollData.risk.turnBust", value: p(tl.busts, tl.turns) },
    { label: "rollData.risk.throwsPerTurn", value: dec.format(ratio(tl.throws, tl.turns)) },
    {
      label: "rollData.risk.survived",
      value: tl.maxRiskSurvived > 0 ? pct.format(tl.maxRiskSurvived) : "—",
    },
    { label: "rollData.risk.biggestLoss", value: n(tl.maxLost) },
    { label: "rollData.risk.lost", value: n(tl.lostPoints) },
  ];

  const faces = faceComparisons(tl);

  return (
    <>
      <dl className="stats-grid roll-data__tiles">
        {tiles.map((tile) => (
          <div key={tile.label} className="stat-tile">
            <dt className="stat-tile__label">{t(tile.label)}</dt>
            <dd className="stat-tile__value">{tile.value}</dd>
          </div>
        ))}
      </dl>

      <section className="support-section" aria-labelledby={`${ids}-odds`}>
        <h2 id={`${ids}-odds`}>
          {t(scope === "all" ? "rollData.odds.titleAll" : "rollData.odds.title")}
        </h2>
        <div className="roll-odds__scroll">
          <table className="roll-odds">
            <thead>
              <tr>
                <th scope="col">{t("rollData.odds.event")}</th>
                <th scope="col">
                  {t(scope === "all" ? "rollData.odds.actual" : "rollData.odds.you")}
                </th>
                <th scope="col">{t("rollData.odds.expected")}</th>
                <th scope="col">{t("rollData.odds.luck")}</th>
              </tr>
            </thead>
            <tbody>
              {oddsComparisons(tl).map((row) => {
                const luck = luckOf(row);
                return (
                  <tr key={row.key}>
                    <th scope="row">
                      {t(`rollData.odds.${row.key}` as MsgKey)}
                      <span className="roll-odds__chances">
                        {t("rollData.odds.chances", { n: n(row.chances), count: n(row.actual) })}
                      </span>
                    </th>
                    <td>{p(row.actual, row.chances)}</td>
                    <td>{p(row.expected, row.chances)}</td>
                    <td>
                      <span className={`roll-luck roll-luck--${luck}`}>
                        <span aria-hidden="true">
                          {luck === "good"
                            ? "▲"
                            : luck === "bad"
                              ? "▼"
                              : luck === "normal"
                                ? "●"
                                : "…"}
                        </span>{" "}
                        {t(`rollData.luck.${luck}` as MsgKey)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="roll-data__note">{t("rollData.odds.note")}</p>
      </section>

      <section className="support-section" aria-labelledby={`${ids}-points`}>
        <h2 id={`${ids}-points`}>{t("rollData.points.title")}</h2>
        <dl className="stats-grid">
          <div className="stat-tile">
            <dt className="stat-tile__label">{t("rollData.points.perThrow")}</dt>
            <dd className="stat-tile__value">{dec.format(ratio(tl.gain, tl.throws))}</dd>
          </div>
          <div className="stat-tile">
            <dt className="stat-tile__label">{t("rollData.points.expectedPerThrow")}</dt>
            <dd className="stat-tile__value">{dec.format(ratio(tl.eGain, tl.throws))}</dd>
          </div>
          <div className="stat-tile">
            <dt className="stat-tile__label">{t("rollData.points.luck")}</dt>
            <dd className="stat-tile__value">
              {luckPoints >= 0 ? "+" : "−"}
              {n(Math.round(Math.abs(luckPoints)))}
            </dd>
          </div>
        </dl>
        <p className="roll-data__note">{t("rollData.points.note")}</p>
      </section>

      <section className="support-section" aria-labelledby={`${ids}-risk`}>
        <h2 id={`${ids}-risk`}>{t("rollData.risk.title")}</h2>
        <dl className="stats-grid">
          {risk.map((tile) => (
            <div key={tile.label} className="stat-tile">
              <dt className="stat-tile__label">{t(tile.label)}</dt>
              <dd className="stat-tile__value">{tile.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="support-section">
        <ScoreChart
          points={summary.series}
          perDay={scope === "all"}
          runs={runs}
          title={t("rollData.chart.title")}
        />
      </section>

      <section className="support-section">
        <FaceChart counts={faces.map((f) => f.actual)} title={t("rollData.faces.title")} />
        <p className="roll-data__note">
          {t("rollData.faces.note", { n: n(tl.dice) })}{" "}
          {faces.some((f) => f.z !== null && Math.abs(f.z) >= 3)
            ? t("rollData.faces.uneven")
            : t("rollData.faces.even")}
        </p>
      </section>
    </>
  );
}
