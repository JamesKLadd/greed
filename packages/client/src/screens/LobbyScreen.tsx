import { useState } from "react";
import type { BotDifficulty, BotPersonality } from "@greed/core";
import type { OnlineController } from "../net/useOnlineGame.js";
import { useT } from "../i18n/i18n.js";

const DIFFICULTIES: BotDifficulty[] = ["easy", "medium", "hard", "expert"];
const PERSONALITIES: BotPersonality[] = ["cautious", "balanced", "reckless"];
const GOALS = [1000, 2000, 3000, 5000];

export function LobbyScreen({ net }: { net: OnlineController }) {
  const t = useT();
  const lobby = net.lobby!;
  const me = lobby.seats.find((s) => s.id === net.youId);
  const isHost = me?.isHost ?? false;
  const [botDiff, setBotDiff] = useState<BotDifficulty>("medium");
  const [botPers, setBotPers] = useState<BotPersonality>("balanced");

  return (
    <div className="setup">
      <div className="setup__hero">
        <h1 className="setup__logo">GREED</h1>
        <p className="setup__tagline">
          {t("lobby.roomCode")}{" "}
          <span className="room-code" title={t("lobby.shareCode")}>
            {lobby.code}
          </span>
          {lobby.isPublic && (
            <span className="seat__tag" style={{ marginLeft: 8 }}>
              {t("lobby.public")}
            </span>
          )}
        </p>
      </div>

      <div className="setup__panel">
        {net.error && (
          <div className="banner banner--sd online-error" onClick={net.dismissError}>
            {net.error} <span className="online-error__x">✕</span>
          </div>
        )}

        <div className="setup__row setup__row--head">
          <h2>{t("lobby.players", { count: lobby.seats.length })}</h2>
          {isHost && (
            <div className="segmented">
              <select
                className="seats-config__diff"
                value={botDiff}
                onChange={(e) => setBotDiff(e.target.value as BotDifficulty)}
                aria-label={t("lobby.aria.botDifficulty")}
              >
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>
                    {t(`diff.${d}`)}
                  </option>
                ))}
              </select>
              <select
                className="seats-config__diff"
                value={botPers}
                onChange={(e) => setBotPers(e.target.value as BotPersonality)}
                aria-label={t("lobby.aria.botPersonality")}
              >
                {PERSONALITIES.map((p) => (
                  <option key={p} value={p}>
                    {t(`pers.${p}`)}
                  </option>
                ))}
              </select>
              <button className="btn btn--ghost" onClick={() => net.addBot(botDiff, botPers)}>
                {t("lobby.addBot")}
              </button>
            </div>
          )}
        </div>

        <ul className="seats-config">
          {lobby.seats.map((s) => (
            <li key={s.id} className="seats-config__row lobby-seat">
              <span className={`seat__dot${s.connected ? " seat__dot--on" : ""}`} />
              <span className="lobby-seat__name">
                {s.name}
                {s.id === net.youId && ` ${t("common.youParen")}`}
                {s.isHost && <span className="seat__tag">{t("lobby.host")}</span>}
                {s.isBot && (
                  <span className="seat__tag">{t(`diff.${s.difficulty ?? "easy"}`)}</span>
                )}
                {s.isBot && s.personality && s.personality !== "balanced" && (
                  <span className="seat__tag">{t(`pers.${s.personality}`)}</span>
                )}
              </span>
              <span className={`lobby-seat__ready${s.ready ? " is-ready" : ""}`}>
                {s.isBot ? "" : s.ready ? t("lobby.ready") : t("lobby.notReady")}
              </span>
              {isHost && !s.isHost && (
                <button
                  className="seats-config__remove"
                  onClick={() => net.removeSeat(s.id)}
                  aria-label={t("lobby.aria.remove", { name: s.name })}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>

        <div className="setup__row">
          <span className="setup__label">{t("common.goal")}</span>
          <div className="segmented">
            {GOALS.map((g) => (
              <button
                key={g}
                className={
                  lobby.goal === g ? "segmented__btn segmented__btn--on" : "segmented__btn"
                }
                disabled={!isHost}
                onClick={() => net.setGoal(g)}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        <div className="setup__actions">
          <button className="btn btn--ghost" onClick={net.leave}>
            {t("bar.leave")}
          </button>
          {!isHost && (
            <button
              className={me?.ready ? "btn" : "btn btn--roll btn--big"}
              onClick={() => net.setReady(!me?.ready)}
            >
              {me?.ready ? t("lobby.unready") : t("lobby.readyUp")}
            </button>
          )}
          {isHost && (
            <button
              className="btn btn--roll btn--big"
              disabled={!lobby.canStart}
              onClick={net.startGame}
            >
              {lobby.canStart ? t("common.startGame") : t("lobby.waitingPlayers")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
