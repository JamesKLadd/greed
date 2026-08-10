/**
 * Friends and public profiles.
 *
 * Friendship is request/accept rather than instant, so nobody can put themselves
 * on someone else's list — the same reason the emote set is fixed: this is a
 * family game, and the cheapest way to avoid moderation problems is to give
 * strangers no channel to push anything at you.
 */

import { query } from "./db.js";
import { AccountError } from "./accounts.js";
import { onlineAmong } from "./presence.js";
import type { StoredProfile } from "./accounts.js";

export interface FriendSummary {
  id: string;
  username: string;
  online: boolean;
  /** Games won / played, for the friends list. */
  wins: number;
  gamesPlayed: number;
}

export interface FriendsView {
  friends: FriendSummary[];
  /** Requests waiting on this user's decision. */
  incoming: FriendSummary[];
  /** Requests this user has sent that aren't accepted yet. */
  outgoing: FriendSummary[];
}

interface UserRow {
  id: string;
  username: string;
  profile: Partial<StoredProfile> | null;
}

async function findByUsername(username: unknown): Promise<UserRow> {
  if (typeof username !== "string" || !username.trim()) {
    throw new AccountError(400, "Enter a username.");
  }
  const { rows } = await query<UserRow>(
    `SELECT id, username, profile FROM users WHERE lower(username) = lower($1) LIMIT 1`,
    [username.trim()],
  );
  if (rows.length === 0) throw new AccountError(404, "No player with that username.");
  return rows[0];
}

function summarize(row: UserRow, online: Set<string>): FriendSummary {
  return {
    id: row.id,
    username: row.username,
    online: online.has(row.id),
    wins: row.profile?.wins ?? 0,
    gamesPlayed: row.profile?.gamesPlayed ?? 0,
  };
}

/** Everything the friends screen needs, in one round trip. */
export async function friendsView(userId: string): Promise<FriendsView> {
  const { rows } = await query<UserRow & { status: string; direction: string }>(
    `SELECT u.id, u.username, u.profile, f.status,
            CASE WHEN f.requester_id = $1 THEN 'outgoing' ELSE 'incoming' END AS direction
       FROM friendships f
       JOIN users u
         ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
      WHERE f.requester_id = $1 OR f.addressee_id = $1
      ORDER BY u.username`,
    [userId],
  );

  const online = onlineAmong(rows.map((r) => r.id));
  const view: FriendsView = { friends: [], incoming: [], outgoing: [] };
  for (const row of rows) {
    const summary = summarize(row, online);
    if (row.status === "accepted") view.friends.push(summary);
    else if (row.direction === "incoming") view.incoming.push(summary);
    else view.outgoing.push(summary);
  }
  return view;
}

/**
 * Send a friend request. If the other player has already requested you, this
 * accepts theirs instead of creating a mirrored second row — otherwise two
 * people adding each other at once would deadlock on two pending requests.
 */
export async function requestFriend(userId: string, username: unknown): Promise<FriendsView> {
  const target = await findByUsername(username);
  if (target.id === userId) throw new AccountError(400, "You can't add yourself.");

  const existing = await query<{ requester_id: string; status: string }>(
    `SELECT requester_id, status FROM friendships
      WHERE (requester_id = $1 AND addressee_id = $2)
         OR (requester_id = $2 AND addressee_id = $1)`,
    [userId, target.id],
  );

  const row = existing.rows[0];
  if (row?.status === "accepted") throw new AccountError(409, "You're already friends.");
  if (row) {
    if (row.requester_id === userId) throw new AccountError(409, "Request already sent.");
    return acceptFriend(userId, username);
  }

  await query(
    `INSERT INTO friendships (requester_id, addressee_id, status) VALUES ($1, $2, 'pending')`,
    [userId, target.id],
  );
  return friendsView(userId);
}

