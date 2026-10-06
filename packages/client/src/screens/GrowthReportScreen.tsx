import { useEffect, useState } from "react";
import { GROWTH_EVENTS, type GrowthEvent } from "@greed/protocol";
import { fetchGrowthReport, type MeasuredGrowthReport } from "../net/growth.js";
import { Button, Screen } from "../ui/index.js";
import { useI18n, type MsgKey } from "../i18n/i18n.js";

const channelLabels: Record<string, MsgKey> = {
  direct: "growth.source.direct",
  landing: "growth.source.landing",
  daily_share: "growth.source.dailyShare",
  room_invite: "growth.source.roomInvite",
  none: "growth.campaign.none",
  daily: "growth.campaign.daily",
  friends: "growth.campaign.friends",
  bank_or_roll: "growth.campaign.bankOrRoll",
  bust: "growth.campaign.bust",
  comeback: "growth.campaign.comeback",
};

export function GrowthReportScreen({ onBack }: { onBack: () => void }) {
  const { t, n, locale } = useI18n();
  const [report, setReport] = useState<MeasuredGrowthReport | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void fetchGrowthReport()
      .then((r) => {
        if (active) setReport(r);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  const rate = (part: number, whole: number) =>
    whole
      ? new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(
          part / whole,
        )
      : "—";
  const eventLabel = (event: string) =>
    GROWTH_EVENTS.includes(event as GrowthEvent)
      ? t(`growth.event.${event as GrowthEvent}`)
      : event.replaceAll("_", " ");
  const channelLabel = (value: string) => (channelLabels[value] ? t(channelLabels[value]) : value);
  const funnels = report?.funnels;
  return (
    <Screen
      hero={false}
      className="support-screen growth-report-screen"
      actions={
        <Button variant="ghost" onClick={onBack}>
          {t("bar.home")}
        </Button>
      }
    >
      <h1>{t("growth.report")}</h1>
      {error ? (
        <div role="alert">
          <p>{t("growth.reportError")}</p>
          <Button
            variant="ghost"
            onClick={() => {
              setError(false);
              setReport(null);
              setAttempt((a) => a + 1);
            }}
          >
            {t("growth.reportRetry")}
          </Button>
        </div>
      ) : !report ? (
        <p role="status">{t("screen.loading")}</p>
      ) : (
        <>
          <p>{t("growth.reportPeriod", { days: n(report.days), visitors: n(report.visitors) })}</p>
          <details className="growth-report-notes">
            <summary>{t("growth.measurementDetails")}</summary>
            <p>{t("growth.reportHint")}</p>
            <p>{t("growth.pathsHint")}</p>
          </details>
          {report.visitors === 0 && <p className="growth-board-note">{t("growth.reportEmpty")}</p>}
          <h2>{t("growth.paths")}</h2>
          {/* An older server has totals but no paired paths. Do not invent rates from those totals. */}
          {!funnels ? (
            <p className="growth-board-note">{t("growth.pathsUnavailable")}</p>
          ) : (
            funnels.map((funnel) => {
              const entered = funnel.steps[0]?.sessions ?? 0;
              const completed = funnel.steps.at(-1)?.sessions ?? 0;
              return (
                <section
                  className="growth-funnel"
                  key={funnel.id}
                  aria-labelledby={`funnel-${funnel.id}`}
                >
                  <h3 id={`funnel-${funnel.id}`}>{t(`growth.funnel.${funnel.id}`)}</h3>
                  <p>
                    {entered
                      ? t("growth.pathResult", {
                          completed: n(completed),
                          entered: n(entered),
                          rate: rate(completed, entered),
                        })
                      : t("growth.noSessions")}
                  </p>
                  <ol className="growth-funnel__steps">
                    {funnel.steps.map((step, i) => {
                      const previous = funnel.steps[i - 1]?.sessions ?? 0;
                      return (
                        <li key={step.event}>
                          <div className="growth-funnel__step">
                            <span>{eventLabel(step.event)}</span>
                            <strong>{n(step.sessions)}</strong>
                          </div>
                          <div className="growth-funnel__bar" aria-hidden="true">
                            <span
                              style={{ width: `${entered ? (step.sessions / entered) * 100 : 0}%` }}
                            />
                          </div>
                          {i > 0 && (
                            <small>
                              {t("growth.stepResult", {
                                rate: rate(step.sessions, previous),
                                lost: n(previous - step.sessions),
                              })}
                            </small>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                  {funnel.channels.length > 0 && (
                    <div
                      className="growth-report"
                      tabIndex={0}
                      role="region"
                      aria-label={t("growth.campaignResults")}
                    >
                      <table>
                        <caption>{t("growth.campaignResults")}</caption>
                        <thead>
                          <tr>
                            <th>{t("growth.sourceCampaign")}</th>
                            <th>{t("growth.sessions")}</th>
                            <th>{t("growth.finished")}</th>
                            <th>{t("growth.completion")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {funnel.channels.map((row) => (
                            <tr key={`${row.source}-${row.campaign}`}>
                              <th scope="row">
                                {channelLabel(row.source)} / {channelLabel(row.campaign)}
                              </th>
                              <td>{n(row.sessions)}</td>
                              <td>{n(row.completed)}</td>
                              <td>{rate(row.completed, row.sessions)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              );
            })
          )}
          <h2>{t("growth.returnVisits")}</h2>
          {report.retention.map((row) => (
            <p key={row.day}>
              {row.eligible
                ? t("growth.retentionRow", {
                    day: n(row.day),
                    returned: n(row.returned),
                    eligible: n(row.eligible),
                    rate: rate(row.returned, row.eligible),
                  })
                : t("growth.retentionPending", { day: n(row.day) })}
            </p>
          ))}
          <p>{t("growth.retentionHint")}</p>
          {!funnels && (
            <p>
              {t("growth.invitationTotals", {
                opened: n(report.invitations.opened),
                joined: n(report.invitations.joined),
                completed: n(report.invitations.completed),
              })}
            </p>
          )}
          <div
            className="growth-report"
            tabIndex={0}
            role="region"
            aria-label={t("growth.actions")}
          >
            <table>
              <caption>{t("growth.actions")}</caption>
              <thead>
                <tr>
                  <th>{t("growth.action")}</th>
                  <th>{t("growth.browsers")}</th>
                  <th>{t("growth.events")}</th>
                </tr>
              </thead>
              <tbody>
                {report.events.map((row) => (
                  <tr key={row.event}>
                    <th scope="row">{eventLabel(row.event)}</th>
                    <td>{n(row.visitors)}</td>
                    <td>{n(row.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div
            className="growth-report"
            tabIndex={0}
            role="region"
            aria-label={t("growth.entrySources")}
          >
            <table>
              <caption>{t("growth.entrySources")}</caption>
              <thead>
                <tr>
                  <th>{t("growth.sourceCampaign")}</th>
                  <th>{t("growth.browsers")}</th>
                </tr>
              </thead>
              <tbody>
                {report.sources.map((row) => (
                  <tr key={`${row.source}-${row.campaign}`}>
                    <th scope="row">
                      {channelLabel(row.source)} / {channelLabel(row.campaign)}
                    </th>
                    <td>{n(row.visitors)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Screen>
  );
}
