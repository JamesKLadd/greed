# Dice fairness investigation — 8 October 2026

The audited dice code shows no evidence of increased super-bust odds, a score
ceiling, or weekly manipulation. The exact five-dice super-bust probability is
**600 / 7,776 = 25 / 324 = 7.716049%**, for both an opening throw and a fresh
cup after hot dice. Large reproducible samples and actual engine simulations
agree with that probability. Several separate fairness, scoring, persistence,
input, and statistics bugs were confirmed and fixed in this change.

This conclusion concerns the implementation and the simulations below. The
available production data cannot establish the actual bust rate of every
attempt played this week.

## Rules and roll path

This is five-dice Greed. A roll busts if it contains no 1 or 5 and no three
matching faces. A straight always contains a 5, and five of a kind always
contains a triple, so neither adds any bust outcomes. An independent predicate
was checked against every possible throw of one through five dice.

| Dice thrown | Bust outcomes | Total outcomes | Exact bust probability |
| ----------: | ------------: | -------------: | ---------------------: |
|           1 |             4 |              6 |             66.666667% |
|           2 |            16 |             36 |             44.444444% |
|           3 |            60 |            216 |             27.777778% |
|           4 |           204 |          1,296 |             15.740741% |
|           5 |           600 |          7,776 |              7.716049% |

The smaller-cup figures describe the thrown dice alone. In an actual turn,
completing a held straight or five of a kind can rescue an otherwise scoreless
throw, reducing its bust probability. A fresh five-dice cup has no held dice,
so its probability is exactly the last row.

For five dice, the non-scoring multiplicities are 2+2+1 (360 ordered outcomes)
and 2+1+1+1 (240), using only faces 2, 3, 4 and 6. This accounts for all 600
super-bust outcomes. With independent fair dice, ten opening throws have a
55.202% chance of at least one super bust, 17.745% of at least two, and 3.652%
of at least three. Rolls after hot dice add more opportunities.

All game modes reach `core/game.ts` → `rollDice` → Mulberry32 → `scoreRoll`.
Hot dice clears the holds and carries the points; it does not change the
generator or scoring odds. No week, account, opponent, score, bank threshold,
or prior outcome enters the roll generator. Client `Math.random()` calls in
the die component affect animation only. Challenges use fresh seeds from
`node:crypto.randomInt`, and replay server-owned moves to derive scores.
`core/rng.ts` has been unchanged since the initial repository commit.

## Reproducible statistical checks

Run from the repository root:

```bash
node --import tsx scripts/audit-dice-fairness.ts --samples 5000000 --engine-runs 50000
node --import tsx scripts/audit-dice-fairness.ts --samples 5000000 --engine-runs 50000 --strategy roll-until-bust
```

The default sampler uses independent SHA-256 counter hashes with a documented
fixed salt, covering the same 31-bit seed range as the challenge server. `--crypto`
provides a fresh entropy sample. The script reports exact enumeration, Wilson
95% intervals, face frequencies, adjacent faces, full-cup outcome frequencies,
and real-engine opening and post-hot rolls. Neither run changes production data.

The complete outputs are retained in `docs/dice-fairness/bank500-2026-10-08.json`
and `docs/dice-fairness/roll-until-bust-2026-10-08.json`.

| Experiment                                    | Super busts / rolls | Observed rate |     95% interval |
| --------------------------------------------- | ------------------: | ------------: | ---------------: |
| Independent opening cups                      | 386,099 / 5,000,000 |      7.72198% | 7.69861–7.74541% |
| Next cup after an opening hot hand            |    21,540 / 279,860 |      7.69671% | 7.59853–7.79604% |
| Real engine, bank-at-500 policy, opening      |    38,962 / 500,000 |      7.79240% | 7.71843–7.86702% |
| Real engine, bank-at-500 policy, post-hot     |      2,774 / 36,712 |      7.55611% | 7.29018–7.83093% |
| Real engine, roll-until-bust policy, opening  |    38,692 / 500,000 |      7.73840% | 7.66466–7.81279% |
| Real engine, roll-until-bust policy, post-hot |    16,215 / 209,065 |      7.75596% | 7.64208–7.87139% |

The real-engine samples cover 50,000 ten-turn runs per policy, including hot
dice assembled across throws and repeated hot-dice chains. Both policies retain
automatic holds. The bank-at-500 policy also banks when one die remains.

All five cup sizes in the five-million-seed sample were within 1.75 standard
deviations of their theoretical bust rates. Face counts gave chi-square 3.971
with 5 degrees of freedom; all 7,776 full-cup outcomes gave 7,794.239 with
7,775 degrees of freedom. Adjacent faces gave 48.942 with 35 degrees of freedom;
this is a diagnostic, not evidence of an identified correlation.

