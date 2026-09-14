/**
 * Turn a failed API call into a sentence in the player's language.
 *
 * The server's own message is English and was shown verbatim — so someone
 * playing in Spanish typed their password wrong and read about it in English.
 * Every error the server raises now carries a stable code; this maps the code
 * to a catalog key and falls back to the server's text when it doesn't know
 * one.
 *
 * The fallback is the point, not a loose end. The client and the server do not
 * deploy together, so for a few minutes after any release one of them is newer
 * than the other: a code with no wording here still produces a true sentence,
 * and a build that knows a code the server never sends simply never uses it.
 */

import { ApiError } from "../net/auth.js";
import type { MsgKey, Params } from "./i18n.js";

/** Server error code → catalog key. */
const KEYS: Record<string, MsgKey> = {
  "account.missing": "err.account.missing",
  "auth.expired": "err.auth.expired",
  "board.unknown": "err.board.unknown",
  "body.malformed": "err.body.malformed",
  "body.tooLarge": "err.body.tooLarge",
  "daily.alreadyPlayed": "err.daily.alreadyPlayed",
  "daily.notStarted": "err.daily.notStarted",
  "daily.startFailed": "err.daily.startFailed",
  "delete.needPassword": "err.delete.needPassword",
  "email.invalid": "err.email.invalid",
  "friend.already": "err.friend.already",
  "friend.noRequest": "err.friend.noRequest",
  "friend.notFriend": "err.friend.notFriend",
  "friend.pending": "err.friend.pending",
  "friend.selfAdd": "err.friend.selfAdd",
  "friend.selfChallenge": "err.friend.selfChallenge",
  "login.bad": "err.login.bad",
  "login.missing": "err.login.missing",
  "move.illegal": "err.move.illegal",
  "move.invalid": "err.move.invalid",
  "password.common": "err.password.common",
  "password.long": "err.password.long",
  "password.short": "err.password.short",
  "password.weak": "err.password.weak",
  "password.wrong": "err.password.wrong",
  "reset.badLink": "err.reset.badLink",
  "run.finished": "err.run.finished",
  "run.notStarted": "err.run.notStarted",
  "run.tooLong": "err.run.tooLong",
  "signup.emailUnavailable": "err.signup.emailUnavailable",
  "signup.taken": "err.signup.taken",
  "user.unknown": "err.user.unknown",
  "username.missing": "err.username.missing",
  "username.rejected": "err.username.rejected",
  "username.taken": "err.username.taken",
  "weekly.spent": "err.weekly.spent",
  "weekly.spentToday": "err.weekly.spentToday",
  "weekly.staleRun": "err.weekly.staleRun",
};

/** The catalog key for an error, or null to use whatever the server said. */
export function apiErrorKey(err: unknown): MsgKey | null {
  if (!(err instanceof ApiError) || !err.code) return null;
  return KEYS[err.code] ?? null;
}

/**
 * What to show a player when a call failed.
 *
 * In order: the translated wording for the code the server sent, then the
 * server's own sentence when there is no wording for that code, then the
 * screen's own fallback for a failure that never reached the server at all
 * (offline, DNS, a proxy eating the request).
 */
export function apiErrorText(
  t: (key: MsgKey, params?: Params) => string,
  err: unknown,
  fallback: MsgKey,
): string {
  const key = apiErrorKey(err);
  if (key) return t(key);
  if (err instanceof ApiError && err.message) return err.message;
  return t(fallback);
}
