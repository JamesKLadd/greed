# Greed polish — baseline and challenge gameplay (2A)

Implementation checkpoint based on `origin/main` at `8d87c2d` (0.7.3).
The next approved slice is challenge entry/results/leaderboards (2B), followed
by the prominent-button home menu (3A). The character table's viewpoint, seats,
dice/action regions and blank bottom strip remain unchanged.

## Baseline findings

| Finding in 0.7.3                                                                   | This checkpoint                                                                               |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Turn, banked score and turn score use identical meters                             | Beta has a compact turn header, a banked total and a distinct at-risk readout                 |
| Beta challenge die buttons shrink to about 30px on phones                          | Each die owns a non-overlapping cell and at least a 44px effective hit area                   |
| Buttons disable during a request without explaining the wait                       | Live status distinguishes requesting a roll, banking, saving holds, rolling and recovery      |
| The displayed bust already increments completed turns, but the label adds one more | Outcome dice retain the completed turn's number until the next turn starts                    |
| Last-held explanation is a tooltip; refused taps still submit an illegal move      | Touch refusal displays a readable status message and sends no request                         |
| Hold requests can overtake other holds or Roll/Bank                                | One request owns this controller until its acknowledgment/presentation resolves               |
| Failed optimistic holds leave uncertainty about the saved position                 | Roll back the provisional display and read the saved run; never repeat the move automatically |
| The final bank disappears immediately                                              | A 900ms final-bank beat shows the result before the parent opens results                      |
| Classic resumes play historical audio                                              | Resume silently, keeping the current turn's roll count for subsequent streak cues             |

Hot-dice held markers now agree with the real held hand and accessible pressed
state. They clear when the fresh five start rolling. Daily/weekly still render
no beta celebration popups or particles; the existing inline rare-roll slot
and audio remain.

## Verification

- Full suite: **727 passed, 3 skipped, 55 files**. The skipped tests need a
  configured Postgres account database.
- TypeScript: all five packages passed.
- Repository ESLint, Prettier and production build passed.
- Thirteen controller tests exercise actual hook callbacks with a small
  node-only hook-storage harness, deferred replies and fake timers: holds and
  duplicate actions, lost replies, failed recovery/retry, null recovery,
  ordinary/final banks, final busts and unmount/remount isolation.
- Five fixture tests cover real seeded rare hands, all ten turns, clean turn
  ten initialization and failed/accepted reply recovery.
- Browser: beta challenge at 320×568, 390×844, 768×940, 1440×900 and 844×390.
  See [layout-audit.json](layout-audit.json): no horizontal overflow, 44px or
  larger die hit surfaces, separate action buttons of at least 52px height and
  no celebration overlays. Short landscape remains a scrolling page.
- English/French beta and Spanish Classic/flat-dice checks, including large
  text, high contrast and reduced motion. French pending and failed recovery
  keep the action row at the same position relative to the run (357.35px).
- Browser interaction: legal holds update immediately; last-held refusal is
  visible; an accepted roll with a lost reply and failed recovery stays blocked
  until a recovery read, then shows the accepted result. Request count remains
  one, not two. A resumed first-turn bust shows 1/10.

The original preview/lint loading failures came from local dependency reads.
Restarting Vite and reading the affected dependencies resolved them; no
dependency versions or production tooling were changed.

## Review routes and images

Run the ordinary development client and open `/?challenge-play`.
[Fixture instructions](../../packages/client/src/dev/challengePrototype/README.md)
describe rare hands, final turns, delayed responses and lost-response recovery.
The fixture uses the real controller and seeded engine without calling the
challenge API or changing earned progression/attempt allowances. It is excluded
from production builds.

- [Standard phone](phone-390.jpg)
- [Narrow phone with large text/high contrast/reduced motion](phone-320.jpg)
- [French weekly challenge](phone-french-weekly.jpg)
- [French recovery](phone-french-recovery.jpg)

## Limits and next chunks

This is desktop browser viewport testing, not real iPhone/Android hardware.
Device audio balance, animation frame times and VoiceOver/TalkBack remain to
be measured. Live authenticated challenge round-trips were not tested here.

Serialization is per mounted controller. A separate tab/device, or a server
POST still completing after a connection drops or the screen is left, can
still race the server's read/append/write. Recovery avoids automatically
replaying uncertain moves; it does not add server transaction/idempotency
guarantees. Server rules, score settlement, wins, allowances and APIs are
unchanged.

On very short phones, especially with translated large text and champion
announcements above the live board, some vertical scrolling remains. Phase 2B
will reduce surrounding content's prominence during active play.

Remaining approved roadmap, delivered as independent reviewable chunks:

**Checkpoint update:** [Phase 2B and 3A are implemented](phase-2b-3a/README.md),
followed by [Phase 4A and 4B](phase-4a-4b/README.md) and
[Phase 3B and 5A](phase-3b-5a/README.md). The fox pilot was approved and
[Phase 5B and 5C](phase-5b-5c/README.md) are now implemented. The final
[Phase 6 implementation checkpoint](phase-6/README.md) adds loading/recovery,
offline-update, audio-lifecycle and short-screen fixes. The user has approved
[promoting the design to the default and deploying main](phase-6/promotion/README.md).
Real-phone checks remain explicitly unverified; the Phase 6 notes contain the
device checklist and rollback preparation. The numbered list below records
the original scope and sequence.

1. **2B — challenge entry/results/leaderboards:** primary start/resume state,
   today/week allowance distinctions, reset/closing clocks, latest weekly
   attempt versus standing best, touch-accessible stat/tiebreak explanations,
   readable rows and loading/retry states. Preserve server-owned results.
2. **3A — home menu:** prominent Daily/Weekly, Local/Online and Learn buttons;
   substantial icon/label buttons for Locker, Friends, Leaderboards and Stats;
   clear utilities, less empty decoration and accurate beta labels.
3. **4A — table details:** turn emphasis, score distinction, names, team markers,
   held indicators, final-seat flag and online status inside existing geometry.
4. **4B — setup/results:** clear seat controls, phone keyboard behavior,
   unavailable-action explanations, winner/standings hierarchy and rematch flow.
5. **3B — other screens:** apply consistent button, panel, heading and dialog
   treatments to accounts, settings, friends, stats and locker.
6. **5A — character pilot:** fox front/side/back at every seat; review the style
   before expanding. Keep replaceable artwork anchors and bounds.
7. **5B/5C — cast/materials:** distinct remaining mascots, matching portraits,
   restrained reactions, felt/rail/dice refinement and readable cosmetic effects.
8. **6 — real-phone validation:** touch, browser chrome, keyboard, audio,
   backgrounding, reconnect, screen readers, measured animation performance and
   cache updates. Decide separately when to make beta the default, including
   treatment of temporary sample cosmetics and a rollback path.

No release version was invented and the beta has not been promoted or deployed
by this checkpoint. The password gate remains 2525.
