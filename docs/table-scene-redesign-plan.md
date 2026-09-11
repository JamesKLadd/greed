# Greed — character-table redesign plan

Status: Table C complete on the portable `codex/table-c-checkpoint` branch. See [Table C gameplay checks and screenshots](table-c/README.md). [Table B](table-b/README.md) and [Table A](table-a/README.md) preserve the earlier geometry and composition reviews. Local beta gameplay is connected; the live site is unchanged. Next chunk: Table D when requested.
Reference: James’s hand-drawn eight-player table, supplied September 11, 2026.
This plan supersedes the old oval/card layout direction for beta local and online matches. The broader visual-beta plan remains the background roadmap.

## 1. Confirmed direction and boundaries

The camera looks down the table from just above and behind the foreground character. The table narrows into the distance. Opponents appear as illustrated bodies around its outside edge; their point totals are printed on the felt in front of them. Five readable 3D dice occupy the near portion of the table. Large, unboxed event lettering occupies the open middle. Roll and Bank flank the foreground character. A back arrow and a menu icon are the only permanent header buttons. The bottom strip stays empty.

Confirmed with James:

- Scores remain **points**, with no dollar signs or currency conversion.
- Pass-and-play uses a **fixed view**, not a camera rotation every turn.
- Small player names remain visible beside characters; tapping a character opens details.
- Placeholder character art is acceptable. James will supply character designs later.
- Each character has back, front and side views; the side image can be mirrored.
- Daily and weekly challenges continue to have **no celebration popups**.
- The current beta remains behind the casual **2525** gate.

Scope of this redesign: beta local matches, solo/practice matches using the shared match screen, online matches and spectators. Classic retains its existing presentation. Daily/weekly retain their specialized run layout, audio and unobstructed play area; they do not acquire a ring of opponents or this table’s event text.

Not part of this implementation: new rules, paid cosmetics, advertising SDKs, real-money functionality, full 3D character models, camera controls, additional supported team sizes, or store publishing.

## 2. Rendering approach

Use an **illustrated scene with depth**, built from SVG/transparent images, CSS layers and the existing 3D dice. Do not add a 3D engine for characters that are meant to use supplied illustrations.

Build the table surface as a rounded trapezoid or perspective-projected plane: narrow far edge, broad near edge, substantial rail, dark felt and restrained casino lighting. Characters remain upright in screen space; only their size, placement, occlusion and selected view convey distance.

Keep these elements independently positioned:

1. Background and ambient lighting.
2. Far-side character bodies.
3. Table surface and rail, hiding lower portions of far-side bodies.
4. Felt markings: scores, final-seat flag and team totals.
5. Side characters and any foreground character details that sit in front of the rail.
6. Dice and their held markers.
7. Unboxed event lettering and bounded decorative accents.
8. Foreground character, names and action controls.
9. Drawer, player details, rules/history and mandatory game dialogs.

Define explicit stacking contexts. Never transform the entire game root: the existing modal implementation uses fixed positioning and inherits cosmetics from that root. A transformed ancestor could distort dialogs or trap them under the table.

Only decorative portions may overlap. Scores, names, dice hit targets, action buttons and the final-seat marker need dedicated clear regions.

## 3. Phone composition and layout budgets

Treat the drawing as the composition reference, not a pixel-perfect sizing specification. It uses an eight-player, tall portrait composition; fewer seats and shorter phones need deliberate variants.

Initial portrait layout:

| Region             | Proposed placement / rule                                                                                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header             | Approximately 48–52 CSS pixels plus top safe area. Back left, menu right; each target at least 44×44.                                                                              |
| Far characters     | Heads above the far rail, bodies partially hidden by the table.                                                                                                                    |
| Side characters    | Outside the left/right rail, facing inward. At eight players, three on each side.                                                                                                  |
| Opponent scores    | On the felt just inside each corresponding rail position.                                                                                                                          |
| Event region       | Open middle of the felt, below far-seat scores and above the near dice.                                                                                                            |
| Dice               | A single row in the near third, with a dedicated touch corridor.                                                                                                                   |
| Foreground score   | Above the back-facing character, below the dice; distinct from the current turn’s unbanked amount.                                                                                 |
| Actions            | Roll left and Bank right of the foreground character, above the empty bottom strip.                                                                                                |
| Empty bottom strip | Initial proposal: 56 CSS pixels in roomy portrait, 48 on short portrait, 32 on short landscape, plus bottom safe area. These are layout reservations, not an ad format commitment. |

