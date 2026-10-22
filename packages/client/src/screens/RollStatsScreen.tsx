import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { dailyKey } from "@greed/core";
import {
  CLOSE_CALL,
  STATS_MODES,
  decisionsCsv,
  emptyTally,
  faceComparisons,
  gamesCsv,
  mergeTallies,
  oddsComparisons,
  tallyGame,
  throwsCsv,
  type OddsComparison,
  type RollTally,
} from "@greed/bots";
import { useAuth } from "../game/auth.js";
import { deviceRollGames } from "../game/rollRecords.js";
import {
  STATS_WINDOWS,
  StatsUnavailable,
  fetchRollActivity,
  isNoSuchAccount,
  fetchRollCsv,
  fetchRollSummary,
  type ExportKind,
  type RollActivity,
  type RollSummary,
  type StatsScope,
  type StatsView,
} from "../net/rollStats.js";
import {
  FaceChart,
  ScoreChart,
  ShareBars,
  TrendChart,
  type ShareRow,
} from "../components/ScoreChart.js";
import { AccountPicker } from "../components/AccountPicker.js";
import { apiErrorText } from "../i18n/apiError.js";
import { useI18n, type MsgKey } from "../i18n/i18n.js";
import { Button, Screen } from "../ui/index.js";

/** The modes a view can be switched between. */
const ADMIN_VIEWS: readonly ("games" | "daily" | "weekly")[] = ["games", "daily", "weekly"];
const GAME_SPLITS: readonly ("games" | "local" | "online")[] = ["games", "local", "online"];
const EXPORTS: readonly ExportKind[] = ["games", "throws", "decisions"];
const DAY_MS = 86_400_000;

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

/**
 * The audit runs on every check, every window, every view — so it is asked the
 * same question many times, and a 1-in-100 result will turn up by chance now
 * and then. Only a 1-in-1000 one is called trouble.
 */
function verdictOf(p: number): "fair" | "watch" | "unfair" {
  return p >= 0.01 ? "fair" : p >= 0.001 ? "watch" : "unfair";
}

/** Everything the screen draws, from either the server or this device. */
interface Data {
  summary: RollSummary;
  /** Saves a CSV; for a guest it is built here, from the device's games. */
  csv: (kind: ExportKind) => Promise<string>;
  guest: boolean;
}

