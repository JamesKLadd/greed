# Table F — hardening and publication

Final chunk of the [character-table redesign](../table-scene-redesign-plan.md). Tables A–E are complete; this one is the repository-wide check, the layout and accessibility pass, the payload measurement, and the merge to `main`.

## Repository checks

All run at the delivery boundary, on the merged working tree:

| Check                  | Result                                                       |
| ---------------------- | ------------------------------------------------------------ |
| `npm run typecheck`    | Passed — all five packages                                   |
| `npm run lint`         | Passed — no warnings                                         |
| `npm run format:check` | Passed (five files needed `npm run format` first; see below) |
| `npm test`             | **616 passed, 3 skipped, 48 files**                          |
| `npm run build`        | Passed — production client                                   |

The three skipped tests need a configured Postgres account database; none was available here. They were skipped in the Table C and visual-beta runs for the same reason.

Formatting was the only thing failing when this chunk started: `Celebration.tsx`, `LocalTableGame.tsx`, `localTableGame.css`, `tableEvents.css` and the Table F layout audit. CI runs `format:check`, so the branch would have failed CI as it stood. Fixed with `npm run format`; no logic changed.

## Geometry coverage

`tableSceneGeometry.test.ts` now runs **45 tests** (was 38). Two additions this chunk:

- **A tablet size (768×940).** The plan's verification list asks for narrow phone, standard phone, tablet, desktop and short landscape; every size but tablet was already covered. It passes with no changes to the geometry.
- **Name-to-name non-overlap at every seat count and size.** Name chips are buttons — they open player details — so two of them sharing pixels is a hit-target conflict rather than a cosmetic one. No count or size violates it.

Deliberately _not_ asserted: name boxes never touching score boxes. At six or more seats the near-side name chip and that same player's own score box share a corner on portrait layouts. The score is inert text centred in a box far wider than its glyphs, so nothing overlaps on screen and no tap target is contested. Asserting it would fail the current design against a rule the plan never sets — the plan asks for clear regions for _hit targets_, and those are clear.

## Browser layout audit

Seven render-forced samples spanning all five required viewport classes and seat counts 2, 5, 7 and 8 — see [layout-audit.json](layout-audit.json). Every one passes: no page overflow, five dice each owning a 44-pixel touch cell, both actions owning their own centres at 44 pixels or more, all names and scores inside the viewport, the last-seat flag placed, and the blank bottom strip present.

Per-count exhaustive coverage is the node geometry suite above (6 sizes × 7 counts, deterministic). The browser's job here is confirming the rendered result matches that geometry once CSS, fonts and character art are involved.

### One thing that looked like a bug and is not

An early pass of this audit reported player names rendering past the right edge at 320 CSS pixels — two of eight entirely off-screen. It reproduced consistently and the numbers were real: `--scene-die-edge` read `30.42px`, which is what `tableSceneGeometry` produces at width 390, on a 320-wide viewport. `TableScene` starts from `useState({ width: 390, height: 736 })` and corrects via a `ResizeObserver`.

The observer was never firing. A `ResizeObserver` created by hand on the same element also never fired. Resize observations are delivered as part of the rendering steps, and the automation browser pane was hidden, so those steps were not running. Forcing a paint corrected `--scene-die-edge` to `25px` and every name to within 318 of a 320 viewport.

So the defect was in the harness, not the scene. Recorded because the false reading is reproducible and convincing, and because the same hidden-pane behaviour will make any future `ResizeObserver`-driven measurement look broken: **force a paint before measuring a viewport-dependent layout.** The geometry's own clamp (`clamp(x, nameWidth / 2 + 2, width - nameWidth / 2 - 2)`) is what actually guarantees the bound, and it is covered by the node suite at every size.

## Accessibility

Checked together at 390×844 with eight seats, mid-turn, with an event on screen: **French, large text, high contrast and reduced motion all at once**.

- Every name button carries a localized `aria-label` (`Voir les détails de …`) and a `title` with the full name, so a truncated chip still has a complete accessible name and a path to details.
- Two `aria-live="polite"` regions: the coaching line (`role="status"`) and the turn/at-stake label.
- Reduced motion leaves the event lettering static and its sparks `display: none`; the text stays readable.
- High contrast keeps the action outlines visible; large text does not push Roll or Bank off their row, and the French `LANCER` / `Encaisser` labels fit.
- The event renders unboxed in the open middle of the felt — no card, border, screen wash or pointer interception — as Table D specifies.

## Payload

Production build, gzip:

| Asset          | Table F   | Previous beta | Change    |
| -------------- | --------- | ------------- | --------- |
| `index` JS     | 148.26 kB | 138.03 kB     | +10.23 kB |
| CSS            | 24.29 kB  | 19.63 kB      | +4.66 kB  |
| Lazy beta home | 1.49 kB   | 1.49 kB       | —         |
| Lazy Locker    | 1.83 kB   | 1.83 kB       | —         |

About **15 kB more gzipped initial payload** than the previous beta, for the whole character table across Tables C, D and E. No new dependency, no downloaded art and no new audio: the characters are inline SVG.

**Frame times were not measured.** The hidden automation pane does not run continuous rendering steps — the same reason the `ResizeObserver` stayed silent — so any `requestAnimationFrame` timing captured here would be an artifact. The development frame meter (`?table-events&measure`) remains the way to capture this on a real device, and it is still the outstanding item below.

## Service worker

`public/sw.js` is at `greed-shell-v8-character-table`, bumped from `v7-clear-challenges`. The shell cache must change with a published slice or the old cache keeps winning.

## Not verified here

Stated plainly rather than implied by omission:

- **Real iPhone Safari and Android Chrome.** No device was available. Touch accuracy, device audio, real frame rates and browser-chrome resize behaviour are untested on hardware.
- **Measured animation frame times**, per above.
- **Screen readers.** ARIA labels, roles and live regions were inspected in the DOM; VoiceOver and TalkBack were not run.
- **Live account round-trips.** The three Postgres-backed tests stayed skipped.
- The final online rematch browser rerun, which [Table E](../table-e/README.md) records as claimed from real-socket tests rather than a completed browser pass.

## Screenshots

[Narrow French teams](narrow-french-teams.png) was captured during the Table F pass. The per-chunk captures live with their chunks: [Table C](../table-c/README.md) for the playable local layouts, [Table D](../table-d/README.md) for event fixtures, [Table E](../table-e/README.md) for online and spectator.

Placeholder character art remains intentional throughout. James's supplied designs are a later art pass; the manifest in `beta/characters` is what lets that happen without touching seat geometry.