Starting geometry for the first prototype: far rail around 18–22% down the scene, near rail at its bottom, dice around 68–73%, own score around 80–84%, event lettering around 43–57%. These are tuning ranges, not acceptance guarantees. Resolve them against the character and text bounding boxes in the prototype.

Use `100dvh` with a fallback and safe-area insets. Size the scene from the actual remaining space after the header and empty strip. Browser chrome opening/closing must not put Roll or Bank behind the bottom edge.

On tight phones, reduce decoration and crop character torsos before reducing text or touch targets. Dice can render smaller inside non-overlapping 44-pixel touch cells. The foreground character may be a shoulders-and-head view; it must not steal the controls’ space.

Desktop keeps the same viewpoint but uses a wider, shallower composition. Avoid stretching the phone artwork across the whole display. Landscape phones need their own compact layout template, including smaller body crops and shorter event lettering. Keep the empty bottom region, but use the compact reservation.

## 4. Seat placement for two through eight players

Replace the ellipse/pod formula with explicit scene templates. Each template defines character anchors, facing, scale, crop, name position, felt-score position and flag position.

| Players | Composition in addition to the foreground seat                        |
| ------- | --------------------------------------------------------------------- |
| 2       | One front-facing opponent at the far end.                             |
| 3       | Two front-facing opponents at the far corners.                        |
| 4       | One far-center opponent and one on each side.                         |
| 5       | Two far-corner opponents and one on each side.                        |
| 6       | One far-center opponent and two on each side.                         |
| 7       | Two far-corner opponents and two on each side.                        |
| 8       | One far-center opponent and three on each side, matching the drawing. |

Assign players by clockwise **turn distance** from the viewing anchor, starting up the left side, across the far end and down the right side. Never let a visual slot become a player identity.

Preserve current perspective behavior:

- Solo/practice: the single human is foreground.
- Online: the local player is foreground, even during someone else’s turn.
- Pass-and-play: the first seat in the established play order anchors the fixed view. Show the active player clearly; the foreground character is not necessarily the person currently acting.
- Spectator: use a stable first-seat anchor, without a “you” label. Show the watching state instead of actionable Roll/Bank controls.
- Reconnect must restore the same seat mapping. Do not rotate the camera when a player disconnects or a bot takes over.

Use a restrained halo or rim light plus a visible “Your turn” / player-name cue for the active character. Do not rely solely on color. Keep disconnect, thinking, team and emote information available.

## 5. Character assets and replacement workflow

Create a small character-view manifest, independent of profile ownership and unlock rules. Suggested shape:

```ts
type CharacterView = "front" | "side" | "back";

interface CharacterArt {
  id: string;
  front: CharacterAsset;
  side: CharacterAsset; // authored facing left
  back: CharacterAsset;
}

interface CharacterAsset {
  src: string;
  anchor: { x: number; y: number }; // normalized contact/seat anchor
  visibleBounds: { x: number; y: number; width: number; height: number };
}
```

With a left-facing side source, use it unmirrored on the right rail and mirrored on the left rail. Mirror the art only: names, badges, numbers and text must remain readable.

Initial placeholder set:

- Provide front, side and back representations for the six beta mascots.
- Reuse their existing colors and recognizable ears, muzzle/head shape and accessories.
- Use simple SVG bodies and clear silhouettes; do not spend this phase producing final character artwork.
- Back views must actually read as backs, rather than showing the front portrait turned away or darkened.
- Unsupported legacy avatar IDs use a clearly provisional compatible placeholder, retaining player name and identity. No unlock or profile migration is required.
- Define how profile frames/backgrounds behave: keep them on profile/detail cards; the seated character replaces the circular portrait. Retain selected badges/nameplate styling as small accents.

For James’s later artwork, request matching front/side/back designs with transparent backgrounds, consistent proportions and a common seating baseline. Recommend a generous transparent source canvas; crop and render using metadata rather than relying on identical file padding. A 512-pixel working height is a useful initial target, to be revised after the prototype determines actual displayed size.

Replacing a character should require changing its assets and metadata, not rewriting seat geometry. Preload/decode only the views needed by the current match. Use a lightweight fallback while an image loads or fails. Avoid animated sprite sheets in this first pass.

Characters may have a small turn-start nod or idle breathing motion later, but only after static composition and readability are accepted. Reduced motion leaves the static pose.

## 6. Replacing player cards without losing information

The number on the felt is that player’s **banked total**. Format it using the existing locale-aware number formatter. No dollar prefix.

