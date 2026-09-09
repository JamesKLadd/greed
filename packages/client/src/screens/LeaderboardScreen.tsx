import { useCallback, useEffect, useState } from "react";
import {
  fetchDailyBest,
  fetchLeaderboard,
  fetchMatches,
  fetchWeeklyBest,
  LEADERBOARD_CATEGORIES,
  type LeaderboardCategory,
  type DailyBestView,
  type LeaderboardView,
  type MatchRecord,
  type WeeklyBestView,
} from "../net/leaderboards.js";
import { ApiError } from "../net/auth.js";
import { useAuth } from "../game/auth.js";
import { useI18n, useT } from "../i18n/i18n.js";
import { formatDay } from "../i18n/dates.js";
import type { MsgKey } from "../i18n/i18n.js";
import { teamName } from "../game/teams.js";
import { Button, Screen } from "../ui/index.js";

/**
 * Career boards and your own match history.
 *
 * The boards read the same synced profile the Stats screen shows, so the two can
 * never disagree. That also means they are only as honest as the clients that
 * reported them — the merge is monotonic, so a figure can be inflated but never
 * silently rolled back — which is why this is framed as a scoreboard rather than
 * a ranked ladder.
 */

type Tab = LeaderboardCategory | "daily" | "weekly" | "history";

function isCareer(tab: Tab): tab is LeaderboardCategory {
  return (LEADERBOARD_CATEGORIES as readonly string[]).includes(tab);
}

