import { useState } from "react";
import type { BotPersonality } from "@greed/core";
import type { OnlineController } from "../net/useOnlineGame.js";
import { PERSONALITIES } from "../game/setup.js";
import { useT } from "../i18n/i18n.js";
import { teamName } from "../game/teams.js";
import { Button, Screen } from "../ui/index.js";

const GOALS = [1000, 2000, 3000, 5000];

export function LobbyScreen({ net }: { net: OnlineController }) {
  const t = useT();
  const lobby = net.lobby!;
  const me = lobby.seats.find((s) => s.id === net.youId);
  const isHost = me?.isHost ?? false;
  const [botPers, setBotPers] = useState<BotPersonality>("balanced");

  return (
    <Screen
      tagline={
        <>
          {t("lobby.roomCode")}{" "}
          <span className="room-code" title={t("lobby.shareCode")}>
            {lobby.code}
          </span>
          {lobby.isPublic && (
            <span className="seat__tag" style={{ marginLeft: 8 }}>
              {t("lobby.public")}
            </span>
          )}
        </>
      }
    >
      {net.error && (
        <div className="banner banner--sd online-error" onClick={net.dismissError}>
          {net.error} <span className="online-error__x">✕</span>
        </div>
      )}

      {net.reconnecting && <div className="banner banner--sd">{t("net.reconnecting")}</div>}

      {net.isSpectator && <div className="banner banner--spectate">{t("spectate.lobbyWait")}</div>}

      <div className="setup__row setup__row--head">
        <h2>{t("lobby.players", { count: lobby.seats.length })}</h2>
        {isHost && (
          <div className="segmented">
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
            <Button variant="ghost" onClick={() => net.addBot(botPers)}>
              {t("lobby.addBot")}
            </Button>
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
                <span className="seat__tag">{t(`pers.${s.personality ?? "balanced"}`)}</span>
              )}
            </span>
            <span className={`lobby-seat__ready${s.ready ? " is-ready" : ""}`}>
              {s.isBot ? "" : s.ready ? t("lobby.ready") : t("lobby.notReady")}
            </span>
            {lobby.teams &&
              (isHost ? (
                <div className="segmented seats-config__team">
                  {[0, 1].map((side) => (
                    <button
                      key={side}
                      className={
                        s.team === side ? "segmented__btn segmented__btn--on" : "segmented__btn"
                      }
                      data-team={side}
                      onClick={() => net.setSeatTeam(s.id, side)}
                    >
                      {teamName(t, side)}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="seat__tag seat__tag--team" data-team={s.team}>
                  {teamName(t, s.team ?? 0)}
                </span>
              ))}
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
              className={lobby.goal === g ? "segmented__btn segmented__btn--on" : "segmented__btn"}
              disabled={!isHost}
              onClick={() => net.setGoal(g)}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Whether a seat is put on the clock to start its turn. A table of
          strangers needs it; a family in one room, passing a phone round and
          arguing about it, does not. */}
      <div className="setup__row">
        <span className="setup__label">{t("lobby.turnClock")}</span>
        <div className="segmented">
          <button
            className={lobby.turnTimer ? "segmented__btn segmented__btn--on" : "segmented__btn"}
            disabled={!isHost}
            onClick={() => net.setTurnTimerEnabled(true)}
          >
            {t("lobby.turnClockOn")}
          </button>
          <button
            className={!lobby.turnTimer ? "segmented__btn segmented__btn--on" : "segmented__btn"}
            disabled={!isHost}
            onClick={() => net.setTurnTimerEnabled(false)}
          >
            {t("lobby.turnClockOff")}
          </button>
        </div>
      </div>

      {lobby.teamsAvailable && (
        <div className="setup__row">
          <span className="setup__label">{t("setup.teams")}</span>
          <div className="segmented">
            <button
              className={!lobby.teams ? "segmented__btn segmented__btn--on" : "segmented__btn"}
              disabled={!isHost}
              onClick={() => net.setTeams(false)}
            >
              {t("setup.freeForAll")}
            </button>
            <button
              className={lobby.teams ? "segmented__btn segmented__btn--on" : "segmented__btn"}
              disabled={!isHost}
              onClick={() => net.setTeams(true)}
            >
              {t("setup.teamsOn", { size: lobby.seats.length / 2 })}
            </button>
          </div>
        </div>
      )}

      <div className="setup__actions">
        <Button variant="ghost" onClick={net.leave}>
          {t("bar.leave")}
        </Button>
        {!isHost && !net.isSpectator && (
          <button
            className={me?.ready ? "btn" : "btn btn--roll btn--big"}
            onClick={() => net.setReady(!me?.ready)}
          >
            {me?.ready ? t("lobby.unready") : t("lobby.readyUp")}
          </button>
        )}
        {isHost && (
          <Button variant="roll" size="lg" disabled={!lobby.canStart} onClick={net.startGame}>
            {lobby.canStart ? t("common.startGame") : t("lobby.waitingPlayers")}
          </Button>
        )}
      </div>
    </Screen>
  );
}
