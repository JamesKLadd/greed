import { AsyncLocalStorage } from "node:async_hooks";

/** Work waiting for the surrounding challenge transaction to commit. */
const pending = new AsyncLocalStorage<(() => void)[]>();

/**
 * Run `fn` once the challenge transaction this is called inside has committed,
 * or straight away outside one. Never if it rolls back.
 *
 * For side work that must not be able to fail the transaction it follows —
 * the roll statistics a finished run feeds. Inside the transaction, a failed
 * statement aborts everything after it, so a statistics write that went wrong
 * would take the player's finished run down with it; after the commit, the
 * run is safe whatever happens next.
 *
 * Its own module rather than part of db.ts so that the many tests which stand
 * in for the database do not each have to stand in for this as well.
 */
export function afterCommit(fn: () => void): void {
  const hooks = pending.getStore();
  if (hooks) hooks.push(fn);
  else fn();
}

/**
 * Run a transaction's work, holding back anything it asks to do after the
 * commit; the caller commits, then calls `runHooks`. See withChallengeTransaction.
 */
export async function collectCommitHooks<T>(
  work: () => Promise<T>,
): Promise<{ result: T; runHooks: () => void }> {
  const hooks: (() => void)[] = [];
  const result = await pending.run(hooks, work);
  return {
    result,
    runHooks: () => {
      for (const hook of hooks) {
        try {
          hook();
        } catch (err) {
          console.error("[db] after-commit work failed:", err);
        }
      }
    },
  };
}