export function LeaderboardScreen({ onBack }: { onBack: () => void }) {
  const t = useT();
  const { n } = useI18n();
  const { status: authStatus } = useAuth();
  const [tab, setTab] = useState<Tab>("wins");
  const [board, setBoard] = useState<LeaderboardView | null>(null);
  const [daily, setDaily] = useState<DailyBestView | null>(null);
  const [weekly, setWeekly] = useState<WeeklyBestView | null>(null);
  const [matches, setMatches] = useState<MatchRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (which: Tab) => {
      setLoading(true);
      setError(null);
      const done = () => setLoading(false);
      const fail = (err: unknown) =>
        setError(err instanceof ApiError ? err.message : t("board.loadFailed"));
      if (which === "history") {
        fetchMatches()
          .then((r) => setMatches(r.matches))
          .catch(fail)
          .finally(done);
      } else if (which === "daily") {
        fetchDailyBest().then(setDaily).catch(fail).finally(done);
      } else if (which === "weekly") {
        // A server that predates the weekly 404s here; the shared `fail` shows
        // that as a message rather than an empty board with no explanation.
        fetchWeeklyBest().then(setWeekly).catch(fail).finally(done);
      } else {
        fetchLeaderboard(which).then(setBoard).catch(fail).finally(done);
      }
    },
    [t],
  );

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  const signedOut = authStatus !== "authed";

  return (
    <Screen title={t("board.title")} tagline={t("board.tagline")}>
      <div className="board-tabs">
        {LEADERBOARD_CATEGORIES.map((c) => (
          <button
            key={c}
            className={tab === c ? "segmented__btn segmented__btn--on" : "segmented__btn"}
            onClick={() => setTab(c)}
          >
            {t(`board.cat.${c}` as MsgKey)}
          </button>
        ))}
        {/* The daily boards are runs, not careers: a different table, a different
            shape (a run has a date), so it is its own tab rather than a fifth
            category on the career board. */}
        <button
          className={tab === "daily" ? "segmented__btn segmented__btn--on" : "segmented__btn"}
          onClick={() => setTab("daily")}
        >
          {t("board.cat.daily")}
        </button>
        <button
          className={tab === "weekly" ? "segmented__btn segmented__btn--on" : "segmented__btn"}
          onClick={() => setTab("weekly")}
        >
          {t("board.cat.weekly")}
        </button>
        {/* History needs an account — it is your own games, not a public board. */}
        {!signedOut && (
          <button
            className={tab === "history" ? "segmented__btn segmented__btn--on" : "segmented__btn"}
            onClick={() => setTab("history")}
          >
            {t("board.history")}
          </button>
        )}
      </div>

      {error && <div className="banner banner--sd">{error}</div>}
      {loading && <p className="daily__status">{t("board.loading")}</p>}

      {/* The career boards. Spelled out as "is a career category" rather than
          "isn't history": a third kind of tab arrived, and the loose test drew
          the last career board underneath it. */}
      {!loading && isCareer(tab) && board && (
        <>
          {/* What these boards measure changed when they stopped ranking the
              profile a client uploads and started ranking games the server ran
              itself. Say so, rather than leaving a player to wonder why their
              offline wins are missing. */}
          <p className="daily__note daily__note--hint">{t("board.onlineOnly")}</p>
          {board.entries.length === 0 ? (
            <p className="daily__status">{t("board.empty")}</p>
          ) : (
            <ol className="board">
              {board.entries.map((e) => (
                <li
                  key={`${e.rank}-${e.username}`}
                  className={e.you ? "board__row board__row--you" : "board__row"}
                >
                  <span className="board__rank">#{e.rank}</span>
                  <span className="board__name">{e.username}</span>
                  <span className="board__value">{n(e.value)}</span>
                </li>
              ))}
            </ol>
          )}
          {/* Your own standing, even when you are nowhere near the top slice. */}
          {board.yourRank !== null && (
            <p className="daily__note">
              {t("board.yourRank", { rank: board.yourRank, players: board.players })}
            </p>
          )}
          {signedOut && <p className="daily__status">{t("board.signInForRank")}</p>}
        </>
      )}

      {!loading && tab === "daily" && daily && (
        <>
          {daily.entries.length === 0 ? (
            <p className="daily__status">{t("board.empty")}</p>
          ) : (
            <ol className="board">
              {daily.entries.map((e) => (
                <li
                  key={`${e.rank}-${e.username}-${e.day}`}
                  className={e.you ? "board__row board__row--you" : "board__row"}
                >
                  <span className="board__rank">#{e.rank}</span>
                  <span className="board__name">
                    {e.username}
                    <span className="board__when">{formatDay(e.day)}</span>
                  </span>
                  <span className="board__value">{n(e.score)}</span>
                </li>
              ))}
            </ol>
          )}
          {/* Your own best run, even when it is nowhere near the top slice. */}
          {daily.yourBest && (
            <p className="daily__note">
              {t("board.yourBestRun", {
                score: n(daily.yourBest.score),
                date: formatDay(daily.yourBest.day),
                rank: daily.yourBest.rank,
                runs: daily.runs,
              })}
            </p>
          )}
          {/* Said plainly, because a board that quietly omits today is worse
              than one that says it is doing so. */}
          {daily.todayHidden && <p className="daily__status">{t("board.dailyTodayHidden")}</p>}
          {signedOut && <p className="daily__status">{t("board.signInForRank")}</p>}
        </>
      )}

      {/* A row here is a player's WEEK, not an attempt: weekly_runs already keeps
          only the best attempt of each week, so a great week appears once
          however many tries it took. */}
      {!loading && tab === "weekly" && weekly && (
        <>
          {weekly.entries.length === 0 ? (
            <p className="daily__status">{t("board.empty")}</p>
          ) : (
            <ol className="board">
              {weekly.entries.map((e) => (
                <li
                  key={`${e.rank}-${e.username}-${e.week}`}
                  className={e.you ? "board__row board__row--you" : "board__row"}
                >
                  <span className="board__rank">#{e.rank}</span>
                  <span className="board__name">
                    {e.username}
                    <span className="board__when">{formatDay(e.week)}</span>
                  </span>
                  <span className="board__value">{n(e.score)}</span>
                </li>
              ))}
            </ol>
          )}
          {weekly.yourBest && (
            <p className="daily__note">
              {t("board.yourBestWeek", {
                score: n(weekly.yourBest.score),
                date: formatDay(weekly.yourBest.week),
                rank: weekly.yourBest.rank,
                runs: weekly.runs,
              })}
            </p>
          )}
          {signedOut && <p className="daily__status">{t("board.signInForRank")}</p>}
        </>
      )}

      {!loading && tab === "history" && matches && (
        <>
          {matches.length === 0 ? (
            <p className="daily__status">{t("board.noMatches")}</p>
          ) : (
            <ul className="board">
              {matches.map((m, i) => (
                <li
                  key={`${m.playedAt}-${i}`}
                  className={m.won ? "match match--won" : "match match--lost"}
                >
                  <span className="match__result">{m.won ? t("board.won") : t("board.lost")}</span>
                  <span className="match__body">
                    <span className="match__opponents">
                      {m.opponents.length > 0
                        ? t("board.versus", { names: m.opponents.join(", ") })
                        : t("board.soloGame")}
                    </span>
                    <span className="match__meta">
                      {new Date(m.playedAt).toLocaleDateString()} ·{" "}
                      {t("board.ofGoal", { goal: m.goal })}
                      {m.team !== null && ` · ${teamName(t, m.team)}`}
                    </span>
                  </span>
                  <span className="match__score">{n(m.score)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <div className="setup__actions">
        <Button variant="ghost" onClick={onBack}>
          {t("bar.home")}
        </Button>
      </div>
    </Screen>
  );
}
