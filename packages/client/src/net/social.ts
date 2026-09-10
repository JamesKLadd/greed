import type { BetaIdentity } from "@greed/protocol";
/** Friends and public profiles. */

import { api } from "./auth.js";

export interface FriendSummary {
  id: string;
  username: string;
  online: boolean;
  wins: number;
  gamesPlayed: number;
}

export interface FriendsView {
  friends: FriendSummary[];
  incoming: FriendSummary[];
  outgoing: FriendSummary[];
}

export interface PublicProfile {
  visualBeta?: BetaIdentity;
  username: string;
  online: boolean;
  memberSince: string;
  gamesPlayed: number;
  wins: number;
  bestTurn: number;
  bestTotal: number;
  bestStreak: number;
  achievements: string[];
  dice: string;
  dailyBest: number | null;
  dailyRuns: number;
  /** Daily challenges won outright, on days that have closed. */
  dailyWins: number;
  relation: "self" | "friends" | "incoming" | "outgoing" | "none";
}

export function fetchFriends(): Promise<FriendsView> {
  return api<FriendsView>("/api/friends", { auth: true });
}

export function requestFriend(username: string): Promise<FriendsView> {
  return api("/api/friends/request", { method: "POST", body: { username }, auth: true });
}

export function acceptFriend(username: string): Promise<FriendsView> {
  return api("/api/friends/accept", { method: "POST", body: { username }, auth: true });
}

/** Removes a friend, declines an incoming request, or cancels an outgoing one. */
export function removeFriend(username: string): Promise<FriendsView> {
  return api("/api/friends/remove", { method: "POST", body: { username }, auth: true });
}

export function fetchProfile(username: string): Promise<PublicProfile> {
  return api(`/api/users/${encodeURIComponent(username)}`, { auth: true });
}
