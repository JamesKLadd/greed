# Greed visual overhaul — beta production plan

Planning draft · September 9, 2026 · implementation awaits James’s approval

## 1. The proposed result

Make Greed feel like a spectacular dice table brought to life: dark felt, neon edge lighting, satisfying physical dice, bold signage, distinctive personal collections, and dramatic moments worth remembering. Family game night remains the foundation; casino showmanship defines the presentation.

Build this as an opt-in **Visual Beta** accessible from the main menu using **2525**. Classic remains the default. Both presentations use the same rules, games, accounts, and earned progress. Implementation proceeds in separately approved, reviewable chunks.

**Confirmed:** phones first, with equally polished desktop layouts; **casino showmanship: dark felt, neon accents, dramatic lights and effects**; preserve the tabletop/family identity; a substantial redesign of UI, animation, cosmetics, profiles, and branding; password **2525 with a casual client-side gate**; **illustrated animal/mascot portraits plus frames, badges and nameplates**; **preview all cosmetics, temporarily equip beta samples without changing earned unlocks**; planning only until approval.

**Working assumptions awaiting answers:** existing achievement economy; instrumental casino/lounge music with a more energetic celebration layer; no commissioned asset purchases yet; one approved chunk at a time with a proposed 30% allowance reserve. These defaults can be revised without restarting the plan.

## 2. What the current game gives us

Reviewed the repository at main commit `2c539a9`, plus the deployed home menu, Locker, and guided-game interface. This was a planning audit, not a full device test or an audio listening study.

| Area           | Current implementation                                                                                     | Opportunity                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Home           | Large GREED text, stacked mode buttons, smaller utility buttons                                            | A recognizable logo and tabletop scene; stronger hierarchy; make starting a family game immediately obvious  |
| Table          | Felt oval, wood rail, seats, central dice, persistent roll/bank actions                                    | More believable materials, improved composition, expressive player seats and better focus on the active turn |
| Typography     | Self-hosted Fraunces and Nunito Sans already present                                                       | Refine an existing suitable foundation; commission/customize the wordmark rather than replacing every font   |
| Dice           | CSS 3D cube renderer, deterministic landing faces, roughly 600 ms roll timing                              | Better weight, shadows, material surfaces and polish without a new physics engine                            |
| Locker         | 18 dice skins, 14 table themes, 20 avatars; color-variable previews and emoji faces                        | Material differences, full-size previews, animation demos, custom portraits, useful collection navigation    |
| Reactions      | Existing game log and sound hooks, hot-dice sound, streak flames, big-bank badges                          | A shared visual/audio event layer with a clear hierarchy of importance                                       |
| Audio          | Synthesized effects plus an imported background-music MP3                                                  | More tactile roll/hold/bank sounds, coherent musical signature and controlled mix                            |
| Infrastructure | React/Vite, shared pure rules engine, authoritative online server, profile sync, PWA, Tauri/Steam scaffold | Presentation can change independently; new profile fields still need careful compatibility work              |

The README’s statement that no audio assets ship is out of date: the implementation imports `background-music.mp3`. Asset provenance and the existing track’s fit should be checked during the audio phase.

Existing accessibility options include larger text, high contrast, colorblind seat colors, reduced motion, flat dice, and separate music/effects volume. These belong in the redesign from the beginning.

## 3. Research and what to borrow

