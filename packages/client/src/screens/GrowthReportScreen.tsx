import { useEffect, useState } from "react";
import type { GrowthReport } from "@greed/protocol";
import { api } from "../net/auth.js";
import { Button, Screen } from "../ui/index.js";
import { useT } from "../i18n/i18n.js";

export function GrowthReportScreen({ onBack }: { onBack: () => void }) {
  const t = useT();
  const [report, setReport] = useState<GrowthReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void api<GrowthReport>("/api/growth/report", { auth: true })
      .then((r) => {
        if (active) setReport(r);
      })
      .catch(() => {
        if (active)
          setError(
            "Sign in as the game owner to view this report. If the server is updating, try again shortly.",
          );
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <Screen
      hero={false}
      className="support-screen"
      actions={
        <Button variant="ghost" onClick={onBack}>
          {t("bar.home")}
        </Button>
      }
    >
      <h1>{t("growth.report")}</h1>
      {error ? (
        <p role="alert">{error}</p>
      ) : !report ? (
        <p>{t("screen.loading")}</p>
      ) : (
        <>
          <p>
            Last {report.days} days · {report.visitors} measured browsers
          </p>
          <p>
            Optional browser measurements describe trends. They exclude opted-out players and can
            include reconnects. They are separate from official game results.
          </p>
          <div className="growth-report">
            <table>
              <caption>Play and sharing</caption>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Browsers</th>
                  <th>Events</th>
                </tr>
              </thead>
              <tbody>
                {report.events.map((r) => (
                  <tr key={r.event}>
                    <th>{r.event.replaceAll("_", " ")}</th>
                    <td>{r.visitors}</td>
                    <td>{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="growth-report">
            <table>
              <caption>Entry sources</caption>
              <thead>
                <tr>
                  <th>Source / campaign</th>
                  <th>Browsers</th>
                </tr>
              </thead>
              <tbody>
                {report.sources.map((r) => (
                  <tr key={`${r.source}-${r.campaign}`}>
                    <th>
                      {r.source.replaceAll("_", " ")} / {r.campaign.replaceAll("_", " ")}
                    </th>
                    <td>{r.visitors}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2>Return visits</h2>
          {report.retention.map((r) => (
            <p key={r.day}>
              Day {r.day}: {r.returned} / {r.eligible} eligible browsers (
              {r.eligible ? Math.round((r.returned / r.eligible) * 100) : 0}%)
            </p>
          ))}
          <p>
            First observed visit within the last 30 days; return on exactly day 1 or 7, using the
            challenge’s Chicago calendar. Returning players may enter these cohorts again after old
            visits expire.
          </p>
          <h2>Room invitations</h2>
          <p>
            {report.invitations.opened} opened → {report.invitations.joined} joined →{" "}
            {report.invitations.completed} finished a game in the same measured session.
          </p>
        </>
      )}
    </Screen>
  );
}
