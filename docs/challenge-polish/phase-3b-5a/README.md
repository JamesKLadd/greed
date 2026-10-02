# Phase 3B / 5A checkpoint

Supporting-screen consistency and the first character pilot are implemented.
The table structure, game rules, challenge allowances, earned cosmetics and
account APIs are unchanged. Beta remains opt-in; its password is still 2525.
No release version or date has been invented, and this checkpoint does not
promote beta or publish to main.

## Supporting screens

- Accounts, sign-in, settings, friends and stats use compact in-panel headings,
  consistent spacing, semantic colors, visible focus and controls at least
  44px tall. Beta retains its wordmark and emerald/gold panel treatment; classic
  retains its own palette.
- Sign-in modes use native forms, clear secondary buttons, input hints and
  readiness/busy guards. Long account names and emails wrap. Resend cooldowns
  and the password-confirmed account deletion flow remain intact.
- Friends show written online/offline states, labelled request actions,
  localized records, initial loading/retry states and connection feedback.
  Small phones stack action rows. Quiet background refreshes keep the current
  list visible; initial errors appear once alongside Retry.
- Settings group interface, table and audio preferences. Switches retain focus
  when changed and describe their effects. Sliders show volume percentages;
  releasing the effects slider retains its sound preview.
- Stats group match/streak records, points and challenge wins. Achievements
  have named locked/unlocked states. Local profile reset has a separate dialog
  that explicitly includes stats, achievements and equipped appearance.
- Locker categories are substantial buttons with a section heading and a
  written selected marker. Phones have links between preview and collection.
  The preview label has reserved space above the portrait; its return link no
  longer overlays cards on narrow phones. Locked items remain previewable but
  cannot be equipped; beta sample equipment stays temporary.

New copy is present in English, Spanish and French with matching placeholders.
Production Account, Friends, Stats and Locker views have separate controllers
so their layout can be reviewed with sample data and memory-only callbacks.

## Fox pilot

The fox now has pointed ears, an expressive cream muzzle and eyes, a distinct
tail tip, an emerald jacket and gold trim. Front, side and back drawings share
their palette and face proportions; left seats mirror the side view. Its
profile portrait uses the same face artwork.

The pilot is repository-native SVG. It adds no image downloads, animation
loops or filters. The seated 180×240 canvas, anchors and seat geometry are
preserved. A valid manifest image still overrides the vector fallback, so
future commissioned front/side/back art can replace it without rebuilding the
table. The other five characters retain their existing artwork pending style
review.

## Verification

- Full suite: **751 passed, 3 database-dependent tests skipped**, across 59
  passing files.
- Type checks passed for core, bots, protocol, client and server.
- ESLint, repository formatting and production client build passed. Review
  routes and fixture copy are absent from the production JavaScript.
- The build still reports the 500kB main-chunk advisory (513.44kB minified,
  161.41kB gzip); bundle/performance work remains part of the phone-validation
  phase.
- Real browser checks covered 390px phones, 320px narrow phones and 1440px
  desktop. French narrow layouts were checked with large text, high contrast
  and reduced motion. Reviewed supporting controls were at least 44px tall;
  inspected screens had no horizontal overflow.
- Checked account confirmation and disabled empty-password deletion; friend
  accept/play callbacks and initial Retry; empty sign-in/signup readiness;
  profile-reset dialog dismissal and focus return; settings switch focus;
  locked preview rejection, sample equip and compare states.
- Inspected fox front/back/both side views at 55, 72 and 108px, plus front,
  back and mirrored side placement on the existing eight-player phone table.
  Table geometry and image override/fallback contracts pass.

Settings and language were changed only for UI testing and restored to the
browser's starting preferences: English, large text, high contrast and reduced
motion. Audio volumes were not changed. No real emails, friend requests,
account deletion, profile resets or sample equipment writes were performed.

This is browser viewport testing, not real iPhone/Android hardware. Live
authenticated round-trips, on-device keyboard behavior, VoiceOver/TalkBack,
audio balance and measured animation performance remain unverified.

## Review routes and images

Run the normal development client and open `/?support-review` or
`/?character-pilot`. Both routes are excluded from production builds.

Supporting sample controls select screen, state, presentation and language.
Accounts/friends/stats/locker use fake data and memory-only action receipts.
**Settings and language use ordinary browser preferences**; restore them after
testing. Sign-in was checked separately in the ordinary guest UI without
submitting.

Examples:

- `/?support-review&screen=account&state=cooldown`
- `/?support-review&screen=account&state=delete-panel`
- `/?support-review&screen=friends&state=error`
- `/?support-review&screen=friends&state=reconnecting`
- `/?support-review&screen=stats&state=empty&classic`
- `/?support-review&screen=locker&state=basic`
- `/?support-review&screen=settings`
- `/?table-preview&scene&players=8&anchor=4&event=none`

Saved review images:

- [Fox comparison and small seat sizes](fox-pilot-desktop.png)
- [Phone table: back and right-side fox](fox-table-eight-phone.png)
- [Phone table: front and mirrored-side fox](fox-table-front-phone.png)
- [Account on phone](account-phone.png)
- [Narrow signup](auth-signup-320.png)
- [Friends on phone](friends-phone.png)
- [French narrow friends](friends-french-320.png)
- [French profile reset dialog](reset-dialog-french-320.png)
- [French narrow settings](settings-french-320.png)
- [Narrow locker preview](locker-preview-320.png)
- [Narrow mascot collection](locker-collection-320.png)
- [Desktop locker](locker-desktop.png)

The sample-data warning above supporting views is development-only.

## Resume here

Review the fox style before expanding to **5B/5C — remaining cast and material
refinement**: distinct mascot silhouettes, matching portraits, restrained
reactions, felt/rail/dice polish and readable cosmetic effects. Preserve the
current table layout and replaceable art contracts.

After that, **6 — real-phone validation** covers touch, browser chrome,
keyboard, audio, backgrounding/reconnect, screen readers, animation frame times
and cache updates. Making beta the default remains a separate decision with
temporary cosmetic handling and a rollback path.