function deviceData(days: number): Data {
  const since = Date.now() - days * DAY_MS;
  const games = deviceRollGames()
    .filter((g) => Date.parse(g.playedAt) >= since)
    .sort((a, b) => Date.parse(a.playedAt) - Date.parse(b.playedAt));
  const tallies = games.map(tallyGame);
  const rows = games.map((game) => ({ game }));
  return {
    guest: true,
    summary: {
      view: "local",
      days,
      tally: tallies.reduce(mergeTallies, emptyTally()),
      playerCount: games.length ? 1 : 0,
      series: games.map((g, i) => ({
        at: g.playedAt,
        score: g.finished ? g.score : null,
        luck: tallies[i].gain - tallies[i].eGain,
        games: 1,
      })),
    },
    csv: async (kind) =>
      kind === "games" ? gamesCsv(rows) : kind === "throws" ? throwsCsv(rows) : decisionsCsv(rows),
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
  const [days, setDays] = useState<number>(STATS_WINDOWS[STATS_WINDOWS.length - 1]);
  const [data, setData] = useState<Data | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<ExportKind | null>(null);
  const [exportFailed, setExportFailed] = useState(false);
  const [activity, setActivity] = useState<RollActivity | null>(null);
  const [activityFailed, setActivityFailed] = useState(false);
  // The owner looking at one player: their own report, as that player sees it.
  const [account, setAccount] = useState<string | null>(null);
  const [accountDraft, setAccountDraft] = useState("");
  const [accountProblem, setAccountProblem] = useState<string | null>(null);
  const viewing: StatsScope = scope === "all" && account ? "user" : scope;

  const guest = scope === "me" && authStatus !== "authed";
  const isGames = view === "games" || view === "local" || view === "online";

  const load = useCallback(async () => {
    setLoading(true);
    setProblem(null);
    try {
      if (guest) {
        setData(deviceData(days));
      } else {
        const summary = await fetchRollSummary(viewing, view, days, account ?? undefined);
        setData({
          summary,
          guest: false,
          csv: (kind) => fetchRollCsv(viewing, view, kind, days, account ?? undefined),
        });
        if (summary.username) setAccount(summary.username);
      }
    } catch (err) {
      if (isNoSuchAccount(err)) {
        // Stay on what was showing; say so beside the box it was typed in.
        setAccountProblem(t("rollData.account.notFound", { name: account ?? "" }));
        setAccount(null);
        return;
      }
      setData(null);
      setProblem(
        err instanceof StatsUnavailable
          ? t("rollData.unavailable")
          : apiErrorText(t, err, "rollData.failed"),
      );
    } finally {
      setLoading(false);
    }
  }, [guest, viewing, account, view, days, t]);

  useEffect(() => {
    if (authStatus === "loading") return;
    void load();
  }, [authStatus, load]);

  // Who is playing covers every mode, so it follows the window but not the view.
  const loadActivity = useCallback(async () => {
    setActivityFailed(false);
    try {
      setActivity(await fetchRollActivity(days));
    } catch {
      setActivity(null);
      setActivityFailed(true);
    }
  }, [days]);

  useEffect(() => {
    if (scope !== "all" || authStatus !== "authed") return;
    void loadActivity();
  }, [scope, authStatus, loadActivity]);

  const pct = useMemo(
    () => new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }),
    [locale],
  );
  const dec = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }), [locale]);

  const runs = view === "daily" || view === "weekly";
  const title =
    viewing === "user" && account
      ? t("rollData.account.title", { name: account })
      : scope === "all"
        ? t("rollData.titleAll")
        : t("rollData.title");

  const exportCsv = async (kind: ExportKind) => {
    if (!data) return;
    setExporting(kind);
    setExportFailed(false);
    try {
      const prefix =
        viewing === "user" && account
          ? `greed-${account}`
          : scope === "all"
            ? "greed-all-players"
            : "greed";
      save(await data.csv(kind), `${prefix}-${view}-${kind}-${days}d.csv`);
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
          {t("rollData.window", { days: n(days) })}
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
      {scope === "all" && (
        <form
          className="roll-data__account"
          onSubmit={(e) => {
            e.preventDefault();
            const name = accountDraft.trim();
            if (!name) return;
            setAccountProblem(null);
            setAccount(name);
          }}
        >
          <div className="roll-data__account-row">
            <AccountPicker
              value={accountDraft}
              onChange={setAccountDraft}
              onPick={(name) => {
                setAccountProblem(null);
                setAccount(name);
              }}
              label={t("rollData.account.label")}
              placeholder={t("rollData.account.placeholder")}
            />
            <Button type="submit" disabled={!accountDraft.trim()}>
              {t("rollData.account.view")}
            </Button>
          </div>
          {accountProblem && (
            <p className="roll-data__note" role="alert">
              {accountProblem}
            </p>
          )}
          {account && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setAccount(null);
                setAccountDraft("");
              }}
            >
              {t("rollData.account.back")}
            </Button>
          )}
        </form>
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
      <div
        className="roll-data__tabs roll-data__tabs--sub"
        role="group"
        aria-label={t("rollData.chooseWindow")}
      >
        {STATS_WINDOWS.map((d) => (
          <button
            key={d}
            type="button"
            className="btn btn--ghost"
            aria-pressed={days === d}
            onClick={() => setDays(d)}
          >
            {t("rollData.windowDays", { days: n(d) })}
          </button>
        ))}
      </div>
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
            scope={viewing === "user" ? "me" : scope}
            runs={runs}
            weekly={view === "weekly"}
            pct={pct}
            dec={dec}
          />
        )}
      </div>

      {scope === "all" && !account && (activity || activityFailed) && (
        <Activity activity={activity} onRetry={() => void loadActivity()} />
      )}

      {tally && tally.games > 0 && (
        <section className="support-section roll-data__export" aria-labelledby={`${ids}-export`}>
          <h2 id={`${ids}-export`}>{t("rollData.export.title")}</h2>
          <p className="roll-data__note">{t("rollData.export.note")}</p>
          <div className="roll-data__export-buttons">
            {EXPORTS.map((kind) => (
              <Button key={kind} disabled={exporting !== null} onClick={() => void exportCsv(kind)}>
                {exporting === kind
                  ? t("rollData.export.working")
                  : t(`rollData.export.${kind}` as MsgKey)}
              </Button>
            ))}
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

interface Tile {
  label: MsgKey;
  value: string;
  /** Everyone's figure, or what a count cost, in small type underneath. */
  sub?: string;
}

function Tiles({ tiles, className = "" }: { tiles: Tile[]; className?: string }) {
  const { t } = useI18n();
  return (
    <dl className={`stats-grid ${className}`.trim()}>
      {tiles.map((tile) => (
        <div key={tile.label} className="stat-tile">
          <dt className="stat-tile__label">{t(tile.label)}</dt>
          <dd className="stat-tile__value">{tile.value}</dd>
          {tile.sub && <dd className="stat-tile__sub">{tile.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}

function Report({
  tally: tl,
  summary,
  scope,
  runs,
  weekly,
  pct,
  dec,
}: {
  tally: RollTally;
  /** `username` set: the owner reading one player's report, named rather than "you". */
  summary: RollSummary;
  scope: StatsScope;
  runs: boolean;
  /** The weekly's attempts: charted one after another, not on the clock. */
  weekly: boolean;
  pct: Intl.NumberFormat;
  dec: Intl.NumberFormat;
}) {
  const { t, n } = useI18n();
  const ids = useId();
  const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);
  const p = (a: number, b: number) => (b > 0 ? pct.format(a / b) : "—");
  const signed = (v: number) => {
    const r = Math.round(v);
    return (r > 0 ? "+" : r < 0 ? "−" : "") + n(Math.abs(r));
  };
  const luckPoints = tl.gain - tl.eGain;
  // Everyone's numbers, beside a player's own; never on the all-players view,
  // where "everyone" is the view itself.
  const ev = summary.everyone && summary.everyone.throws > 0 ? summary.everyone : null;
  const vs = (value: string) => (ev ? t("rollData.vsEveryone", { value }) : undefined);

  const tiles: Tile[] = [
    { label: runs ? "rollData.tile.runs" : "rollData.tile.games", value: n(tl.games) },
    ...(scope === "all"
      ? [{ label: "rollData.tile.players" as MsgKey, value: n(summary.playerCount) }]
      : []),
    { label: "rollData.tile.throws", value: n(tl.throws) },
    {
      label: "rollData.tile.avgScore",
      value: tl.finished > 0 ? n(Math.round(tl.scoreSum / tl.finished)) : "—",
      sub: ev && ev.finished > 0 ? vs(n(Math.round(ev.scoreSum / ev.finished))) : undefined,
    },
    {
      label: "rollData.tile.perTurn",
      value: n(Math.round(ratio(tl.bankedPoints, tl.turns))),
      sub: ev ? vs(n(Math.round(ratio(ev.bankedPoints, ev.turns)))) : undefined,
    },
    ...(!runs && tl.decided > 0
      ? [
          {
            label: "rollData.tile.winRate" as MsgKey,
            value: p(tl.wins, tl.decided),
            sub: ev && ev.decided > 0 ? vs(p(ev.wins, ev.decided)) : undefined,
          },
        ]
      : []),
    ...(tl.games > tl.finished
      ? [{ label: "rollData.tile.unfinished" as MsgKey, value: n(tl.games - tl.finished) }]
      : []),
  ];

  const risk: Tile[] = [
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

  const evOdds = useMemo(
    () => (ev ? new Map(oddsComparisons(ev).map((row) => [row.key, row])) : null),
    [ev],
  );

  // A player's luck is a running total, game by game; everyone's is each day's
  // average per game, which fair dice keep near zero.
  const luckSeries = useMemo(() => {
    const known = summary.series.flatMap((s, i) => (s.luck === null ? [] : [{ ...s, i }]));
    if (scope === "all") {
      return known.map((s) => ({ at: s.at, value: s.luck!, games: s.games }));
    }
    let total = 0;
    return known.map((s) => ({ at: s.at, value: (total += s.luck!), attempt: s.i + 1 }));
  }, [summary.series, scope]);

  // A player's series is one row per game or run, oldest first, so its place in
  // the series is its attempt number — unfinished ones included, which is what
  // keeps the score and luck charts numbering the same attempts alike.
  const scores = useMemo(
    () =>
      summary.series.flatMap((s, i) =>
        s.score === null ? [] : [{ at: s.at, score: s.score, games: s.games, attempt: i + 1 }],
      ),
    [summary.series],
  );
  const byAttempt = weekly && scope !== "all";

  const bankRows: ShareRow[] = [
    { key: "bk0", label: t("rollData.bank.under", { n: n(300) }), value: tl.bk0 },
    { key: "bk1", label: t("rollData.bank.range", { from: n(300), to: n(499) }), value: tl.bk1 },
    { key: "bk2", label: t("rollData.bank.range", { from: n(500), to: n(749) }), value: tl.bk2 },
    { key: "bk3", label: t("rollData.bank.range", { from: n(750), to: n(999) }), value: tl.bk3 },
    { key: "bk4", label: t("rollData.bank.over", { n: n(1000) }), value: tl.bk4 },
  ].map((r) => ({ ...r, detail: t("rollData.bank.count", { n: n(r.value) }) }));

  const sourceRows: ShareRow[] = (
    [
      ["ones", tl.pOnes],
      ["fives", tl.pFives],
      ["triple", tl.pTriple],
      ["straight", tl.pStraight],
      ["five", tl.pFive],
    ] as const
  ).map(([key, value]) => ({
    key,
    label: t(`rollData.sources.${key}` as MsgKey),
    value,
    detail: t("rollData.sources.points", { n: n(Math.round(value)) }),
  }));

  const diceRows = ([1, 2, 3, 4, 5] as const).filter((k) => tl[`dn${k}`] > 0);
  const faces = faceComparisons(tl);
  const audit = summary.audit;

  return (
    <>
      <Tiles tiles={tiles} className="roll-data__tiles" />

      <section className="support-section" aria-labelledby={`${ids}-odds`}>
        <h2 id={`${ids}-odds`}>
          {summary.username
            ? t("rollData.account.odds", { name: summary.username })
            : t(scope === "all" ? "rollData.odds.titleAll" : "rollData.odds.title")}
        </h2>
        <div className="roll-odds__scroll">
          <table className="roll-odds">
            <thead>
              <tr>
                <th scope="col">{t("rollData.odds.event")}</th>
                <th scope="col">
                  {summary.username ??
                    t(scope === "all" ? "rollData.odds.actual" : "rollData.odds.you")}
                </th>
                {evOdds && <th scope="col">{t("rollData.odds.everyone")}</th>}
                <th scope="col">{t("rollData.odds.expected")}</th>
                <th scope="col" className="roll-odds__luck-col">
                  {t("rollData.odds.luck")}
                </th>
              </tr>
            </thead>
            <tbody>
              {oddsComparisons(tl).map((row) => {
                const everyone = evOdds?.get(row.key);
                const verdict = <LuckVerdict luck={luckOf(row)} />;
                return (
                  <tr key={row.key}>
                    <th scope="row">
                      {t(`rollData.odds.${row.key}` as MsgKey)}
                      <span className="roll-odds__chances">
                        {t("rollData.odds.chances", { n: n(row.chances), count: n(row.actual) })}
                      </span>
                      {/* On a phone the verdict moves under the event, which
                          makes room for the Everyone column; see roll-data.css. */}
                      <span className="roll-odds__luck-inline">{verdict}</span>
                    </th>
                    <td>{p(row.actual, row.chances)}</td>
                    {evOdds && <td>{everyone ? p(everyone.actual, everyone.chances) : "—"}</td>}
                    <td>{p(row.expected, row.chances)}</td>
                    <td className="roll-odds__luck-col">{verdict}</td>
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
        <Tiles
          tiles={[
            {
              label: "rollData.points.perThrow",
              value: dec.format(ratio(tl.gain, tl.throws)),
              sub: ev ? vs(dec.format(ratio(ev.gain, ev.throws))) : undefined,
            },
            {
              label: "rollData.points.expectedPerThrow",
              value: dec.format(ratio(tl.eGain, tl.throws)),
            },
            { label: "rollData.points.luck", value: signed(luckPoints) },
          ]}
        />
        {summary.luckRank && (
          <p className="roll-data__rank">
            {t(summary.username ? "rollData.account.rank" : "rollData.points.rank", {
              name: summary.username ?? "",
              pct: pct.format(summary.luckRank.below / summary.luckRank.others),
              others: n(summary.luckRank.others),
            })}
          </p>
        )}
        <p className="roll-data__note">{t("rollData.points.note")}</p>
      </section>

      {luckSeries.length > 0 && (
        <section className="support-section">
          <TrendChart
            points={luckSeries}
            perDay={scope === "all"}
            signed
            byAttempt={byAttempt}
            title={t(
              scope === "all"
                ? "rollData.luckChart.titleAll"
                : byAttempt
                  ? "rollData.luckChart.titleAttempts"
                  : "rollData.luckChart.title",
            )}
            valueLabel={t("rollData.luckChart.value")}
            ariaKey="rollData.luckChart.aria"
          />
          <p className="roll-data__note">
            {t(scope === "all" ? "rollData.luckChart.noteAll" : "rollData.luckChart.note")}
          </p>
        </section>
      )}

      {tl.dec > 0 && (
        <section className="support-section" aria-labelledby={`${ids}-decisions`}>
          <h2 id={`${ids}-decisions`}>{t("rollData.decisions.title")}</h2>
          <Tiles
            tiles={[
              {
                label: "rollData.decisions.good",
                value: p(tl.decGood, tl.dec),
                sub: ev && ev.dec > 0 ? vs(p(ev.decGood, ev.dec)) : undefined,
              },
              {
                label: "rollData.decisions.cautious",
                value: n(tl.decCautious),
                sub:
                  tl.decCautious > 0
                    ? t("rollData.decisions.costOf", { n: n(Math.round(tl.costCautious)) })
                    : undefined,
              },
              {
                label: "rollData.decisions.greedy",
                value: n(tl.decGreedy),
                sub:
                  tl.decGreedy > 0
                    ? t("rollData.decisions.costOf", { n: n(Math.round(tl.costGreedy)) })
                    : undefined,
              },
              {
                label: "rollData.decisions.cost",
                value: dec.format(ratio(tl.costCautious + tl.costGreedy, tl.decGames)),
                sub:
                  ev && ev.decGames > 0
                    ? vs(dec.format(ratio(ev.costCautious + ev.costGreedy, ev.decGames)))
                    : undefined,
              },
            ]}
          />
          <p className="roll-data__note">{t("rollData.decisions.note", { n: n(CLOSE_CALL) })}</p>
        </section>
      )}

      {tl.dec > 0 && (
        <section className="support-section" aria-labelledby={`${ids}-banking`}>
          <h2 id={`${ids}-banking`}>{t("rollData.bank.title")}</h2>
          <ShareBars rows={bankRows} title={t("rollData.bank.sizes")} />
          <h3 className="roll-data__subhead">{t("rollData.bank.again")}</h3>
          <div className="roll-odds__scroll">
            <table className="roll-odds">
              <thead>
                <tr>
                  <th scope="col">{t("rollData.bank.dice")}</th>
                  <th scope="col">
                    {summary.username ??
                      t(scope === "all" ? "rollData.odds.actual" : "rollData.odds.you")}
                  </th>
                  {ev && <th scope="col">{t("rollData.odds.everyone")}</th>}
                  <th scope="col">{t("rollData.bank.best")}</th>
                </tr>
              </thead>
              <tbody>
                {diceRows.map((k) => (
                  <tr key={k}>
                    <th scope="row">
                      {k === 1 ? t("rollData.bank.die1") : t("rollData.bank.diceN", { n: n(k) })}
                      <span className="roll-odds__chances">
                        {t("rollData.bank.choices", { n: n(tl[`dn${k}`]) })}
                      </span>
                    </th>
                    <td>{p(tl[`dr${k}`], tl[`dn${k}`])}</td>
                    {ev && <td>{p(ev[`dr${k}`], ev[`dn${k}`])}</td>}
                    <td>{p(tl[`do${k}`], tl[`dn${k}`])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="roll-data__note">{t("rollData.bank.note")}</p>
        </section>
      )}

      {sourceRows.some((r) => r.value > 0) && (
        <section className="support-section">
          <ShareBars rows={sourceRows} title={t("rollData.sources.title")} />
          <p className="roll-data__note">{t("rollData.sources.note")}</p>
        </section>
      )}

      <section className="support-section" aria-labelledby={`${ids}-risk`}>
        <h2 id={`${ids}-risk`}>{t("rollData.risk.title")}</h2>
        <Tiles tiles={risk} />
      </section>

      {scores.length > 0 && (
        <section className="support-section">
          <ScoreChart
            points={scores}
            perDay={scope === "all"}
            runs={runs}
            byAttempt={byAttempt}
            title={t(byAttempt ? "rollData.chart.titleAttempts" : "rollData.chart.title")}
          />
        </section>
      )}

      {audit ? (
        <section className="support-section" aria-labelledby={`${ids}-audit`}>
          <h2 id={`${ids}-audit`}>{t("rollData.audit.title")}</h2>
          <Verdict p={audit.p} />
          <Tiles
            tiles={[
              {
                label: "rollData.audit.dice",
                value: n(audit.counts.reduce((a, b) => a + b, 0)),
              },
              { label: "rollData.audit.chi2", value: dec.format(audit.chi2) },
              {
                label: "rollData.audit.p",
                value: audit.p < 0.001 ? "< 0.001" : audit.p.toFixed(3),
              },
            ]}
          />
          <FaceChart counts={audit.counts} title={t("rollData.audit.chartTitle")} />
          <p className="roll-data__note">{t("rollData.audit.note")}</p>
        </section>
      ) : (
        <section className="support-section">
          <FaceChart counts={faces.map((f) => f.actual)} title={t("rollData.faces.title")} />
          <p className="roll-data__note">
            {t("rollData.faces.note", { n: n(tl.dice) })}{" "}
            {faces.some((f) => f.z !== null && Math.abs(f.z) >= 3)
              ? t("rollData.faces.uneven")
              : t("rollData.faces.even")}
          </p>
        </section>
      )}
    </>
  );
}

function LuckVerdict({ luck }: { luck: "good" | "bad" | "normal" | "few" }) {
  const { t } = useI18n();
  return (
    <span className={`roll-luck roll-luck--${luck}`}>
      <span aria-hidden="true">
        {luck === "good" ? "▲" : luck === "bad" ? "▼" : luck === "normal" ? "●" : "…"}
      </span>{" "}
      {t(`rollData.luck.${luck}` as MsgKey)}
    </span>
  );
}

function Verdict({ p }: { p: number }) {
  const { t } = useI18n();
  const v = verdictOf(p);
  return (
    <p className="roll-data__verdict">
      <span className="roll-data__verdict-label">{t("rollData.audit.verdict")}</span>{" "}
      <span className={`roll-verdict roll-verdict--${v}`}>
        <span aria-hidden="true">{v === "fair" ? "✓" : v === "watch" ? "!" : "✕"}</span>
        {t(`rollData.audit.${v}` as MsgKey)}
      </span>
    </p>
  );
}

/** Who is playing, and who comes back: the game owner's view only. */
function Activity({ activity, onRetry }: { activity: RollActivity | null; onRetry: () => void }) {
  const { t, n, locale } = useI18n();
  const ids = useId();
  const pct = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });
  const dec = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const dayFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }),
    [locale],
  );
  const day = (d: string) => dayFmt.format(new Date(`${d}T12:00:00Z`));

  if (!activity) {
    return (
      <section className="support-section" aria-labelledby={`${ids}-activity`}>
        <h2 id={`${ids}-activity`}>{t("rollData.activity.title")}</h2>
        <div className="challenge-lobby__error">
          <p role="alert">{t("rollData.activity.failed")}</p>
          <Button onClick={onRetry}>{t("challenge.retry")}</Button>
        </div>
      </section>
    );
  }
  const { daily, weekly } = activity;
  if (daily.length === 0) return null;

  // Every day from the first with any play to today. The server lists only days
  // someone played; a quiet day is a zero, not a gap for the line to bridge,
  // and it counts in the averages too.
  const byDay = new Map(daily.map((d) => [d.day, d]));
  const everyDay: { at: string; value: number; games: number }[] = [];
  const end = Date.parse(`${dailyKey()}T00:00:00Z`);
  for (let ts = Date.parse(`${daily[0].day}T00:00:00Z`); ts <= end; ts += DAY_MS) {
    const at = new Date(ts).toISOString().slice(0, 10);
    const d = byDay.get(at);
    everyDay.push({ at, value: d?.players ?? 0, games: d?.games ?? 0 });
  }
  const span = Math.max(1, everyDay.length);
  const players = daily.reduce((sum, d) => sum + d.players, 0);
  const games = daily.reduce((sum, d) => sum + d.games, 0);

  return (
    <section className="support-section" aria-labelledby={`${ids}-activity`}>
      <h2 id={`${ids}-activity`}>{t("rollData.activity.title")}</h2>
      <Tiles
        tiles={[
          { label: "rollData.activity.avgPlayers", value: dec.format(players / span) },
          { label: "rollData.activity.avgGames", value: dec.format(games / span) },
          {
            label: "rollData.activity.busiest",
            value: n(Math.max(...daily.map((d) => d.players))),
          },
        ]}
      />
      <div className="roll-data__chart-gap">
        <TrendChart
          points={everyDay}
          perDay
          whole
          title={t("rollData.activity.chartTitle")}
          valueLabel={t("rollData.activity.players")}
          ariaKey="rollData.activity.aria"
        />
      </div>
      <details className="roll-chart__table">
        <summary>{t("rollData.activity.byMode")}</summary>
        <div className="roll-odds__scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">{t("rollData.chart.date")}</th>
                {STATS_MODES.map((m) => (
                  <th key={m} scope="col">
                    {t(`rollData.mode.${m}` as MsgKey)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {daily.map((d) => (
                <tr key={d.day}>
                  <td>{day(d.day)}</td>
                  {STATS_MODES.map((m) => (
                    <td key={m}>{n(d.byMode[m]?.games ?? 0)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {weekly.length > 0 && (
        <>
          <h3 className="roll-data__subhead">{t("rollData.activity.weekly")}</h3>
          <div className="roll-odds__scroll">
            <table className="roll-odds">
              <thead>
                <tr>
                  <th scope="col">{t("rollData.activity.week")}</th>
                  <th scope="col">{t("rollData.activity.players")}</th>
                  <th scope="col">{t("rollData.activity.returning")}</th>
                </tr>
              </thead>
              <tbody>
                {weekly.map((w, i) => {
                  const before = weekly[i - 1];
                  const isPrev =
                    before && Date.parse(w.week) - Date.parse(before.week) === 7 * DAY_MS;
                  return (
                    <tr key={w.week}>
                      <th scope="row">{day(w.week)}</th>
                      <td>{n(w.players)}</td>
                      {/* The window's first week has no week before it in the
                          data, so nobody can be counted as coming back. */}
                      <td>
                        {i === 0
                          ? "—"
                          : `${n(w.returning)}${
                              isPrev && before.players > 0
                                ? ` (${pct.format(w.returning / before.players)})`
                                : ""
                            }`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="roll-data__note">{t("rollData.activity.note")}</p>
    </section>
  );
}
