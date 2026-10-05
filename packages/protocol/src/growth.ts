/** Fixed, non-identifying vocabulary for first-party product measurements. */
export const GROWTH_EVENTS = [
  "visit",
  "landing_viewed",
  "practice_started",
  "practice_completed",
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
}
