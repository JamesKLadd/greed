import { DAILY_ZONE, dailyKey } from "@greed/core";
import {
  GROWTH_EVENTS,
  GROWTH_SOURCES,
  GROWTH_CAMPAIGNS,
  GROWTH_FUNNELS,
  type GrowthFunnelReport,
  type GrowthRecord,
  type GrowthReport,
} from "@greed/protocol";
import { AccountError } from "./accounts.js";
import { query } from "./db.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parseGrowthBatch(raw: unknown): GrowthRecord[] {
  const events = raw && typeof raw === "object" ? (raw as Record<string, unknown>).events : null;
  if (!Array.isArray(events) || events.length < 1 || events.length > 20)
    throw new AccountError(400, "Invalid measurement batch.");
  return events.map((value: unknown) => {
    const r = value as GrowthRecord | null;
    if (
      !r ||
      ![r.id, r.visitor, r.session].every((v) => typeof v === "string" && UUID.test(v)) ||
      !GROWTH_EVENTS.includes(r.event) ||
      !GROWTH_SOURCES.includes(r.source) ||
      !GROWTH_CAMPAIGNS.includes(r.campaign)
    )
      throw new AccountError(400, "Invalid measurement event.");
    return {
      id: r.id,
      visitor: r.visitor,
      session: r.session,
      event: r.event,
      source: r.source,
      campaign: r.campaign,
    };
  });
}
export function isGrowthAdmin(username: string): boolean {
  return username.toLowerCase() === (process.env.GROWTH_ADMIN_USERNAME || "James").toLowerCase();
}
export async function recordGrowth(events: GrowthRecord[]): Promise<void> {
  await query(
    `INSERT INTO growth_events (id, visitor_id, session_id, event, source, campaign)
    SELECT id, visitor, session, event, source, campaign FROM jsonb_to_recordset($1::jsonb)
      AS r(id uuid, visitor uuid, session uuid, event text, source text, campaign text)
    ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(events)],
  );
}

/** Keep each cohort's first entry and find the earliest valid next step.
 * Equal timestamps are allowed: events received in one batch share now().
 * The injected query lets integration tests use an isolated database schema.
 */
export async function readGrowthFunnels(
  runQuery: typeof query = query,
): Promise<GrowthFunnelReport[]> {
  const selections = GROWTH_FUNNELS.map(({ id, events }) => {
    const joins = events
      .slice(1)
      .map(
        (event, i) => `LEFT JOIN LATERAL (
      SELECT min(created_at) AS at FROM recent e
      WHERE e.visitor_id = root.visitor_id AND e.session_id = root.session_id
        AND e.event = '${event}' AND e.created_at >= ${i === 0 ? "root.created_at" : `step${i}.at`}
    ) step${i + 1} ON true`,
      )
      .join("\n");
    const counts = ["count(*)", ...events.slice(1).map((_, i) => `count(step${i + 1}.at)`)].join(
      ", ",
    );
    return `SELECT '${id}' AS funnel, root.source, root.campaign, ARRAY[${counts}] AS steps
      FROM (SELECT DISTINCT ON (visitor_id, session_id) * FROM recent
        WHERE event = '${events[0]}' ORDER BY visitor_id, session_id, created_at, id) root
      ${joins} GROUP BY root.source, root.campaign`;
  });
  // Vocabulary comes exclusively from protocol constants, never request input.
  const result = await runQuery<{
    funnel: string;
    source: string;
    campaign: string;
    steps: string[];
  }>(
    `WITH recent AS NOT MATERIALIZED (
      SELECT * FROM growth_events WHERE created_at > now() - interval '30 days'
    ) ${selections.join("\nUNION ALL\n")}`,
  );
  return GROWTH_FUNNELS.map(({ id, events }) => {
    const rows = result.rows.filter((row) => row.funnel === id);
    return {
      id,
      steps: events.map((event, i) => ({
        event,
        sessions: rows.reduce((sum, row) => sum + Number(row.steps[i]), 0),
      })),
      channels: rows
        .map((row) => ({
          source: row.source,
          campaign: row.campaign,
          sessions: Number(row.steps[0]),
          completed: Number(row.steps[events.length - 1]),
        }))
        .sort((a, b) => b.sessions - a.sessions),
    };
  });
}

export async function growthReport(): Promise<GrowthReport> {
  const recent = "created_at > now() - interval '30 days'";
  const [totals, events, sources, retention, funnels] = await Promise.all([
    query<{ visitors: string }>(
      `SELECT count(DISTINCT visitor_id) AS visitors FROM growth_events WHERE ${recent}`,
    ),
    query<{ event: GrowthRecord["event"]; visitors: string; count: string }>(
      `SELECT event, count(DISTINCT visitor_id) AS visitors, count(*) AS count FROM growth_events WHERE ${recent} GROUP BY event ORDER BY event`,
    ),
    query<{ source: string; campaign: string; visitors: string }>(
      `SELECT source, campaign, count(DISTINCT visitor_id) AS visitors FROM growth_events WHERE ${recent} AND event IN ('visit', 'landing_viewed') GROUP BY source, campaign ORDER BY visitors DESC`,
    ),
    query<{ day: number; eligible: string; returned: string }>(
      `WITH days AS (
      SELECT DISTINCT visitor_id, (created_at AT TIME ZONE $1)::date AS day FROM growth_events WHERE ${recent}
        AND event IN ('visit', 'landing_viewed')
    ), cohorts AS (SELECT visitor_id, min(day) AS first_day FROM days GROUP BY visitor_id)
    SELECT horizon.day,
      count(*) FILTER (WHERE c.first_day <= $2::date - horizon.day) AS eligible,
      count(*) FILTER (WHERE c.first_day <= $2::date - horizon.day AND EXISTS (
        SELECT 1 FROM days d WHERE d.visitor_id = c.visitor_id AND d.day = c.first_day + horizon.day)) AS returned
    FROM (VALUES (1), (7)) AS horizon(day) LEFT JOIN cohorts c ON true GROUP BY horizon.day ORDER BY horizon.day`,
      [DAILY_ZONE, dailyKey()],
    ),
    readGrowthFunnels(),
  ]);
  const invitation = funnels.find((f) => f.id === "room_invite")!;
  return {
    days: 30,
    visitors: Number(totals.rows[0]?.visitors ?? 0),
    events: events.rows.map((r) => ({
      ...r,
      visitors: Number(r.visitors),
      count: Number(r.count),
    })),
    sources: sources.rows.map((r) => ({ ...r, visitors: Number(r.visitors) })),
    retention: retention.rows.map((r) => ({
      ...r,
      eligible: Number(r.eligible),
      returned: Number(r.returned),
    })),
    invitations: {
      opened: invitation.steps[0].sessions,
      joined: invitation.steps[1].sessions,
      completed: invitation.steps[2].sessions,
    },
    funnels,
  };
}