“Popular” needs a date and a metric. The recent complete monthly chart used here covers **July 2026**, published August 18, combining estimated App Store and Google Play activity. Its download leaders include Roblox, Arrow Puzzle, Free Fire, Block Blast!, and Subway Surfers; Ludo King is tenth. Revenue leaders include Honor of Kings, Pokémon GO, Royal Match, Kingshot, and Coin Master; MONOPOLY GO! is tenth. These are estimates for that period, not a claim about today’s exact store positions. [SocialPeta July rankings](https://socialpeta.com/en/blog/top-mobile-games-by-revenue-and-downloads-july-2026)

For Greed, category fit is more useful than copying every chart leader. Prioritize Royal Match, MONOPOLY GO!, and tabletop-game clarity; use Brawl Stars as a supplemental cosmetics reference, not as a claimed top-ten title in that chart.

| Reference                   | Evidence and design lesson                                                                                                     | Application to Greed                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Royal Match                 | Dream Games describes rounded forms, polished objects and a welcoming world whose pieces belong to the same setting            | Treat dice, buttons, score plaques, frames and table surfaces as one designed set; use strong silhouettes and generous readable shapes                                 |
| MONOPOLY GO!                | A relevant board-game adaptation; its publisher records recognition for both game design and sound design                      | Make physical actions sound and feel satisfying; pair table movement and score feedback instead of treating audio as decoration                                        |
| Brawl Stars                 | Supercell’s April 2026 notes explicitly describe a skin VFX overhaul, including the frequently seen basic and ultimate effects | Cosmetics should have recognizable effects during ordinary play, not only on a collection card                                                                         |
| Block Blast! / Arrow Puzzle | Current download-chart references for approachable, instantly understandable play                                              | Greed’s first screenshot should communicate dice, score, players and the next action; this is a design hypothesis to test, not a proven explanation for their rankings |
| Ludo King                   | A charting tabletop reference and a closer social context than a combat game                                                   | Keep seats, turn order and shared-table identity prominent                                                                                                             |

Sources: [Dream Games world and character design](https://www.dreamgames.com/games/royal-match), [Scopely game/sound recognition](https://www.scopely.com/en/news/scopely-one-of-the-most-nominated-games-companies-for-the-28th-annual-webby-awards), [Supercell skin effects](https://supercell.com/en/games/brawlstars/blog/release-notes/release-notes-april-2026/).

These sources establish popularity, design intent, or shipped features. They do **not** isolate the causal effect of animations or sounds on retention. Our application is an informed design proposal, to be validated with Greed testers. We have not personally played and measured all these games’ current builds.

The engagement strategy is pleasurable clarity: immediate feedback, readable progress, personal expression, and memorable shared achievements. Do not introduce streak penalties, energy timers, paid randomized rewards, or pressure to keep playing as part of this visual project. Judge success by satisfaction and voluntary rematches, not session length alone.

## 4. Art direction and brand

### Selected direction: casino showmanship around a family dice table

Imagine the family gathered around a dramatic private dice table: midnight green felt, polished dark rail, ivory dice, gold signage, and electric teal light tracing the perimeter. Five-of-a-kind briefly turns the table into a show, with coordinated spotlights, five bright beats and a distinctive musical payoff. Illustrated animal players keep it personable. The action still revolves around five physical dice and the people sitting together.

Use controlled contrast: quiet dark surfaces during decisions, vivid edge lighting for active controls, and the brightest moments reserved for achievements. Keep the tone playful and theatrical. Avoid imagery that suggests real-money betting or changes the game into a slot machine. The logo, hero scene and ordinary button states should already be striking before particles are added.

Proposed starting palette — swatches for exploration, not approved contrast pairings:

| Role           | Starting color | Use                                                   |
| -------------- | -------------- | ----------------------------------------------------- |
| Signature felt | `#073D35`      | Saturated dark-green default tabletop                 |
| Deep room      | `#080D17`      | Near-black navy backdrop and depth                    |
| Warm ivory     | `#FFF1D2`      | Dice, prominent text and paper-like details           |
| Marquee gold   | `#FFC857`      | Logo, bank action, achievements                       |
| Electric teal  | `#35EAC5`      | Roll action, active edges and rail light              |
| Accent violet  | `#A78BFA`      | Secondary atmospheric/cosmetic accents in small doses |
| Warm coral     | `#FF7868`      | Bust/error accents with text and icons                |
| Polished rail  | `#251B22`      | Dark lacquer/wood material accents                    |

Reserve bright gold for banked value, highlights and accomplishment. Color alone never indicates held dice, active seats, errors or availability. Cosmetic palettes can vary while menus and controls retain their brand roles.

**Logo deliverables:** explore two directions in Phase 1: (A) a bold marquee GREED wordmark with a distinctive five-pip die emblem, and (B) a chunky, sharply readable GREED wordmark with a neon-lined table-token/monogram. Both share the casino direction; this is not another choice of overall theme. Select one family. Produce horizontal and stacked wordmarks, square app icon, monochrome and small-size versions, favicon, and background-safe variants. Build the recognizable silhouette first, then its optional glow treatment. Avoid tiny bulbs/detail that disappear on a phone. Keep the existing name and readable spelling. The five-pip motif can recur in unlock reveals and the sound signature.

**Typography:** use a custom bold wordmark and test a strong display treatment for short event headings. Keep Nunito Sans as the initial readable interface face; evaluate whether Fraunces fits supporting headings once the marquee concept is visible rather than assuming it must stay. Use stable-width score numerals and a clear size hierarchy. Avoid long all-caps paragraphs, heavy outlines on body text, or effects that blur numbers.

**Material language:** substantial beveled controls, lacquered rails, rich felt, luminous edge strips, crisp highlights and tactile press states. Keep light direction coherent. Use subtle occasional light sweeps on the menu, with a static equivalent in reduced motion. Quiet areas make moments of intensity meaningful. No permanent particle storm behind the menu.

**Brand approval checks:** recognizable at app-icon size; readable GREED wordmark; strong tabletop association without explanation; appealing to both adults and children; recognizable in monochrome; identical identity across menu, game header and future store materials.

## 5. Screen and interaction overhaul

| Surface            | Planned changes                                                                                                                                                                            | Completion check                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Main menu          | Logo plus a composed dice/table scene; prominent Play with family/friends entry; clear online/local choice; daily/weekly cards; easy-to-find Locker and profile; visible Visual Beta entry | A first-time user finds a game and the beta gate without a tour; every existing mode remains reachable |
| Setup and lobby    | Player seat cards, personalized portraits, obvious add/remove/bot controls, readable goal and team settings                                                                                | Works for 2–8 seats and long names; no ambiguous start or readiness state                              |
| Game table         | Improve rail/felt/shadows, turn spotlight, score plaque and dice staging; keep roll/bank in stable thumb positions                                                                         | Held/scoring/rolling states unmistakable; score and actions stay visible on small phones               |
| Turn order         | Compact, clear roll-off presentation and persistent anchor/last-seat indicator                                                                                                             | Players understand who acts now and who acts last                                                      |
| Results            | Winner moment, readable standings, best-turn highlight and clear rematch/leave actions                                                                                                     | Celebrations can be shortened; losing players still have a pleasant, useful screen                     |
| Locker             | Category tabs, filters, large live preview, explicit Equip, Compare and Preview effects actions                                                                                            | Locked items can be inspected; preview does not silently equip or award anything                       |
| Profile            | Composed portrait, frame, nameplate, title, featured badges and background                                                                                                                 | Legible at seat size and full profile size; predictable defaults for old profiles                      |
| Supporting screens | Apply components/tokens to settings, auth, friends, leaderboards, challenges, stats, rules and update log                                                                                  | Beta feels coherent outside the home screen                                                            |

Phone portrait is the lead layout. Tablet and desktop use available width for seats, standings and history rather than enlarging everything. Dense eight-seat games need a specifically designed composition. Do not shrink controls until they technically fit. Layout approval includes 360 px and 390 px phone widths, phone landscape, tablet, desktop, large text, Spanish and French. Real Safari/iPhone validation must happen before public release; a resized desktop browser is not sufficient.

## 6. Animation, effects and sound specification

The following durations are initial tuning targets. They describe the effect envelope, not extra time the rules must wait.

| Event                   | Visual response                                                                                                     | Audio response                                            | Initial target                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------- |
| Button press / hold die | Small physical depression; held marker settles into place                                                           | Soft click/clack                                          | 80–160 ms                                                |
| Roll                    | Weighty arc/tumble, short bounce, contact shadow; no result highlighting before landing                             | A few varied impacts matching the throw                   | Preserve current approximately 600 ms baseline initially |
| Scoring hand            | Paying dice gain a clear marker and brief highlight; score settles                                                  | Small clean confirmation                                  | 200–400 ms                                               |
| Bank                    | Points travel toward the correct player’s total; count resolves quickly                                             | Wood/chip deposit and short tonal confirmation            | 350–650 ms                                               |
| Hot dice                | Teal/gold light races around the rail; all five dice flare at their edges; bold HOT DICE marquee                    | Rising original motif plus tactile accent                 | 700–1,000 ms                                             |
| Five of a kind          | Five coordinated light beats, focused spotlights, a special pip emblem and bold title; short gold/teal particle fan | Unique payoff motif with a lower impact and bright finish | 1,000–1,400 ms                                           |
| Repeated hot dice       | Add a restrained tier of intensity and a count badge                                                                | Capped musical escalation                                 | Same duration, not increasingly long                     |
| Big bank                | Stronger deposit arc and player plaque flourish                                                                     | Richer deposit accent                                     | 600–900 ms                                               |
| Bust                    | Turn points visibly clear; brief subdued treatment                                                                  | Short soft disappointment cue                             | 300–500 ms                                               |
| Win                     | Lit winner nameplate, outward rail-light sweep, theatrical spotlight and short confetti burst                       | Original Greed victory signature                          | 1,200–1,800 ms, skippable/shortenable                    |

**Event correctness:** derive triggers from accepted game state/log events. Use `isFiveOfAKind` or an adapter around the core’s existing interpretation; do not infer from only the latest roll. Five-of-a-kind replaces the prior hand value with 1,000: an effect must not add another 1,000 on top of the authoritative score. It can overlap hot dice, so show one coordinated sequence rather than two competing overlays. Rank results/win above hand celebrations, and hand celebrations above ambient effects.

Maintain an event cursor keyed to match and event identity. Joining/reconnecting initializes to the current snapshot instead of replaying old celebrations. Rematches reset cleanly. A reconnect that collapses intermediate states may intentionally omit an old flourish; never invent a missed scoring event. If exact recovery requires a new presentation event in the protocol, price that separately after the first implementation spike.

Visuals must never determine outcomes, block authoritative turn progression, or make beta clients slower to act than classic players. Effects continue decoratively after controls become ready where appropriate. Cancel obsolete effects on navigation, match change or a new authoritative state. Online spectators and daily/weekly screens use the same presentation vocabulary.

**Cosmetic effect ownership:** outcome timing, labels and scoring markers are global. Dice skins provide small material-specific details; the local table provides one ambient layer; profiles provide seat accents. This prevents three cosmetic systems from each launching a full-screen celebration.

**Audio:** retain separate effects/music controls and existing user preferences. Start with a small original set: roll variations, hold/release, normal bank, hot dice, five-of-a-kind, bust, victory and equip. Use a shared short melodic motif. A proposed musical direction is relaxed instrumental game-night/lounge music, with room for conversation. Do not commission it until the style is approved. Duck music briefly under major cues, cap simultaneous voices and balance loudness. Unlock previews are silent until Play sound is pressed. Respect browser user-gesture audio startup and background-tab behavior. Sound quality is accepted by listening on phone speakers and headphones, not by code inspection.

**Accessibility and performance:** full, reduced and minimal effects settings; reduced mode replaces travel/rotation with brief fades and static labels. No rapid full-screen flashing. Keep dice pips, scores and action labels visible throughout. Aim for 60 fps on the agreed representative phone, degrade effect density before interaction responsiveness, and profile actual frame times. Prefer transforms/opacity and pooled, bounded effects; use CSS/SVG first and introduce a canvas overlay only where measurement justifies it. A WebGL/physics rewrite is outside the initial beta.

## 7. Cosmetics and profile design

A cosmetic must differ through at least two meaningful dimensions beyond hue: surface/material, pip treatment, edge shape/detail, pattern, animation behavior, table scenery or sound accent. Standard pip arrangements and readable die results remain constant.

Initial concept families:

| Family          | Dice                                              | Table                                                                | Signature detail                                    |
| --------------- | ------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------- |
| Signature House | Warm ivory, engraved dark pips, gold edge inlay   | Midnight green felt with lacquer/brass rail and teal perimeter light | Five-pip gold glint and tactile chip deposit        |
| Neon Club       | Smoky translucent appearance, inset luminous pips | Midnight violet felt with segmented light strips                     | Teal/violet marquee sweep and crisp electric accent |
| Carved Workshop | Visible carved grain and inset pips               | Warm family-table surface with stitched playmat                      | Small stamped light motif, dry wooden clack         |
| Molten          | Dark stone with luminous seam pattern             | Charcoal felt and copper rim                                         | Tiny ember accents on meaningful events             |
| Aurora          | Frosted pearl with layered iridescent detail      | Cool textile with a quiet northern-light backdrop                    | Soft ribbon shimmer, crystalline accent             |
| Champion        | Brushed metal, laurel engraving                   | Tournament felt and trophy detailing                                 | Brief laurel reveal for big hands                   |

These are concept briefs, not promises of six fully produced sets in the first delivery. Begin with **three dice treatments and two tables** that clearly contrast. Expand only after the material/effect system passes review. Map the remaining 18/14 legacy items into distinguishable families over later batches, preserving their IDs and earned requirements. Do not delete similar items or reset ownership; redesign their appearance or make approved legacy variants available.

**Locker workflow:** choose category → inspect item → large preview on an actual table → try roll/hold/hot-dice/five-of-a-kind demo → compare equipped → Equip or return. Add Owned/All filters and clear unlock progress. Keep locked cards visually attractive rather than dimming all art; put the lock and requirement in the information area. Use accessible buttons, keyboard navigation and visible focus states.

**Profile first delivery — confirmed mascot direction:** a consistent illustrated animal portrait set, selectable background pattern, frame, nameplate, selected earned title and featured achievement badges. Begin with six portraits based on existing friendly animals (for example fox, bear, owl, cat, frog and panda), four frames, four backgrounds and three nameplate treatments. Counts are a proposed production cap, not permanent catalog limits. Existing avatar IDs keep a fallback until their illustrated equivalents are produced. Give portraits a cohesive expression, outline weight, crop and light direction; use a small wink/nod or frame shimmer for selection/equip where appropriate. Preview the full card and tiny player-seat rendering. Provide useful free starting choices. Optional layered hats/accessories come after this slice. A human character builder and user image uploads are outside this beta’s approved direction.

**Data separation:** retain canonical achievement/progression data. Store beta look preferences in a versioned separate namespace initially; temporary sample equipment does not write earned unlocks to `greed:profile` or grant Steam achievements. Additive profile customization fields can later sync through the server with strict allowed IDs, missing-field defaults and backward-compatible payloads. Unknown cosmetics fall back gracefully in classic and older clients.

**Online presentation:** individual dice/profile choices can be visible to others when supported. Table scenery remains a viewer preference for this beta unless host-controlled tables are separately approved. Classic participants render supported legacy equivalents; beta-only sample equipment must not leak into canonical inventory or malformed network payloads.

## 8. Beta entry, isolation and rollback

Main menu → **Visual Beta** → password field → enter **2525** → success confirmation and beta menu. Label beta clearly. Main menu offers **Return to Classic** without requiring the password. Switching occurs outside an active match. Wrong password stays in the dialog with a clear error and retry/cancel; keyboard focus returns correctly.

Separate **unlock authorization** from **presentation preference**. Initial mode is classic. Proposed casual-gate behavior: remember unlock for the current browser session and remember beta preferences separately; a fresh browser session requires the code again. If remember-on-device is desired, make it an explicit choice and provide Forget beta access.

**Selected access level: casual tester gate.** James confirmed this is sufficient. Build the client-side 2525 flow; no new beta authorization server, accounts allowlist or credential infrastructure is needed. The following alternatives are recorded only to make its limits clear, not as work to execute:

| Option                     | Implementation                                                                                        | Actual protection / tradeoff                                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Casual tester gate         | Client compares 2525, sets session flag; lowest cost; works offline                                   | Anyone inspecting the shipped website can bypass it; suitable only for keeping ordinary visitors out of unfinished UI                 |
| Server-checked shared code | Store code server-side, validate with rate limiting, issue expiring authorization                     | Hides the code from normal client source, but anyone given the shared code can pass it on; online service required for initial unlock |
| Approved tester access     | Existing account login plus server allowlist and code; protected delivery if assets must stay private | Appropriate for identifying allowed testers; additional server and hosting work                                                       |

**Accepted limitation:** the shared code keeps ordinary visitors out of unfinished UI; it does not secure downloadable beta code or artwork. A client build environment variable would not make the code secret. There is no need to expand the agreed scope to stronger access controls.

For the selected casual gate, unlock locally even offline once the app is cached. A fresh browser session requires 2525 again under the proposed persistence default. Storage failure should keep a working in-memory unlock for that tab. Server outage must not break the gate or classic local play.

**Implementation boundary:** root presentation provider with `classic | beta`, explicitly scoped CSS tokens/classes, beta screen wrappers where layout differs, shared game controllers underneath. Avoid forking the entire game. Ensure modal/portal roots receive the right theme. Lazy-load beta art/audio so ordinary classic visits do not pay for the overhaul.

**Rollback:** one feature availability switch disables beta entry; classic shell remains usable. Preserve original settings/progress and beta preferences separately. Test missing asset fallback, damaged local storage, beta rendering failure, refresh, logout and offline launch. Service-worker cache updates must preserve classic availability and avoid stale HTML/chunk combinations. Browser favicon/PWA install icons stay classic during beta because they are shared app metadata; beta shows its logo inside the app until public branding is approved.

Use `codex/visual-beta-*` branches. No push to `main` until the corresponding delivery is approved for release: the repository currently auto-deploys client and server on main pushes. Preview builds and local review precede release. Additive server changes must tolerate the existing staggered client/server deployment window. Preserve the repository’s rule that James supplies release version/date and update-log wording.

## 9. Production chunks and stopping points

Effort is relative: S = contained task; M = focused feature; L = multi-part work that must be split. It is not a promise of elapsed time or a Codex usage percentage.

| Chunk                               | Deliverable                                                                                            | Dependencies                       | Size                        | Acceptance / stop point                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------- | --------------------------- | ---------------------------------------------------------------------------------- |
| 0 — Plan                            | This plan, research, decisions and scope                                                               | None                               | Done as draft               | James approves scope/direction; no game implementation yet                         |
| 1A — Brand exploration              | Two casino logo directions, palette/type board, one phone home concept                                 | Plan                               | M                           | Choose one direction; stop before producing a full asset library                   |
| 1B — Screen design                  | Approved direction on phone home, game, Locker; desktop game composition; event storyboard             | 1A                                 | M                           | Review readability, family tone and visual identity                                |
| 2 — Beta foundation                 | Client-side 2525 gate, mode provider, scoped styling, preference isolation, return-to-classic behavior | Confirmed access choice; 1A useful | S                           | Gate/fallback checks pass; classic baseline unchanged                              |
| 3 — Menu and UI system              | Beta menu, core buttons/cards/dialogs, typography and navigation                                       | 1B, 2                              | M                           | Useful menu preview on phone and desktop                                           |
| 4A — Table and dice                 | New table composition, first material, seat/score presentation and roll polish                         | 3                                  | M                           | Solo/local vertical slice; all die states readable                                 |
| 4B — Signature moments              | Shared celebration handling; hot dice/five-of-a-kind/bank/bust/win; first audio set                    | 4A                                 | M–L                         | Correct overlapping events and no turn delays; **first playable visual beta**      |
| 5A — Locker system                  | Large preview, categories, comparison, explicit equip, sample isolation                                | 4B                                 | M                           | End-to-end preview/equip workflow                                                  |
| 5B — Distinctive starter collection | Three dice treatments, two tables and appropriate effects                                              | 5A                                 | M                           | Items distinct at gameplay scale, not only in artwork                              |
| 6A — Personal profiles              | Illustrated mascots, frames, backgrounds, nameplates, titles and seat rendering                        | 5A                                 | M                           | Local customization validated at full and seat sizes                               |
| 6B — Sync and multiplayer           | Backward-compatible cosmetics/profile fields, online/spectator/challenge adapters                      | 4B, 5B, 6A                         | L; split data and UI        | Mixed classic/beta and reconnect testing passes                                    |
| 7 — Complete visual coverage        | Supporting screens, remaining cosmetics in batches of 3–4, final audio mix                             | Prior systems                      | L; several optional batches | Inventory of finished screens/items; no implicit promise to finish all in one task |
| 8 — Beta hardening                  | Device pass, accessibility, performance, cache/rollback, tester feedback fixes                         | Selected beta scope                | M–L                         | Agreed beta acceptance checklist passes                                            |
| 9 — Public release preparation      | Store assets, trailer/game capture, final icons, platform packaging review                             | Successful beta; separate approval | Separate project            | Website/Steam/App Store path chosen and current requirements checked               |

**Recommended first spending boundary:** approve 1A only, review the visual direction, then 1B. After that, approve 2–4B in individual chunks. Stop at the first playable beta and get tester feedback before funding the broader cosmetic and portrait catalogs.

Phase 4B can be reviewed in solo/local first. If online is not yet presentation-verified, clearly route those screens through classic until 6B; never silently claim full beta support. Completion of the whole requested overhaul includes 6B–8, not merely the early slice.

## 10. Keeping Codex usage manageable

The account usage tool showed approximately **2% used / 98% remaining** of the weekly allowance at the start of planning. That is an account-wide snapshot and can change while other tasks run. No exact per-phase usage estimate is reliable.

Work sequentially, one approved chunk per task/turn. Do not start a follow-on chunk automatically. After each chunk, record deliverables, changed files, checks, screenshots, remaining issues and the next exact action in a small progress document beside this plan. This avoids repeated repository discovery and research in future sessions.

Measure allowance before and after implementation chunks where useful, report observed change as an account-level delta rather than exact task attribution, and pause if it reaches James’s chosen reserve. A suggested reserve is 30% for unrelated work; this is a proposal, not an enforced cap. Checkpoints cannot guarantee a precise mid-task cutoff.

Control scope through asset counts and review points: two initial logo concepts, one chosen direction, three starter dice, two starter tables, one small sound set. Do not generate dozens of variants or build a full avatar editor before confirming the first examples. Use existing components and event hooks. Run focused checks during editing and the required complete checks once at a delivery boundary; do not repeatedly run the same full suite after unchanged results. Do not consume a usage-reset credit without explicit authorization.

## 11. Verification and definition of done

**Beta gate:** correct/incorrect code, cancel, refresh, reopening browser, switching back, storage unavailable, logout/access expiry if relevant, offline behavior and emergency disable. Authorizing beta never affects normal game progress.

**Game behavior:** held and scoring states; hot dice repeated in one turn; five-of-a-kind on one throw and across throws; five-of-a-kind plus hot dice; bank/bust; rematch; endgame/anchor and ties; rapid inputs; duplicate online state; reconnect; spectators; daily/weekly. Use controlled development fixtures for rare hands rather than playing until they occur. Fixture controls must not alter public challenge results or production rules.

**Compatibility:** legacy profiles, missing/unknown cosmetic IDs, old server/new client and new server/old client, mixed presentation clients, temporary sample items, profile merge and no lost unlocks. Changes to persisted profile contracts receive meaningful tests; database changes receive real Postgres validation.

**Visual coverage:** home, lobby/setup, game, Locker, profile, results and one representative supporting screen at each milestone. Final coverage includes every beta screen. Check small phones, desktop, 2/4/6/8 seats, long names, large text, reduced motion, high contrast, colorblind mode, English/Spanish/French, keyboard/focus and screen-reader labels. Verify real iOS Safari and Android Chrome on agreed devices; record unavailable hardware testing honestly.

**Performance:** measure classic and beta initial download and load time, cache behavior, frame times during worst-case celebration, repeated preview memory cleanup, audio startup and background suspension. Establish concrete payload limits from the baseline in Phase 2. Never accept a prettier effect that causes input stalls or obscures scoring.

**Repository checks:** relevant new behavioral tests; `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run build` at delivery boundaries. Preserve translation, style-token, seat-geometry, Steam achievement and release-version contracts. Browser validation is mandatory for layout because the current node-based test suite does not render UI.

**Tester study:** recruit a small first round, ideally 5–10 family/friend testers across phones and desktop. Ask them to start a game, identify held dice, understand a big hand, change a cosmetic and return to classic. Compare classic/beta in varied order to reduce novelty/order bias. Record task confusion, accidental taps, animation annoyance, preferred version, voluntary rematch intent and next-day logo recall. Ask whether they describe it as family/tabletop, casino, or something else. Treat results as directional feedback, not statistically proven retention gains.

First-round release criteria: no critical game/access/progress issues; testers can identify the next action and held dice without explanation; three starter dice are visibly distinct; major celebrations feel rewarding without repeated complaints about delay; agreed phone performance is acceptable; classic rollback is verified. Expand testing if feedback is split.

## 12. Platform readiness and remaining decisions

The beta should produce reusable responsive UI, vector brand masters, high-resolution art sources, documented audio licenses, and clean asset organization. The current Tauri and Steam scaffolding is a useful foundation, but it does not establish App Store readiness. Store submission, native mobile packaging, purchase systems, controller support, privacy/account workflows and platform-specific checks remain a separate release workstream. Verify then-current official requirements when that path is chosen.

The major direction choices are settled: casino showmanship, phones first, casual gate, illustrated mascots, and preview/sample cosmetics without changing unlocks. Remaining optional inputs: preferred music/reference games, art/audio budget, and weekly allowance reserve. Also useful before tester release: whether online is required for the very first drop, which real devices testers own, and whether access should persist beyond a browser session. Pending answers do not prevent approval of the visual concept chunk.

**Approval scope:** the recommended implementation approval starts Chunk 1A and stops for visual review. Recommended next instruction: “Approve the plan direction and do Chunk 1A only.” Implementation, beta publication and public launch remain distinct milestones.
