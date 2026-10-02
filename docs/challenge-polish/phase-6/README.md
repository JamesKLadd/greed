# Phase 6 — reliability, loading and mobile readiness

**Promotion update:** the user authorized pushing the completed design to main
as the default. The [promotion checkpoint](promotion/README.md) records the new
public toggle, equipment behavior, validation, deployment and rollback. The
notes below preserve the earlier password-gated checkpoint. Hardware checks
remain unverified.

The final implementation checkpoint improves loading, offline updates, audio
after backgrounding, saved preferences and short-screen dialogs. The approved
table composition, character anchors, rules, challenge allowances, earned
cosmetics, account APIs and beta sample-equipment behavior remain unchanged.
The visual beta remains opt-in with password **2525**.

Implementation and desktop browser checks are complete. **Real-phone sign-off
and promotion to the default presentation are still pending.** This checkpoint
does not publish to main or assign a release version/date.

## Loading and recovery

Mode screens load when opened instead of all being parsed in the main entry
chunk. Home remains available immediately; application providers, invitations
and challenge notices remain outside the screen's loading/error boundary.

While a screen loads, an accessible status explains the wait and offers Home.
A failed deferred screen offers Home and Reload, with English, Spanish and
French copy. Home uses the existing outer crash recovery, including Return to
Classic for a broken beta Home. The pre-React splash also respects the operating
system's reduced-motion preference.

This is navigation recovery, not restoration of an unmounted local match.
Reload/Home can discard unsaved local screen state. Existing server-owned
challenge resume/recovery behavior is unchanged; uncertain moves are still
read back rather than automatically posted again.

The production entry JavaScript is **348.94kB minified / 114.98kB gzip**, compared
with **535.20kB / 166.32kB** at Phase 5B/5C: approximately **35% less entry JS**
and **31% less compressed entry JS**. The previous 500kB chunk advisory is gone.
These are build-size measurements, not measured phone loading/frame times or
a reduction in the total offline download. Shared code and individual screens
still load as separate chunks.

## Offline builds and updates

The production build generates a service-worker manifest containing every
emitted JS/CSS asset, including unopened local-play/bot code. Its cache revision
changes with chunk filenames, HTML, worker behavior and the bytes of the public
icons, manifest and fonts. It does not depend on changing the displayed release
version. The final build includes all **28** emitted JS/CSS files with no unfilled
manifest markers.

- A complete worker installation precaches the application shell, fonts, icons
  and all screen chunks. Opening a screen before installation is not required
  for its code to become available offline.
- New workers use the normal waiting lifecycle. Existing controlled game tabs
  finish before an update activates; there is no forced mid-game reload.
- Activation keeps the current and one previous build cache, pruning older
  Greed shell caches while leaving unrelated origin caches alone.
- Online navigation refreshes the canonical cached HTML. Offline navigation
  selects the current worker's shell instead of an older cache's first match.
- Cached assets do not trigger redundant background fetches. Optional runtime
  assets are bounded separately and cannot evict required precached game code.
- API calls, writes, cross-origin requests, ranged requests and audio/video
  bypass this cache. Offline mode does not invent challenge/account responses.

Screen splitting reduces critical loading/parse work; installing the worker
still downloads all screen chunks in the background. Offline local play needs
that installation to finish successfully first. Music is intentionally not
precached. The worker behavior was tested in a deterministic VM harness; an
installed iOS/Android PWA update/offline rehearsal remains on the device checklist.

## Audio, preferences and small screens

Backgrounding silences the audio buses, suspends the context and cancels old
scheduled effects. A later foreground gesture can resume music without playing
a backlog of old roll/bank sounds. Late music decoding cannot start playback
behind another app. Failed music loading waits for a later interaction/settings
change instead of retrying continuously while offline. Listener installation
is idempotent and finished effect nodes are disconnected.

Existing cue gains, sound/music defaults and mute preferences remain unchanged.
The game drawer now has a full-width Volume button and vertically arranged
controls; the button and both sliders have at least 44px targets. Releasing the
effects slider previews its sound through pointer events, including touch.
Keyboard preview is retained.

Older saved settings retain their legacy volume mapping and valid individual
preferences. Damaged values are ignored field by field: text scale/booleans are
validated and finite volumes are clamped to 0–1. Unknown fields do not leak into
new settings writes. Storage failure falls back safely without modifying earned
progression or other saved records.

Shared overlays, the beta gate and challenge ranking details own their vertical
scroll when the page behind them is locked. Explicit grid bounds prevent a
long panel from exceeding a short landscape viewport. Drawer/dialog padding
accounts for all four safe-area insets. Classic online reconnection now has a
polite live status, without duplicating the beta scene's announcement.

Daily/weekly celebration popups remain disabled. Their existing inline feedback,
challenge controller, results and allowance calculations are unchanged.

## Verification

- **782 tests passed; 3 database-dependent tests skipped; 62 passing files.**
  This includes 8 new audio lifecycle tests, 9 saved-settings tests and 14 build/
  worker tests. All five package type checks, repository ESLint/Prettier and the
  production build passed.
- After the final small drawer and recovery adjustments, **118 affected tests**,
  client type checking, scoped ESLint and a fresh production build passed.
- Worker tests cover unopened local/bot chunks, failed installation, revision
  changes, navigation freshness, waiting behavior, previous-cache retention,
  runtime trimming and API/media/write exclusions. They execute the real worker
  source in a harness; they do not emulate a browser's full worker lifecycle.
- Production output contains no screen-load, cast, challenge or UI-gallery
  review code. All emitted JS/CSS files appear in the generated worker; the music
  asset does not.