Separate the currently risked turn points:

- Keep a compact “At stake” amount near the dice or in the central status region.
- Bank continues to display the exact amount that would be banked.
- Roll continues to display how many dice would be thrown.
- On bank, briefly animate the amount toward the active player’s felt total.
- On bust, remove only the unbanked amount. Do not animate another player’s banked score away.
- Do not wait for score animation before applying authoritative state.

Names sit beside the relevant character, with a consistent short-label style. Truncate long visual labels only with a full accessible name and a clear path to details.

Tapping a character opens a compact details sheet/dialog with player name, banked total, team if applicable, equipped identity/badge and connection state. Reuse the existing modal/focus behavior. Do not invent private statistics or add a network request for details already in match state.

For teams, preserve the actual supported four- and six-player configurations. Felt numbers remain individual contributions; show the two shared team totals in a separate, small and clearly labeled scoreboard. Team totals determine victory. Eight-player teams are not introduced by this layout.

Move the existing desktop standings rail into the drawer or an accessible standings panel so the character scene can fill the center without sacrificing rankings.

## 7. The checkered final-seat flag

Reuse the authoritative identity currently used by the card emoji: `state.order[state.order.length - 1]`.

The current flag identifies the last player in the round even before the final round begins. Keep that behavior. It must follow that player’s display slot, never the active player, the player who first reaches the goal, or a hardcoded position beside the snake.

Render a small checkered pennant/decal lying flat on the felt just inside the owner’s rail position. Use projected placement and a modest tabletop skew. Keep the squares legible at phone size; do not render an upright flagpole.

Provide an accessible “Plays last this round” label. When the final round is triggered, emphasize the same marker once and keep the final-round status discoverable. Preserve the existing endgame and tie rules.

## 8. Dice and input

Reuse `Die` and `DiceTray`, including accumulated cube rotation, landing faces, locked state, toggle eligibility and animation timing.

Move the tray to the near-third anchor. Its dice still belong to the active player: online viewers see that player’s equipped dice while their own table theme remains local.

Do not rebuild die elements when control passes between players or while rolling; the renderer deliberately preserves element identity to keep the spin continuous. Keep the existing held-check layer outside the cube’s perspective.

The five dice and their hit targets must remain unobstructed by:

- Character art, especially the near-side bodies;
- The foreground score;
- Event text, glow or particles;
- Menu overlays while closed;
- The blank bottom strip.

Keep the flat-dice setting supported. Test scoring, unheld, held, hot, rolling, disabled and last-held-die refusal states.

## 9. Unboxed event lettering

Replace the rectangular celebration sign for this match scene with large neon/sticker-like lettering in the designated open area. Match the drawing’s playful energy: bright core lettering, controlled magenta/gold/teal accents, a short scale/tilt entrance and a few small sparks. No opaque card, border rectangle, screen wash or touch-blocking overlay.

Keep the current result durations unless James changes them: Nice Roll 1.5 seconds, bank 3.1, hot/big bank/bust 3.5, five of a kind 3.9, victory 4.3.

The current system has a useful bounded queue and waits for dice to land. Preserve it. Extend its roll classification to share `rollCall(turn)` for three of a kind and straight rather than create a competing effect detector.

Important scoring detail: three of a kind must describe the current roll; five of a kind may be built across rolls. Three 1s also need the correct callout even when the rules account for them as individual scoring dice.

For simultaneous roll patterns, choose one main title: five of a kind, then straight, then hot dice, then three of a kind, then Nice Roll. A secondary unboxed “Hot dice” line may accompany a straight/five if needed; do not stack two competing announcements. Victory still supersedes queued turn messages.

Use about 3.5 seconds initially for the newly added straight/triple titles. Their exact treatment is part of the prototype review. Routine score text must not replace a major result prematurely.

Preserve the louder beta audio and volume/mute controls. Do not add a second sound playback path. Reduced motion shows readable static text without traveling sparks or scale movement.

This renderer remains disabled in daily and weekly challenges. Their existing inline result/status text is separate from a popup.

## 10. Back arrow, drawer and action buttons

Header:

- Top-left back arrow calls the same existing exit/leave action for the current mode.
- Top-right hamburger opens a drawer from the right.
- Keep accessible labels even though the resting header uses icons.
- Put the room code inside the drawer where appropriate; respect the existing hide-room-code setting.

Move the actual current utilities into the drawer:

