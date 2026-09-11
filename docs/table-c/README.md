# Table C — playable local table

Status: complete as a portable review checkpoint on `codex/table-c-checkpoint`. It is not deployed. Table D is the next chunk.

## Try it

With the development server running, open [a playable eight-seat table](http://127.0.0.1:5173/?table-play&players=8). The existing [composition review](http://127.0.0.1:5173/?table-preview) also has a **Play Table C** link.

The fixture uses the real local game controller and disables result recording, so test matches do not award progression. It supports `players=2` through `8`, `solo`, `teams` (four or six only), `stress`, `seed=2525`, and `goal=1000`. Use `goal=100` for a short endgame check. These URL routes are development-only and excluded from production.

The normal app flow also works: enter the existing **2525** visual beta, choose Local game or Learn to play, then start. Classic, online and timed challenges retain their existing match layouts. `?old-table` is a development-only rollback to the previous beta local layout.

## What changed

- `GameScreen` selects the scene for local beta play while retaining `useGreed`, legal actions, roll-off, progression and game-over behavior.
- `LocalTableGame` maps actual player IDs, totals and turn order into the Table B geometry. Solo stays behind the human; pass-and-play stays behind the first established seat. The flag follows the authoritative last player.
- Existing 3D/flat dice, holding, action counts and bank values are connected. Visually smaller dice have 44-pixel touch areas. Near-seat name targets no longer intrude into the outside dice on narrow phones.
- Active-player names and a restrained character highlight show whose turn it is. Individual and team totals remain separate. Names open full player details; equipped portraits, frames, backgrounds, badges and nameplates are retained where applicable.
- Roll and Bank use neon lettering beside the foreground character. Longer translated labels fit small buttons. A back arrow returns to setup; the drawer contains volume, history, rules, restart, goal and standings. The bottom reservation stays blank.
- Menu and details block gameplay shortcuts. Enter/Space preserve native button activation. Focus is trapped and restored. Roll-off/game-over replace optional dialogs synchronously, including when a bot finishes while Rules is open.
- Restart/unmount cancel a pending dice-result timer. Cropped artwork uses `overflow: clip`, so focusing controls cannot scroll the board.
- Existing event queues, durations and audio are retained. Events have a basic unboxed felt treatment; duplicate floating toast boxes are visually hidden while their announcements remain. Table D still owns new triple/straight classification, score movement and polished reactions. Daily/weekly popup behavior was not changed.
- Short visual tips fit the felt when enabled; full coaching text remains available to assistive technology. Styles load before the accessibility layer.

## Verification

Full repository suite: **575 passed, 3 skipped, 43 files**. Includes the new narrow-phone dice/name target regression and existing geometry, scoring, holding, teams, beta access, event timing and translation contracts. Client TypeScript, repository ESLint, formatting and the production build passed.

Browser checks used the actual app and controller:

| Check                               | Observed result                                                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Two-human pass-and-play, short goal | Banked 300, final-seat bust, correct winner and game-over dialog                                                       |
| Four-player teams                   | Finished; Teal 650 versus Amber 500                                                                                    |
| Six-player teams                    | Finished; Amber 700 versus Teal 500                                                                                    |
| Solo versus bot                     | Human remained foreground; bot dice/actions unavailable; match finished correctly                                      |
| Rules open during bot finish        | Exactly one final dialog; focus remained inside it                                                                     |
| Play again and Restart              | Fresh roll-off and zero totals; optional dialogs did not reopen                                                        |
| Held dice                           | Released three of four held dice; remaining die exposed the last-held explanation; bank value updated to 100           |
| Normal motion                       | Five rolling cubes, 0.6-second CSS transition, Roll disabled in flight                                                 |
| Touch targets                       | All five effective 44-pixel regions received hits outside the smaller cube bounds                                      |
| Drawer keyboard                     | Enter opened menu without banking; H did not open another dialog; Tab wrapped; Rules close returned focus to hamburger |
| Details keyboard                    | Full long name, team and last-seat status available; Escape returned focus to the player trigger                       |
| Volume drawer                       | Both existing sliders visible and contained; opening volume kept the drawer open                                       |
| Normal navigation                   | Password entry, local beta start, back to setup, and Classic match isolation checked                                   |
| Responsive                          | 320×568, 390×844, 844×390, 1280×800 reviewed with real held dice                                                       |
| Readability settings                | Large text/high contrast; reduced and normal motion; French long names, six-player teams, tips and flat dice           |

The restart timer cancellation was code-reviewed; the browser restart check landed after the throw completed, so it is not claimed as a mid-throw race reproduction. Real-device Safari and broader performance/accessibility validation remain part of Table F.

## Screenshots

- [Phone, eight players](phone-8.png)
- [Narrow phone, eight players](narrow-8.png)
- [Short landscape](landscape-8.png)
- [Desktop](desktop-8.png)
- [French, six-player teams and flat dice](french-teams-6.png)

Placeholder artwork remains intentional. Character crop and final artistic polish can be refined with the supplied designs later.

## Resume

Read this handoff and the [overall plan](../table-scene-redesign-plan.md). Implement **Table D only when requested**: event lettering/pattern recognition, score movement and restrained character responses, preserving timing and reduced-motion readability. Table E covers online/spectators. Table F covers final hardening, merge and publication. The A/B/C work is preserved on the checkpoint branch; continue there until the design is ready to merge and publish.
