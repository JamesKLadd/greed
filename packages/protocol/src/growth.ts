/** Fixed, non-identifying vocabulary for first-party product measurements. */
export const GROWTH_EVENTS = [
  "visit",
  "landing_viewed",
  "landing_practice_selected",
  "landing_daily_selected",
  "practice_started",
  "practice_completed",
  "practice_daily_selected",
  "daily_signin_opened",
  "daily_signin_completed",
  "daily_started",
  "daily_completed",
  "weekly_started",
  "weekly_completed",
  "daily_shared",
  "room_shared",
  "room_invite_opened",
  "room_invite_joined",
  "online_started",
  "online_completed",
] as const;
export const GROWTH_SOURCES = ["direct", "landing", "daily_share", "room_invite"] as const;
export const GROWTH_CAMPAIGNS = [
  "none",
  "daily",
  "friends",
  "bank_or_roll",
  "bust",
  "comeback",
] as const;
export type GrowthEvent = (typeof GROWTH_EVENTS)[number];
/** Each step must follow the preceding step in the same measured session. */
export const GROWTH_FUNNELS = [
  {
    id: "welcome",
    events: [
      "landing_viewed",
      "landing_practice_selected",
      "practice_started",
      "practice_completed",
    ],
  },
  {
    id: "welcome_daily",
    events: ["landing_viewed", "landing_daily_selected", "daily_started", "daily_completed"],
  },
  {
    id: "practice_daily",
    events: [
      "practice_started",
      "practice_completed",
      "practice_daily_selected",
      "daily_started",
      "daily_completed",
    ],
  },
  {
    id: "daily_signin",
    events: ["daily_signin_opened", "daily_signin_completed", "daily_started"],
  },
  { id: "room_invite", events: ["room_invite_opened", "room_invite_joined", "online_completed"] },
] as const satisfies readonly { id: string; events: readonly GrowthEvent[] }[];
export interface GrowthFunnelReport {
  id: (typeof GROWTH_FUNNELS)[number]["id"];
  steps: { event: GrowthEvent; sessions: number }[];
  channels: { source: string; campaign: string; sessions: number; completed: number }[];
}
export interface GrowthRecord {
  id: string;
  visitor: string;
  session: string;
  event: GrowthEvent;
  source: (typeof GROWTH_SOURCES)[number];
  campaign: (typeof GROWTH_CAMPAIGNS)[number];
}
export interface GrowthReport {
  days: number;
  visitors: number;
  events: { event: GrowthEvent; visitors: number; count: number }[];
  sources: { source: string; campaign: string; visitors: number }[];
  retention: { day: number; eligible: number; returned: number }[];
  invitations: { opened: number; joined: number; completed: number };
  /** Optional while the client and server deploy independently. */
  funnels?: GrowthFunnelReport[];
}
