# Visual beta — collection and compatibility checkpoint

## Authorization and scope

James requested the two mobile fixes and continuation of the visual plan on September 9, 2026. The existing authorization to commit and publish the password-gated beta to main remains in effect. This checkpoint extends the first playable delivery (46ca63a) with Phases 5A, 5B, 6A and the Phase 6B implementation, plus an initial Phase 7 supporting-screen/material pass. It is not a claim that all optional collectible batches or real-device hardening are complete.

## Mobile feedback fixed

- Follow-up sound/timing feedback: beta event cues raised approximately 7 dB, retaining effects-volume and mute controls. Every result banner extended by 0.5 seconds.
- Nice Roll: 1.5 seconds; bank: 3.1 seconds; big bank and hot dice: 3.5 seconds; five of a kind: 3.9 seconds; bust: 3.5 seconds; victory: 4.3 seconds.
- Starting the next roll no longer clears the result. A bounded presentation queue keeps important messages readable, drops intervening routine score popups and prioritizes victory. This does not delay local or online game actions.
- The final challenge result remains visible before switching to the results screen.
- Held checks now sit outside the cube's perspective layer. The classic cube keeps its previous perspective behavior.
- Result signs were moved below the upper player pod in portrait play.

## Locker and starter materials — 5A / 5B

- Dedicated responsive Locker: large live table/portrait/dice preview, category controls, available-only filter, explicit equip, compare-current toggle, roll and hot/five previews, opt-in preview sound.
- Locked items can be previewed, but cannot be equipped without their original unlock. Earned achievement badges remain earned-only.
- Three session-only samples: House Ivory (engraved stock), Neon Circuit (grid inlays), Volcanic Glass (bright fracture veins). Sample particles vary in color, shape and duration.
- Two sample tables: Emerald Club felt and After Hours star-patterned midnight fabric.
- First legacy material batch: Obsidian facets, Gold brushing, Neon stripes and Molten fracture detail. IDs, requirements and Classic appearance remain intact.
- Phone collection browsing has a sticky return-to-preview link.

## Personal identity — 6A

- Six original SVG portraits: fox, bear, owl, cat, frog and panda.
- Four frames, four backgrounds, three nameplates, earned badges/titles.
- Portraits render in local seats, beta online seats, account overview and public profile cards. Nameplate accents and selected badge icons appear on seats.
- Sample dice/table equipment lives under the separate session key `greed:visual-beta:appearance:v1`.
- Only the identity design is persisted as optional versioned `Profile.visualBeta`. Equipping a beta look leaves canonical dice/table/avatar selections and earned inventory unchanged.
- Account reconciliation updates identity, logout resets the in-memory/session appearance, and malformed/unknown fields use safe fallbacks.

## Multiplayer and challenges — 6B

- Additive, bounded protocol identity/look fields. Classic IDs still travel alongside beta data; Classic clients ignore the extra field.
- Active-player dice are broadcast; the table stays viewer-local.
- Spectators receive the same looks. Reconnect retains them. Missing data from an old server falls back to legacy dice and a default portrait.
- Optional identity is preserved across legacy profile merges; unsupported fields are sanitized. No schema migration or new database query was added.
- Daily and weekly use the beta dice/effects adapter around their existing authoritative run controller. Seeds, results and scoring rules are unchanged.
- Fixed an existing client reconnect-storage recursion in read/remove helpers, with regression tests.
- The client and server deploy separately; the compatibility path supports that interval.

## Supporting screens and accessibility — first Phase 7 / 8 pass

- Shared secondary-screen branding, settings rows, statistic tiles, leaderboard surfaces, profile cards and challenge board treatment.
- Beta navigation starts new screens at the top.
- New interface strings in English, Spanish and French.
- New Locker text respects the existing large-text setting; high-contrast borders and reduced-motion static results are supported.
- Classic remains available through Return to Classic. Access code is still **2525**.
- Service-worker cache updated to `greed-shell-v6-beta-audio`. Shared install icons remain Classic.

## Verification

- All workspace TypeScript checks, ESLint and repository Prettier check pass.
- Full suite: **532 passed, 3 skipped, 41 files**. The three skipped tests require a configured real Postgres account database; no disposable local Postgres was available. Account data merging/normalization was exercised without a database; a live account round-trip is still part of tester validation.
- New coverage: banner dwell/queue/reset/disposal; sample storage isolation; locked equipment/badge enforcement; malformed identities; legacy account merges; mixed beta/Classic sockets; spectator snapshots and reconnect; client reconnect storage.
- Browser checks: 390×844 local play and held markers, explicit sample/mascot/frame/table equip, locked Gold preview refusing equip, 1280×800 Locker comparison/layout, 360×640 French with large text/high contrast/reduced motion, and Return to Classic showing the original Ivory/Classic Green equipment.
- Build: main JS 138.03 kB gzip; CSS 19.63 kB gzip; lazy Locker 1.83 kB gzip; lazy beta home 1.49 kB gzip. No downloaded art/audio or new dependency. Approximately 8.3 kB more initial JS/CSS than the previous beta.
- Desktop-browser viewport tests do not substitute for an actual iPhone/Android frame-rate, audio and touch pass.

## Mobile test checklist

1. Refresh the live website, open Visual Beta and enter **2525**.
2. In a local game, verify bank/bust/hot results remain readable and held checks stay above the dice.
3. Open Locker. Preview all three starter dice and both tables. Try the roll and effect buttons.
4. Choose a mascot, frame, background and nameplate; select **Equip beta look**. Confirm the design appears in the next game.
5. Preview a locked earned item: equip should be unavailable. Return to an available item.
6. Sign in and equip a portrait design; check its profile appearance on another signed-in device. Sample dice/table equipment is intentionally temporary, not an earned unlock.
7. Test an online private table with one beta player and one Classic player, then a spectator/reconnect. Try daily/weekly presentation during a normal authorized run.
8. Return to Classic and confirm existing cosmetics/progress remain intact.

## Next production chunks

- Continue Phase 7 with the remaining legacy dice/table art in batches of 3–4, guided by feedback on this starter collection.
- Complete device hardening: iPhone Safari and Android Chrome, smaller/older hardware, measured celebration frame times, audio mix on actual speakers/headphones, and live account/challenge UI round-trips.
- Final cross-screen audit for online lobby/results/friends/leaderboards under real account data, all seat counts and accessibility modes.
- Public store assets, final app icons and platform packaging remain Phase 9, a separate release-preparation decision. No release version/date was invented.