| Utility          | Availability                                     |
| ---------------- | ------------------------------------------------ |
| Volume controls  | Local and online                                 |
| Turn history     | Local and online                                 |
| Rules            | Local and online                                 |
| Restart          | Local only, following its existing behavior      |
| Standings        | Replaces the always-visible desktop ranking rail |
| Room information | Online, respecting visibility settings           |

Keep rematch voting and host-only return-to-lobby in their existing end-of-game flow. Do not accidentally grant those actions to spectators or non-hosts by moving controls.

Drawer behavior: focus enters the drawer, Escape/backdrop closes it, focus returns to the hamburger, background interaction is blocked while open. Close the drawer before opening rules/history/player details so focus traps do not compete. Mandatory roll-off/game-over dialogs take precedence. Opening the drawer does not pause authoritative online timers.

Roll and Bank retain their current semantics and disabled states. Use the drawing’s neon-outline lettering, with a light inner stroke and limited glow over a readable dark control surface. Distinguish actions clearly and retain the smaller numeric labels.

Both controls stay in the same positions during another player’s turn, visibly disabled. Keep 44-pixel minimum targets and generous thumb spacing. Do not let the foreground body overlap their active areas.

## 11. Empty bottom region

Add a dedicated empty layout element outside the game scene, above/including the safe-area treatment as appropriate. It must reserve height without accepting pointer input.

No “AD SPACE” text, border advertisement, tracking, SDK, network request or clickable placeholder. The drawing’s label is an instruction for layout, not production copy.

Choose responsive heights during the first prototype. Future ad requirements may change them; expose a single layout token so resizing this region does not require moving every game element by hand.

## 12. Code structure and isolation

Proposed implementation boundaries:

| File/component                                       | Responsibility                                                                                              |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| New `beta/TableScene.tsx`                            | Composes the projected table, characters, felt labels, dice and event anchor from shared match props.       |
| New `beta/tableSceneGeometry.ts`                     | Pure per-count/per-viewport anchors, bounds, facing and display-order mapping.                              |
| New `beta/CharacterSprite.tsx` + character manifest  | Front/side/back art selection, mirroring, crops and fallback.                                               |
| New `beta/FeltPlayerScore.tsx` / `PlayerDetails.tsx` | Readable totals, names and accessible player details.                                                       |
| New `beta/GameMenuDrawer.tsx`                        | Existing header utilities in a focus-managed drawer.                                                        |
| `screens/GameShell.tsx`                              | Selects the new beta scene/chrome while preserving Classic. Owns overlays, notices and mode-specific slots. |
| `components/ActionBar.tsx`                           | Reuse action semantics; add a scene layout variant if needed.                                               |
| `beta/Celebration.tsx`, `celebrations.ts`            | Unboxed match treatment and shared triple/straight classification.                                          |
| `game/rollCall.ts`                                   | Reuse existing scoring-pattern interpretation.                                                              |
| New scene CSS, imported before accessibility CSS     | All scene styling scoped to beta; no broad rewrite of Classic selectors.                                    |
| `i18n/catalog.ts`                                    | New drawer/details/status strings in English, Spanish and French.                                           |
| `public/sw.js`                                       | Cache revision when a tested slice is published.                                                            |

Leave the existing `tableGeometry.ts` and its pod assumptions serving Classic. Do not alter its numbers until the old layout itself is intentionally changed. Add new geometry tests for the new scene.

Reuse the existing versioned beta identity/profile/protocol. Directional art is chosen by each viewer from the same character ID; front/back/side assets do not need new server messages or database fields.

Keep a separate development switch or scene variant to return to the previous beta table during testing. This is a rollback aid, not another password. Default players continue to see Classic unless they entered the existing beta.

## 13. Production chunks and acceptance gates

Implement only the next authorized chunk, record its result, and stop at its stated review point. Relative sizes are planning guides, not promised usage costs.

