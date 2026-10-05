# v0.8.2 release validation

The release adds coached offline practice, daily Home status, score-card sharing and export, accepted-friends standings, durable private-room links, a mobile landing page, and optional first-party measurement with a private owner report. In-game release notes are in `packages/client/src/game/changelog.ts`; all workspace packages and the lockfile are version 0.8.2.

## Checks completed

- Full suite: **828 passed, 3 skipped**, across 66 test files. The existing skipped tests need an external account database.
- TypeScript, ESLint, repository formatting, and the production build passed. Following the final report authorization correction, typechecking and linting passed again; the targeted account, growth, and release-note tests passed (33 passed, 3 existing database skips).
- A production build in Chromium exercised the landing and privacy pages at 320, 390, 844, and 1200 pixels, with no horizontal overflow or page errors. Practice completed through its direct landing link. First-party batches contained only approved actions, random identifiers, and fixed source/campaign labels, with no authorization headers.
- Settings opt-out stopped subsequent requests. Privacy controls worked. Both Do Not Track and Global Privacy Control suppressed collection. See `browser-release-report.json`.
- Report authorization returned 401 anonymously, 403 for another signed-in account, and 200 for the configured owner. The actual browser report also loaded with the owner's session; the account response exposed the report control only to that owner.
- Real application API/browser checks passed for withheld daily standings, accepted friends only, weekly Friends standings, score copying, actual PNG download, a controlled native file-share handler, room invitations through login and reload, and lobby re-entry. Practice remains separate from ranked attempts and account progress.
- Separate isolated embedded PostgreSQL runs used the real migrations and SQL. Friend standings included friends and the viewer outside the global top 20, accepted requests in both directions, excluded pending/unrelated requests, applied the canonical best-turn tiebreak, and kept the daily completion gate.
- The real growth SQL passed duplicate-event suppression, eligible Chicago day-1/day-7 return cohorts, ordered invitation conversion, aggregate reports without raw identifiers, and 30-day pruning. No production database was used for these fixtures.
- Promotional videos were recorded from the actual practice UI and engine. Both exports are H.264 MP4, 1080 × 1920, 30 fps, silent, with fast-start metadata. `bank-or-roll.mp4` is approximately 10.5 seconds; `one-more-roll.mp4` is approximately 7.8 seconds. The preview image is 1200 × 630.

## Practical limits

Phone viewport checks ran in desktop Chromium. A real iPhone/Android check is still needed for operating-system share sheets and specific messaging apps. The automated native-share handler verifies the file payload and fallback behavior, not a physical phone.

The player-recruitment experiment and posts are prepared in `../mobile-marketing.md`; no outreach messages or social posts have been sent. Usage counts are directional browser measurements, not official game statistics or a statistically significant audience test.
