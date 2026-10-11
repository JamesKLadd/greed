# Greed — working notes

A push-your-luck 5-dice game. TypeScript monorepo: a pure rules engine that the
local UI, the bots, the authoritative online server, and both timed challenges
all share. Read this before exploring — most of what a session re-derives by
reading files is written down here.

## Commands

```bash
npm run dev          # client at localhost:5173
npm run server       # ws + http server on :8787
npm test             # vitest, whole repo
npm run typecheck    # tsc --noEmit per package
npm run lint         # eslint
npm run format:check # prettier (CI runs this — run `npm run format` first)
npm run build        # production client
```

CI (`.github/workflows/ci.yml`) runs typecheck → lint → format check → test →
build on every push. Node 20.

## Layout

- `packages/core` — the engine. Pure, no rendering, no network, seeded RNG
  threaded through state. `run.ts` + `zone.ts` are the pieces the daily and
  weekly challenges share; `daily.ts` and `weekly.ts` are just calendars on top.
- `packages/bots` — exhaustive roll model computed from the real `scoreRoll`,
  plus a DP for the optimal turn.
- `packages/protocol` — client↔server message contracts.
- `packages/server` — authoritative WebSocket server + the REST API for
  accounts, friends, leaderboards and both challenges.
- `packages/client` — React + Vite. Plain CSS in `src/styles/*.css`.

## Settled rules (easy to get wrong — do not re-litigate)

- Scoring: 1 = 100, 5 = 50, three of a kind = 100 × face, straight = 500.
  Five of a kind = 1000. Both take all five dice, both **replace** what those
  dice were paying rather than adding to it, and both are **built across several
  throws** — the one place the engine reads the MAT rather than the throw. The
  die that completes either often pays nothing alone (any 2, 3, 4 or 6), so
  scoring the throw on its own busts the best hands in the game. `heldHand` and
  `throwCompletesHand` in `core/src/turn.ts` are the single answer; five of a
  kind had it first and the straight was still busting.
- Per face the engine takes max(triple, all-individual) — three 1s = 300,
  four 5s = 550, five 1s = 500.
- **Default goal is 3000** (`GOAL_DEFAULT`). It was 2000 once; that was wrong.
- Turn order comes from an opening roll-off: lowest pip total goes FIRST,
  highest goes LAST. **The last seat is the anchor** — it takes the final turn.
  If the last seat is first to the goal it wins outright; otherwise the round
  plays out through the last seat and the highest total wins. Ties → sudden death.
- Scoring dice auto-lock, and the player may overrule that by tapping a die.
  **Once anything has been thrown, at least one die must stay held** — releasing
  the last one is refused, or a throw would be free. The single rule is
  `canToggleLock` in `core/src/turn.ts`; four callers ask it rather than
  restating it.
- Bots have ONE skill level. What differs is temperament
  (cautious/balanced/reckless). There is no difficulty setting.
- Daily challenge: one run per day, 10 turns. The server generates a secret seed,
  owns the move list, and replays it to derive the score. The client never sees a
  seed and never reports a score.
- Daily challenge streaks count `daily_completions`, a permanent record of
  completed dates. The final move writes it in the same transaction as the run,
  and migration/pruning copy completed dates from retained runs before cleanup.
  Never count a streak from `daily_runs`: those expire after 30 days, which is
  what capped streaks at 31. If copying completions fails, skip daily-run pruning.
- Weekly challenge: same 10-turn run, resets **Monday 00:00 America/Chicago**,
  best attempt of the week stands. Every attempt gets a fresh secret seed, and
  only one attempt may be open at a time. Unlike the daily, this week's board is
  public from the start.
- Past weekly winners come from `weekly_champions`, retained for the previous
  52 closed weeks. Summaries copy the winner from `challenge_wins` and their
  score before the 30-day replay cleanup. Recovered older winners may have a
  null score; never invent one. If archiving fails, skip weekly-run pruning.
- All-time Daily and Weekly score boards read `daily_scores` / `weekly_scores`,
  compact results retained forever. Completion/settlement writes the score and
  best-turn tiebreak in the same transaction as the run. Migration and pruning
  backfill surviving runs before replay cleanup; skip pruning a kind whose
  scores could not be copied. Never derive an all-time board from replay logs.
  Keep all score summaries so the top 25, personal bests, ranks and run counts
  stay accurate. Daily results still hide today until the viewer completes it.
- Both challenges order their standings on **score, then the run's best turn,
  then who got there first**. `server/src/ranking.ts` holds the one copy of each
  — `DAILY_ORDER`, `WEEKLY_ORDER` and their aliased and all-time variants — and
  all board, own-rank, placings, champion, tally and all-time queries
  interpolate one of them. They were copies once, and a copy that drifted is
  what credited a weekly win for a week that had not finished.
