# Table D — event presentation

Implemented on `codex/table-c-checkpoint`, alongside Tables E and F. This is a branch checkpoint, not a deployment.

## What changed

- Match results use unboxed lettering in a clipped, noninteractive central felt lane. Four small sparks replace the old rays, opaque sign and screen wash. Long translated words fit whole; scores use the active locale's number formatter.
- `readCelebration` shares `rollCall(turn)`: five of a kind, straight, hot dice, three of a kind, then Nice Roll. Three individual scoring ones receive the triple callout; held dice from an earlier throw cannot manufacture a new triple. Five across throws still celebrates once.
- Existing durations and the one-pending-event queue remain: Nice Roll 1.5 seconds, bank 3.1, triple/straight/hot/big bank/bust 3.5, five 3.9, victory 4.3. Results wait for landing, routine scores do not replace major titles, and victory supersedes pending turn events.
- Bank feedback follows the bank event's player ID, independently of the new active turn. Authoritative totals update immediately. The traveling amount stays behind scores and dice. Bust only dims its lost, unbanked amount and gives the active character a small sigh. Bank gets a small nod; the existing last-seat flag brightens once when the final round begins.
- Reduced motion keeps static text and bank amounts, without flying sparks. Rare-pattern announcements are available to screen readers. All cues use the existing volume/mute audio bus.
- New matches, reconnect snapshots, tab hiding and unmount clear or baseline presentation state. Daily and weekly still pass `showVisuals={false}` and receive no match lettering or particles.

## Review fixtures

Run `npm run dev`, then open [Table D event review](http://127.0.0.1:5173/?table-events). It provides all 2–8 player counts, viewport presets, replay, looping and a reduced-motion preview.

The ten scenarios are legal core action sequences with fixed seeds: ordinary score, triple, three ones, straight, five across throws, repeated hot dice, bust, bank, big bank and last-seat victory. They use the real dice, shared match adapter and celebration queue. They never record progression. `?table-events&scene&players=8&event=fiveAcross&loop` opens only the scene. `&measure` adds development frame instrumentation.

## Verification

The deterministic fixture suite passes all ten scenarios at every seat count and verifies exact legal replay. Event tests check simultaneous-pattern priority, held-dice isolation, reconnect/rematch baselines, bank ownership, bust preservation and queue timing. Final repository and browser results are recorded in [Table F](../table-f/README.md).

Screenshots: [phone five](phone-five.png), [phone straight](phone-straight.png), [French accessibility settings](french-accessibility.png), [narrow French](narrow-french.png). The straight capture includes the explicitly enabled development frame meter; ordinary play's bottom strip stays empty.

Placeholder characters remain intentional. No final character artwork, new engine, account fields or scoring changes were introduced.
