/**
 * Which signed-in accounts are currently connected.
 *
 * The WebSocket server and the REST API run in the same process, so the friends
 * list can read this directly instead of polling or holding its own connection.
 * A user may have several sockets open (two tabs, a reconnect racing a drop), so
 * this counts them and only reports offline when the last one closes.
 */

const connections = new Map<string, number>();

export function markOnline(userId: string): void {
  connections.set(userId, (connections.get(userId) ?? 0) + 1);
}

export function markOffline(userId: string): void {
  const n = connections.get(userId);
  if (n === undefined) return;
  if (n <= 1) connections.delete(userId);
  else connections.set(userId, n - 1);
}

export function isOnline(userId: string): boolean {
  return connections.has(userId);
}

/** Filter a set of ids down to those currently connected. */
export function onlineAmong(userIds: string[]): Set<string> {
  return new Set(userIds.filter(isOnline));
}

/** Clear all presence (tests). */
export function resetPresence(): void {
  connections.clear();
}
