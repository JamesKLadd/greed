# Phase 2B + 3A checkpoint

Challenge entry/results/standings and the visual-beta home menu are implemented.
The existing table composition, rules, server-owned scores, attempt allowances,
cosmetics, password 2525, and release version are preserved.

## Challenge screens

- Primary start/retry actions appear before results and past champions. Daily
  scores remain hidden until the player's run is complete.
- Weekly allowance consumption is distinct from attempts completed all week.
  Separate Chicago-calendar clocks show daily refills and weekly board closure.
  Midnight refresh also works for unplayed entries and exhausted allowances;
  mounted gameplay controllers finish/reconcile before a rollover read replaces them.
- A verified completed weekly response supplies the latest-attempt score; the
  standing best is a separate result. Neither score is calculated or submitted
  by these screens. Current ranks are explicitly provisional until closure.
- Gameplay hides surrounding standings, champions, unlocks, and history. Loading
  or failed status/resume reads block new attempts and offer an accessible retry.
- Leaderboard rows have readable names, a labelled own row, and larger touch
  targets. Super-bust and tie explanations use keyboard/touch disclosures.
  Daily ties use earlier run start; weekly ties use earlier score timestamp.

## Home menu

Daily/Weekly lead with distinct substantial buttons. Local/Online, guided Learn,
Locker/Friends/Leaderboards/Stats, and utility buttons are easy to identify and
tap. Weekly copy follows the calendar's published rule and Online accurately
describes sign-in. Compact phone branding and a two-column desktop composition
retain the dark felt, gold, and neon visual-beta theme.

## Verification and review

All 732 tests passed; three database-dependent account tests remain skipped.
All five package type checks, ESLint, Prettier, and the production build passed.
Calendar tests cover daily refills, weekly changes, historical/unlimited rations,
and deferring refresh while a run is mounted. Controller tests confirm that an
empty recovery read cannot supply an invented final score.

Browser reviews used the actual BetaHome and shared challenge widgets through
DEV-only routes `/?menu-preview` and `/?challenge-lobby`. Checks covered 390px
phones, 320px French with large text/high contrast/reduced motion, 1440px desktop,
and touch-opening tie details and player result dialogs. Reviewed pages had no
horizontal overflow. A narrow French account-button wrap found during review
was corrected. Language and temporary viewport overrides were restored.

- [Phone menu](menu-phone-390.jpg)
- [French narrow menu](menu-french-320.jpg)
- [Desktop menu](menu-desktop.jpg)
- [Daily entry](daily-entry-phone.jpg)
- [French weekly result](weekly-french-320.jpg)
- [Player result details](weekly-detail-phone.jpg)

These are browser viewport checks with isolated fixture data, not real phone
hardware or live authenticated challenge API tests. The fixture never opens or
spends real attempts. If the final weekly response is lost and resume finds no
open run, the existing API can recover the standing best but not a weaker latest
attempt; the latest-attempt card is correctly omitted. It is also session-only.

## Resume here

**Later checkpoint:** [4A table details and 4B setup/results are now implemented](../phase-4a-4b/README.md).
At this checkpoint, those were the next approved chunks. Remaining work now
starts with 3B supporting-screen consistency, then a character pilot,
cast/material polish, and real-phone validation.
Publishing to main and making beta the default remain separate steps.