There were isolated sampling deviations: the bank-at-500 opening sample is
2.02 standard deviations above expectation, just outside a nominal 95%
interval. An early 2,000-run post-hot sample was 144/1,515 = 9.505%, 2.61
standard deviations high; extending that experiment to 50,000 runs produced
the lower post-hot rate in the table. Multiple simultaneous diagnostics can
produce nominal 95% exceptions by chance. The larger samples and independent
policies do not support a persistent opening or post-hot excess.

## Production leaderboard evidence and its limits

A read-only request to the public weekly leaderboard on 8 October showed a
current-week maximum of **4,750**, followed by 4,700 and 4,250. The previous
week's maximum was 6,700; the week before that was 5,750. The reported lower
scoring week is therefore still visible, although the board has advanced beyond
4,250 since the initial report.

The public endpoint exposes best results, not every attempt's rolls, decisions,
or attempt counts. Database storage retains each user's weekly best attempt and
current open attempt, rather than a permanent log of all discarded attempts.
Those selected best runs cannot provide an unbiased population bust-rate
estimate. No production accounts, attempts, standings, or database records were
changed during this investigation.

The bank-at-500 experiment produced 51 scores at least 5,000 out of 50,000
runs, with a maximum of 5,950. This confirms such scores remain possible and
there is no 4,250 ceiling. It does not model the players' strategies or establish
how surprising their current leaderboard maximum is. The attempt allowance has
been ten per day since 21 September; that rule did not change for this week.

## Confirmed bugs fixed

1. **Future-roll prediction inputs crossed the API.** Daily, weekly, and online
   snapshots exposed `config.seed` and `rng`. Responses now redact both actual
   values while preserving the existing state shape. Online games use an opaque
   HMAC token for game identity. The authoritative state and stored seeds remain
   intact. There is no evidence that anybody exploited this exposure.
2. **Challenge operations raced and could partially save.** Concurrent starts
   could replace a seed, concurrent moves could overwrite progress, and a failed
   settlement could leave attempt counts and records inconsistent. Transactions
   and per-account PostgreSQL advisory locks now cover the entire operation.
   Requests resolve the challenge date after obtaining the lock so requests
   queued across a reset cannot update a closed period. Expiry cleanup and
   recovered settlement commit before their intended error is reported.
3. **Breaking an opening full hand erased ordinary points.** Releasing a die
   from a rolled straight or five of a kind could discard the remaining singles
   or triple. Remaining dice now retain their ordinary points, including after a
   released die is rethrown. Triples remain restricted to their original throw.
4. **Rapid multiplayer inputs could send extra real rolls.** Online roll, bank,
   and hold inputs now share a synchronous guard through acknowledgment and
   presentation. Presence updates do not release it. Rematches cancel obsolete
   animation timers.
5. **Consecutive hot-dice clears were undercounted.** Challenge statistics now
   count the engine's clear events, including back-to-back hot cups. Repeated
   hold toggles cannot inflate the count. This corrects statistics, not odds.
6. **Some career-best turns were missed locally.** A lower-scoring weekly run
   with a better individual turn, or a failed board refresh after completion,
   could leave local Stats stale. The final authoritative run now updates that
   record before fetching the leaderboard.

Closed standings were not recalculated. The RNG algorithm and dice sequences
were not changed. Review of turn order, team scoring, endgame, sudden death,
roll-off, and bot execution found no additional confirmed flow faults. The
bots' dice-count probability model approximates bonuses for hands assembled
across throws; that strategy limitation does not affect actual dice generation.

## Validation and remaining limits

The full suite passed 867 tests with optional integrations skipped. The latest
challenge calendar regressions were then checked separately: all 103 daily and
weekly tests passed. Eight additional tests passed against disposable PostgreSQL
16, covering simultaneous starts, preserved moves, exactly-once settlement,
rollback/retry, allowance recovery, isolation, and locks held by an independent
connection. The disposable database and schemas were removed.

Project typecheck, lint, formatting, production build, and an independent code
review passed. New regressions cover exact bust counts, identical fresh-cup
behavior across daily/weekly/hot-dice contexts, RNG advancement, serialization,
scoring fallbacks, challenge statistics, transaction failures, and client input
handling. A browser walkthrough was not performed.

Mulberry32 is a deterministic, non-cryptographic generator with a 31-bit
challenge seed space. Removing direct state exposure closes the immediate
prediction leak, but does not prove resistance to deliberate seed recovery from
enough observed dice. Stronger adversarial protection would require a versioned
cryptographic server roll stream while preserving existing replays. The fairness
results here address roll distributions, not cryptographic unpredictability or
proof about every historical production attempt.