- Built-app checks opened Settings, Stats, Locker, Daily/Weekly guest entry and
  local setup/play through their deferred screens, then returned to Classic.
  No completed matches, real challenge attempts or equipment writes were made.
- The real Suspense/error-boundary fixture recovered to Home from both pending
  and failed states. French failure recovery at **320×568**, with large text,
  high contrast and reduced motion, had no horizontal overflow; both actions
  remained visible at approximately 46px height.
- The real eight-seat game drawer at **390×844** and **844×390** had no horizontal
  overflow. Volume and sliders measured **44px** height; the landscape drawer
  scrolled to its lower actions/standings. The original table structure remains.
- The beta password dialog was checked at **844×390** with large text: an invalid
  code had a readable alert, and the panel scrolled to the successful 2525 entry.

The original development preferences were restored: English, large text, high
contrast and reduced motion; effects 100% and music 50%. Classic was restored
outside isolated review routes. No real account, allowance, progression or
cosmetic-equipment changes were made during testing.

Saved views:

- [Phone sound drawer](sound-drawer-phone.png)
- [Landscape sound drawer](sound-drawer-landscape.png)
- [French narrow-phone recovery](screen-recovery-french-320.png)
- [Desktop recovery](screen-recovery-desktop.png)
- [Landscape beta gate](beta-gate-landscape.png)

## Device sign-off — remaining validation

Use an iPhone with Safari and an Android phone with Chrome where available,
including one modest device. Test normal browser tabs and an installed PWA.
Record device/OS/browser, commit/build, mode, preferences, steps, expected/actual
behavior and a screenshot or recording for each failure. Prioritize the first
two rows because Daily and Weekly are the most-used modes.

| Priority | Check                                                                                                          | Expected result / evidence                                                                                                                                                |
| -------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | Daily: start/resume, legal holds, last-held refusal, rapid Roll/Bank, turn ten bank/bust and results           | One accepted move per action; readable state until acknowledgment; retained outcome; server-owned results and daily allowance stay correct.                               |
| 1        | Weekly: the same play checks, remaining attempts, latest versus best, rankings/details and closing/reset times | Existing attempt allowance and tiebreak semantics; distinct latest/best values; no blocking celebration popups or overflowing details.                                    |
| 2        | Background or lock the phone during a roll/bank; return; interrupt a challenge reply; reconnect online         | No old audio burst; no repeated uncertain POST; saved challenge position recovers; action state and reconnect notices remain understandable.                              |
| 2        | Portrait/landscape, browser bars, notches/home indicator, soft keyboard and large translated text              | Dice/menu/dialog actions stay reachable; panels scroll; no horizontal page overflow; fixed table structure stays intact.                                                  |
| 2        | Volume, mute, speaker/headphone balance and app/audio interruptions                                            | Effects audible at the user's chosen levels; previews work on touch; mute and volumes persist; foreground interaction can restore audio.                                  |
| 3        | VoiceOver/TalkBack, keyboard navigation and high contrast                                                      | Dice value/held state, active turn, score, readiness and recovery are understandable; dialog focus/dismissal works; announcements avoid repetition.                       |
| 3        | Repeated rolls/reactions on modest hardware, cold/warm load and memory                                         | Record load times, frame-time/dropped-frame evidence and memory before changing animation code. Compare normal, reduced-motion and flat-dice preferences.                 |
| 3        | Install completely, go offline, open Local for the first time; repeat across build A → B                       | Local code works without first visiting it online. Old open tabs finish safely; after closing them, the new worker activates and later offline reload uses the new shell. |
| 3        | Legacy preferences, temporary beta samples and Return to Classic                                               | Settings persist correctly; earned unlocks/account equipment are unchanged; session-only samples do not become owned cosmetics.                                           |

Live authenticated round-trips, installed-worker updates, native keyboards,
speaker balance, screen readers and actual device frame times **were not verified
on hardware** in this checkpoint. The existing challenge tests cover deferred/
lost replies, GET-only recovery and final outcomes; they do not add server-side
transactions or cross-device move idempotency.

## Release and rollback preparation

After device issues are fixed, the beta-to-main/default decision remains a
separate user-approved release. Before that release:

1. Record the current production commit/deploy and this tested candidate. Decide
   the actual version/date and write notes for the final shipped scope.
2. Rehearse A → B updating with an older game tab open, then offline launch after
   all older tabs close. Run Daily/Weekly with intended tester accounts and
   verify actual results/allowances without fabricating database records.
3. Decide explicitly how temporary beta sample equipment should behave when
   beta becomes the default. Keep earned unlocks and saved account equipment
   authoritative; do not grant ownership implicitly.
4. Keep Return to Classic available through rollout. Verify Classic can open
   from the ordinary beta menu and the existing crash recovery.
5. If release problems appear, stop promotion or revert the release commit to
   the recorded production state. Build and deploy normally so the worker gets
   a new revision. Do not delete user storage or force an update during a game.

No production deploy, beta promotion, version bump or progression migration is
part of this checkpoint.

## Development review routes

Use the ordinary development client:

- `/?load-review` — indefinitely pending real Suspense, with Home available.
- `/?load-review&failed` — real screen error recovery, with Home/Reload.
- `/?table-play&players=8` — isolated actual local screen, including the real
  drawer and Volume controls; results/progression recording is disabled.
- `/?challenge-play&mode=weekly&scenario=five` — seeded real challenge controller
  without challenge API/allowance writes.
- `/?cast-review` — the approved cast/material gallery from Phase 5B/5C.

Review routes are DEV-only and excluded from production. The loading fixture
does not change saved beta access, cosmetics or account data; Home leaves the
fixture. Settings selected through the ordinary Settings screen still persist
normally, so restore test preferences afterward.
