# Phase 5B / 5C checkpoint

The approved fox style now extends to the remaining five mascots, with matching
profile portraits, brief bank reactions and refined table/dice materials.
The table layout, scoring, challenge rules and allowances, earned unlocks,
account APIs and temporary sample-equipment behavior are unchanged. Beta
remains opt-in with password 2525. This checkpoint does not publish to main,
promote beta, or invent a release version/date.

## Cast

- Bear: rounded russet silhouette, cream muzzle and sleeves, burgundy waistcoat.
- Panda: black/ivory face and paws, compact silhouette and teal jacket.
- Cat: pointed lavender ears, whiskers, curved tail and plum jacket.
- Owl: face disks, ear tufts, beak, wings and navy/gold clothing.
- Frog: raised eyes, broad smile, webbed feet and a coral waistcoat.

Every mascot has front, side and back art; left seats mirror the side view.
Portraits reuse the same head drawings. Art keeps the existing 180×240 canvas,
anchors and seat bounds. Valid manifest images still override the SVG fallback,
and unknown character IDs still resolve to fox while retaining their original
metadata. Commissioned art can replace these vectors through that contract.

Bank reactions use the existing real-event feedback: fox nods, bear lifts,
panda sways, cat tilts, owl dips and frog bounces. Each lasts 600ms and runs
once. Busts retain the existing gentle sigh. Both kinds are disabled by the
app's reduced-motion preference and the operating-system media query. No idle
animation loops, image downloads or SVG filters were added.

## Materials

Rails use each equipped theme's colors, with static highlights and a restrained
felt weave/seam. The blurred room light becomes a static radial gradient.
Locker previews and challenge mats share the material palette.

Dice have scale-relative bevels, pip recesses and softer patterns. Scoring
faces retain their distinct palette, including the gold skin's dark inversion;
held checks stay above the cube. High contrast removes decorative texture and
strengthens edges. Forced-color styles use system colors and retain the check.
Dice sizes, transforms, hit regions and table/control geometry are unchanged.

## Verification

- **751 tests passed; 3 database-dependent tests skipped; 59 passing files.**
- Type checks passed for core, bots, protocol, client and server.
- Repository ESLint, Prettier and production build passed. Cast review strings
  are absent from production JavaScript.
- The main chunk is 535.20kB minified / 166.32kB gzip, up from the previous
  513.44kB / 161.41kB checkpoint. The existing 500kB advisory remains; initial
  load and measured animation performance belong in Phase 6.
- All five new mascots were inspected in front, back and both side views at
  55, 72 and 108px, alongside their matching portraits.
- Reviewed 2/4-player desktop seating and 8-player phone seating, including
  320×568, 390×844 and 844×390 landscape. Inspected views had no horizontal
  overflow; held checks stayed visible and the final-seat flag retained its
  existing position. The table's structure was preserved.
- Inspected all 21 dice materials in ordinary, scoring/held and flat states,
  and all 16 table palettes. Checked normal and high-contrast presentation.
- Browser computed styles confirmed all six bank reactions run once for 600ms,
  and reduced motion cancels bank and bust reactions.
- The real challenge board rendered a five-of-a-kind and banked 1,000 points
  correctly against its isolated seeded fixture, with no popup/particles.
  French weekly play was checked at 320px with large text, high contrast and
  reduced motion. The real local table fixture banked 100 points and emitted
  reduced-motion bank feedback correctly.
- The review menu now scrolls on short phones; fractional camera parameters
  are normalized to valid integer seats.

These are desktop browser viewport checks, not iPhone/Android hardware tests.
Live authenticated round-trips, audio balance, keyboard behavior, browser
chrome, VoiceOver/TalkBack and measured frame times remain unverified.
Original browser preferences were restored: English, large text, high contrast
and reduced motion. Audio volumes were unchanged. No real account, challenge
allowance, progression or cosmetic-equipment writes were performed.

## Review

Run the ordinary development client and open `/?cast-review`. The gallery
contains the full cast, seat sizes, all dice and all tables. The table link
opens an eight-seat composition; its menu changes player count, camera anchor,
materials and preview-only motion, and plays bank/bust reactions. Controls stay
in memory and never equip cosmetics or save preferences. The route is DEV-only
and excluded from production.

Examples:

- `/?cast-review&scene&players=8`
- `/?cast-review&scene&players=4&anchor=2&dice=circuit&table=afterhours`
- `/?polish-review&screen=table&players=8&stage=decision` — interactive real
  table components and engine, isolated from recording/progression.
- `/?challenge-play&mode=weekly&scenario=five` — interactive real challenge
  controller, isolated from the challenge API.

Saved views:

- [Cast lineup](cast-lineup-desktop.png)
- [Bear](bear-views-desktop.png), [panda](panda-views-desktop.png),
  [cat](cat-views-desktop.png), [owl](owl-views-desktop.png),
  [frog](frog-views-desktop.png)
- [Eight-seat phone](table-eight-phone.png)
- [Narrow after-hours table / circuit dice](table-eight-320.png)
- [Landscape table](table-eight-landscape.png)
- [Four-seat desktop](table-four-desktop.png)
- [Materials](materials-desktop.png)
- [French weekly challenge](weekly-french-320.png)
- [French playable table](playable-table-french-320.png)

## Resume here: Phase 6

Use an iPhone/Safari and an Android/Chrome where available, including a modest
device. Prioritize daily and weekly challenges, then the seated table. Record
device/browser, route/mode, preferences and reproducible steps for each issue.

1. **Touch and viewport:** holds/releases, last-held refusal, rapid Roll/Bank,
   details/menus, portrait/landscape, browser chrome and safe areas. Check large
   translated text and keep the existing table structure.
2. **Lifecycle and network:** background/foreground during a roll or bank,
   interrupted/lost replies, recovery without replaying the move, online
   reconnect, and challenge final-turn/result persistence. Check live accounts
   and actual allowances only with intended tester sessions.
3. **Audio and performance:** compare effects/music on phone speakers and
   headphones; measure roll/reaction frame times on modest hardware, first-load
   time and memory. Check reduced motion and flat dice. Optimize identified
   costs, including bundle splitting if measured loading warrants it.
4. **Accessibility:** VoiceOver/TalkBack dice value/held states, score updates,
   action readiness, dialog focus/dismissal, high contrast and color-vision-safe
   seats. Verify useful announcements without repetition.
5. **Update and promotion rehearsal:** check cache refresh and old saved
   settings; review temporary beta sample equipment and a rollback path.
   Making beta the default, release notes/version and main deployment remain
   a separate release decision.

Fix reproduced issues in small reviewable checkpoints. Do not treat viewport
screenshots or the current green suite as proof of on-device performance.
