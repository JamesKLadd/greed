import { DAILY_ZONE, dailyKey } from "@greed/core";
import {
  GROWTH_EVENTS,
  GROWTH_SOURCES,
  GROWTH_CAMPAIGNS,
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
export async function growthReport(): Promise<GrowthReport> {
  const recent = "created_at > now() - interval '30 days'";
  const [totals, events, sources, retention, invitations] = await Promise.all([
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
    query<{ opened: string; joined: string; completed: string }>(`WITH funnel AS (
      SELECT session_id,
        min(created_at) FILTER (WHERE event = 'room_invite_opened') AS opened,
        min(created_at) FILTER (WHERE event = 'room_invite_joined') AS joined,
        max(created_at) FILTER (WHERE event = 'online_completed') AS completed
      FROM growth_events WHERE ${recent} GROUP BY session_id
    ) SELECT count(*) FILTER (WHERE opened IS NOT NULL) AS opened,
      count(*) FILTER (WHERE joined >= opened) AS joined,
      count(*) FILTER (WHERE joined >= opened AND completed >= joined) AS completed FROM funnel`),
  ]);
  const f = invitations.rows[0];
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
      opened: Number(f?.opened ?? 0),
      joined: Number(f?.joined ?? 0),
      completed: Number(f?.completed ?? 0),
    },
  };
}
