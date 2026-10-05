import type { DailyResult } from "@greed/core";
import { useI18n } from "../i18n/i18n.js";
import { formatDay } from "../i18n/dates.js";
import { useAuth } from "../game/auth.js";
import { gameLink } from "../game/share.js";
import { ChallengeAvatar } from "./ChallengeAvatar.js";
import { ShareAction } from "./ShareAction.js";
import { ChallengeSummaryStats } from "./ChallengeLobby.js";
import { useRef } from "react";
import { dailyShareImage } from "../game/dailyShareImage.js";

export function DailyShareCard({
  day,
  result,
  rankText,
}: {
  day: string;
  result: DailyResult;
  rankText?: string;
}) {
  const { t, n } = useI18n();
  const { user } = useAuth();
  const portrait = useRef<HTMLSpanElement>(null);
  return (
    <section className="growth-result" aria-label={t("growth.shareDaily")}>
      <div className="growth-result__card">
        <span className="growth-result__brand">GREED</span>
        <span className="growth-result__date">{formatDay(day)}</span>
        {user && (
          <span className="growth-result__portrait" ref={portrait} aria-hidden="true">
            <ChallengeAvatar username={user.username} avatar="" />
          </span>
        )}
        <p>{t("challenge.dailyResult")}</p>
        <strong className="growth-result__score">{n(result.score)}</strong>
        <span>{t("challenge.points")}</span>
        {rankText && <p>{rankText}</p>}
        <small>{t("challenge.standingsLive")}</small>
        <p>
          {t("gameOver.bestTurn")}: {n(result.bestTurn)}
        </p>
        <strong>{t("growth.beatScore")}</strong>
      </div>
      <ShareAction
        title="Greed"
        text={t("growth.dailyShareText", {
          day: formatDay(day),
          score: n(result.score),
          best: n(result.bestTurn),
        })}
        url={gameLink({ challenge: "daily" })}
        label={t("growth.shareDaily")}
        event="daily_shared"
        createFile={() =>
          dailyShareImage({
            day,
            date: formatDay(day),
            score: n(result.score),
            best: n(result.bestTurn),
            bestLabel: t("gameOver.bestTurn"),
            challengeLabel: t("challenge.dailyResult"),
            pointsLabel: t("challenge.points"),
            hook: t("growth.beatScore"),
            portrait: portrait.current?.querySelector("svg"),
          })
        }
      />
      <ChallengeSummaryStats result={result} />
    </section>
  );
}