/** Accept a request addressed to this user. */
export async function acceptFriend(userId: string, username: unknown): Promise<FriendsView> {
  const target = await findByUsername(username);
  const { rowCount } = await query(
    `UPDATE friendships SET status = 'accepted'
      WHERE requester_id = $1 AND addressee_id = $2 AND status = 'pending'`,
    [target.id, userId],
  );
  if (!rowCount) throw new AccountError(404, "No pending request from that player.");
  return friendsView(userId);
}

/** Remove a friend, decline an incoming request, or cancel an outgoing one. */
export async function removeFriend(userId: string, username: unknown): Promise<FriendsView> {
  const target = await findByUsername(username);
  await query(
    `DELETE FROM friendships
      WHERE (requester_id = $1 AND addressee_id = $2)
         OR (requester_id = $2 AND addressee_id = $1)`,
    [userId, target.id],
  );
  return friendsView(userId);
}

/**
 * Resolve a username to an accepted friend of `userId`.
 *
 * Used by the challenge flow: an invite is a message that pops up on someone
 * else's screen, so only a confirmed friend may send one — the same rule that
 * governs every other channel between players here.
 */
export async function requireFriend(
  userId: string,
  username: unknown,
): Promise<{ id: string; username: string }> {
  const target = await findByUsername(username);
  if (target.id === userId) throw new AccountError(400, "You can't challenge yourself.");
  const { rows } = await query<{ status: string }>(
    `SELECT status FROM friendships
      WHERE ((requester_id = $1 AND addressee_id = $2)
          OR (requester_id = $2 AND addressee_id = $1))
        AND status = 'accepted'`,
    [userId, target.id],
  );
  if (rows.length === 0) throw new AccountError(403, "You can only challenge friends.");
  return { id: target.id, username: target.username };
}

export interface PublicProfile {
  username: string;
  online: boolean;
  memberSince: string;
  gamesPlayed: number;
  wins: number;
  bestTurn: number;
  bestTotal: number;
  bestStreak: number;
  achievements: string[];
  /** Equipped dice skin, so the card can show their dice. */
  dice: string;
  /** Best daily-challenge score, and how many dailies they've played. */
  dailyBest: number | null;
  dailyRuns: number;
  /** This viewer's relationship to them. */
  relation: "self" | "friends" | "incoming" | "outgoing" | "none";
}

/** A player's public card. Deliberately excludes email and anything private. */
export async function publicProfile(viewerId: string, username: unknown): Promise<PublicProfile> {
  const target = await findByUsername(username);
  const { rows } = await query<{ created_at: Date }>(`SELECT created_at FROM users WHERE id = $1`, [
    target.id,
  ]);

  const rel = await query<{ requester_id: string; status: string }>(
    `SELECT requester_id, status FROM friendships
      WHERE (requester_id = $1 AND addressee_id = $2)
         OR (requester_id = $2 AND addressee_id = $1)`,
    [viewerId, target.id],
  );
  let relation: PublicProfile["relation"] = "none";
  if (target.id === viewerId) relation = "self";
  else if (rel.rows[0]?.status === "accepted") relation = "friends";
  else if (rel.rows[0]) relation = rel.rows[0].requester_id === viewerId ? "outgoing" : "incoming";

  const daily = await query<{ best: number | null; runs: string }>(
    `SELECT MAX(score) AS best, COUNT(*)::text AS runs FROM daily_runs WHERE user_id = $1`,
    [target.id],
  );

  const p = target.profile ?? {};
  return {
    username: target.username,
    online: onlineAmong([target.id]).has(target.id),
    memberSince: rows[0]?.created_at.toISOString() ?? new Date().toISOString(),
    gamesPlayed: p.gamesPlayed ?? 0,
    wins: p.wins ?? 0,
    bestTurn: p.bestTurn ?? 0,
    bestTotal: p.bestTotal ?? 0,
    bestStreak: p.bestStreak ?? 0,
    achievements: p.achievements ?? [],
    dice: p.dice ?? "ivory",
    dailyBest: daily.rows[0]?.best ?? null,
    dailyRuns: Number(daily.rows[0]?.runs ?? 0),
    relation,
  };
}