| Chunk                                           | Work                                                                                                                                                         | Acceptance / stopping point                                                                                                                            | Size         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| Table A — composition prototype                 | Static 2-, 4- and 8-seat scenes; placeholder bodies; scores, flag, dice, buttons, event sample and blank footer; phone plus desktop/short-landscape layouts. | Screenshots/preview match the drawing’s viewpoint; text and targets fit. James reviews composition before detailed animation. No live replacement yet. | Medium       |
| Table B — reusable scene and character contract | Pure geometry, all 2–8 seat templates, front/side/back placeholder set, deterministic perspective mapping and art manifest.                                  | Every seat count has readable ownership and no critical overlap; a sample asset can be replaced without layout edits.                                  | Medium       |
| Table C — playable local slice                  | Attach existing controllers/dice/actions; felt scores, active-player state, player details, flag, team totals, drawer and blank region.                      | Complete local/solo and pass-and-play games; four/six-player teams; correct action/leave/restart behavior. Ready for a focused mobile checkpoint.      | Medium–large |
| Table D — event presentation                    | Unboxed text, triple/straight integration, score movement and restrained character reactions where useful.                                                   | Rare-event fixtures prove priority, timing, reduced motion and readable dice. Daily/weekly still have no popups.                                       | Medium       |
| Table E — online and spectator validation       | Verify per-player art and dice ownership, viewer-local table, room controls, spectator anchor, reconnect and rematch.                                        | Mixed Classic/beta, old data, disconnect/takeover and spectator checks pass; no protocol change required.                                              | Medium       |
| Table F — hardening and publication             | Phone/desktop/accessibility checks, performance capture, final art/spacing tuning, full repository checks, commit and publish when authorized.               | Test report and mobile checklist accompany a deployed beta checkpoint.                                                                                 | Medium       |

Tables A, B and C are complete. Table B addressed the first review's dice size, checkered marker placement and text spacing. Table C connected local gameplay, added accessible menus/details, and corrected narrow-phone touch overlaps and focus-induced board scrolling. The next implementation chunk is **Table D**, refining event presentation.

Table C can be a second playable delivery before every animation is polished. Avoid shipping an incomplete online layout as if it were verified: use the previous beta table in unvalidated match contexts until Table E is ready.

## 14. Verification plan

Geometry:

- All counts 2–8 at narrow phone, standard phone, tablet, desktop and short landscape sizes.
- Explicit bounds for names, scores, flag, dice targets, buttons and the empty strip.
- No hit-target overlap; decorative body overlap/cropping is permitted only by design.
- Long names, tied scores, large localized totals, large text and all supported team cases.

Behavior:

- Fixed perspective through turn changes; new/rematched order handled correctly.
- Active-player dice ownership online, viewer-local table theme, character identity after reconnect.
- Flag belongs to the actual last seat before and during endgame; ties and sudden death remain correct.
- Roll/Bank/hold eligibility, last-held-die refusal, fast input and no recreated rolling cube.
- Spectator actions absent; current player actions disabled when not allowed.
- Drawer focus, dismissal, nested dialog transitions and endgame precedence.
- Final scores, game-over, host permissions and rematch voting.

Effects:

- Deterministic development fixtures for triple, straight, five across rolls, repeated hot dice, bust, bank and victory.
- One main announcement per result; no duplicate sound or replay after reconnect.
- Text never covers dice/actions/critical numbers and never intercepts taps.
- Daily/weekly remain popup-free.

Accessibility and performance:

- VoiceOver/TalkBack labels, keyboard operation, reduced motion, high contrast, color-vision-safe team/turn markers and large text.
- English, Spanish and French.
- Actual iPhone Safari and Android Chrome touch/audio checks when devices are available; emulator results clearly labeled.
- Measure animation frame times and asset payload against the existing beta, including eight sprites and an event. Use static effects as a fallback before sacrificing responsiveness.
- Verify image decode failures, delayed assets, cached/offline local play and tab backgrounding.

Repository:

- Relevant geometry and event tests during each chunk.
- TypeScript, lint, formatting, full tests and production build at a delivery boundary.
- Browser inspection is mandatory for a layout delivery; the node test suite does not render the scene.
- Do not spend usage rerunning unchanged broad checks for every visual tweak.

## 15. Resume checklist and remaining design choices

Confirmed decisions are in Section 1. The following defaults can be resolved during Table A without blocking this plan: exact camera steepness, character crop sizes, final empty-strip heights, glow colors and how much tabletop skew to apply to scores.

Resume by reading this plan, the Table C handoff, the current visual-beta progress document, repository working notes and the latest git status. The development-only `?table-preview` route remains the static review; `?table-play` now runs real local matches without recording progression. Implement Table D only when requested; preserve the connected scene, controllers and tests.

Keep a short progress entry for each completed chunk: files, screenshots, checks, unresolved problems, observed account usage and the next exact action. The allowance was **32% remaining at the start of this planning turn**; it is account-wide, and no exact future per-chunk usage can be guaranteed.

James’s supplied character artwork is the planned input for a later art pass. The placeholder contract lets layout work proceed before that artwork exists.