- Challenge WINS are a ledger, not a count. `challenge_wins` holds one row per
  closed day/week naming its winner, written once when the period closes and
  **never pruned**; `career_stats.daily_wins`/`weekly_wins` are its running
  totals, added to by `refreshCareerChallengeWins`. Never derive a win count
  from `daily_runs`/`weekly_runs`: those are pruned after 30 days, so any count
  of them is a count of the last month. That is what froze a player at four
  wins while they kept winning — and a "recount" from the runs is what erased
  real wins once already. A closed period's result stands, even under a later
  rule change.
- The weekly's `settle()` stores a new attempt when it beats the standing one BY
  THAT ORDER, not merely on score, or the board would rank a player on the
  weaker of two runs they had played. `best_at` is the exception and still moves
  only on a higher score — it means "when this total was first reached". The
  daily needs none of this: a day is one run, updated in place.
- The weekly's ration has changed twice and every week still reports the rule it
  was played under — `weeklyAllowance(week)` in `core/src/weekly.ts` is the one
  answer: unlimited before `WEEKLY_CAP_FROM`, 50 for that single week, 10 A DAY
  from `WEEKLY_DAILY_CAP_FROM` on. A ration change always lands on a Monday, so
  nobody's terms change mid-week. `weekly_runs.attempts` is the week's total
  (what "best of N attempts" means); `weekly_attempts` is the per-day count the
  cap reads. Neither derives from the other.

## Deploying — both halves ship on a push to `main`

- **Client → Vercel.** Auto-deploys on every push to `main`. Public URL
  `playgreed.vercel.app`.
- **Server → Render.** **Also auto-deploys on every push** — `render.yaml` sets
  no `autoDeploy: false`, so Render's default applies. `greed-server.onrender.com`.
  Free plan, so it sleeps after ~15 min idle (~30-50 s cold start) and its build
  takes a few minutes.
- **Database → Neon Postgres.** Credentials only in the gitignored `.env.local`
  and in Render's env. `migrate()` runs on the server's boot and is idempotent,
  so schema changes land with the deploy that carries them.

Nothing here needs doing by hand. **Do not tell the user a redeploy is
outstanding, or that a server change is waiting on them** — an old note claimed
Render was manual and it is not.

The two do not finish together, though: Vercel is quick and Render's free-tier
build plus boot is not, so for a few minutes after a push the new client is
talking to the old server. Hence:

> Any screen reading a field the deployed server has not sent yet must survive
> getting `undefined`. Normalise once at the network boundary rather than
> guarding at each use — `fill()` in `net/daily.ts` and `net/weekly.ts` are the
> worked examples. A whole feature the running server has never heard of should
> say so plainly (`WeeklyUnavailable`), not throw.

It is a short window rather than an open-ended one, but it is every push, it
covers the slowest half of a deploy, and a cold start widens it.

## Releases

The user drives them. They name the version and the date and supply the
update-log bullets **already written**. Paste those verbatim into
`RELEASES[0].notes` in `client/src/game/changelog.ts` — do not rewrite them, and
do not invent a version or date.

Bump the version in the root `package.json` and all five `packages/*/package.json`,
then regenerate the lockfile with `npm install --package-lock-only` (it records
workspace versions; a stale one once caused a Render `E404`).

If a change lands in an already-named version that their bullets don't cover,
add a line for it **and say so**. It is their list.

## Verification depth

Match the effort to the change. The repo's history rewards thorough checking,
but it is easy to spend far more than a change is worth.

- **Small / local** (a predicate, a string, a style): the affected test files,
  plus typecheck. Full suite once before committing.
- **A feature**: full suite, and drive the real app — `npm run dev` plus a
  browser. Vitest runs in node with no DOM, so nothing renders in tests; the
  dev-only UI gallery at `?ui` and a real browser are the only things that can
  check layout.
- **Anything touching the database**: a real Postgres is worth standing up.
  `DATABASE_URL` unset degrades to guest play, which is also a useful test.
- Don't re-run the whole suite after every edit — it takes ~30 s, most of it the
  bots' win-rate tests.

## Contract tests that catch omissions

These exist because each of them shipped broken once. If one fails, it is
telling you about a missed step, not asking to be edited:

- `i18n.test.ts` — every English key exists in `es` and `fr` with the same
  `{placeholders}`, and every id-built key (`ach.*`, `cosmetic.*`) exists.
  Adding an achievement, cosmetic or avatar means adding catalog entries in all
  three languages.
- `steam.test.ts` — every achievement maps to a distinct `ACH_*` Steam name.
- `changelog.test.ts` — `RELEASES[0].version` must equal the client's
  `package.json` version.
- `styles.contract.test.ts` — cosmetic CSS variables, no malformed hex.
- `tableGeometry.test.ts` — the seat pods don't collide or leave the screen, at
  2-8 players across several screen sizes. Keep it in step with `game.css`.

## Conventions

- Comments explain _why_, especially where a simpler-looking approach was tried
  and failed. Commit messages do the same at length.
- Player names are data and are never translated. Release notes are deliberately
  untranslated too — they are a record of what was done on a date.
- `.claude/` and `.env*` are gitignored. Never commit credentials.
