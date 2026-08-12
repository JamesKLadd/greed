import { useCallback, useEffect, useState } from "react";
import {
  fetchLeaderboard,
  fetchMatches,
  LEADERBOARD_CATEGORIES,
  type LeaderboardCategory,
  type LeaderboardView,
  type MatchRecord,
} from "../net/leaderboards.js";
import { ApiError } from "../net/auth.js";
import { useAuth } from "../game/auth.js";
import { useI18n, useT } from "../i18n/i18n.js";
import type { MsgKey } from "../i18n/i18n.js";
import { teamName } from "../game/teams.js";

/**
 * Career boards and your own match history.
 *
 * The boards read the same synced profile the Stats screen shows, so the two can
 * never disagree. That also means they are only as honest as the clients that
 * reported them — the merge is monotonic, so a figure can be inflated but never
 * silently rolled back — which is why this is framed as a scoreboard rather than
 * a ranked ladder.
 */

type Tab = LeaderboardCategory | "history";

export function LeaderboardScreen({ onBack }: { onBack: () => void }) {
  const t = useT();
  const { n } = useI18n();
  const { status: authStatus } = useAuth();
  const [tab, setTab] = useState<Tab>("wins");
  const [board, setBoard] = useState<LeaderboardView | null>(null);
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
    <div className="setup">
      <div className="setup__hero">
        <h1 className="setup__logo">{t("board.title")}</h1>
        <p className="setup__tagline">{t("board.tagline")}</p>
      </div>

      <div className="setup__panel">
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

        {!loading && tab !== "history" && board && (
          <>
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
                    <span className="match__result">
                      {m.won ? t("board.won") : t("board.lost")}
                    </span>
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
          <button className="btn btn--ghost" onClick={onBack}>
            {t("bar.home")}
          </button>
        </div>
      </div>
    </div>
  );
}
