# Visual beta — checkpoint through 4B

## Scope delivered

- Casino direction selected: gold italic marquee, five-pip diamond mark, teal edge lights, midnight felt and dark lacquer materials. The compact table-token concept remains a future brand variant; the marquee is the implemented direction.
- Phone-first home with a distinct desktop composition, a physical dice vignette, strong local-play action, mode cards and utility navigation.
- Main-menu Visual Beta entry, casual code **2525**, session-scoped activation, Return to Classic, storage-failure tolerance and a classic recovery action on the crash screen.
- Scoped beta tokens and controls. Existing earned cosmetics and profile data are untouched.
- Solo/local table treatment, engraved brand detail, score plaque, dice material highlights, explicit held markers, banked-score response and a new victory trophy.
- Unified scoring, bank, big-bank, bust, hot-dice, five-of-a-kind and victory cues. These respect the original game timing. Existing roll sounds and the 3D roll renderer are reused.
- Original synthesized house motifs for the new event layer, using existing volume/mute settings. No new audio downloads or third-party media assets.
- A presentation-only “Try the big moments” stage on the beta menu; sound is opt-in there. No awards, game records, inventory writes or fake challenge results.
- English, Spanish and French strings; reduced-motion and high-contrast treatments.
- Online, daily and weekly use classic presentation until their later integration phase. The beta menu labels those cards explicitly.
- Service-worker cache revision for the new app shell. Site/install icons remain classic during this opt-in beta.

## Verification

- Full workspace TypeScript checks: passed.
- ESLint: passed.
- Prettier check: passed.
- Production Vite build: passed. CSS approximately 17.8 kB gzip; main JS 131.54 kB gzip; lazy beta-menu JS 1.76 kB gzip at this checkpoint. Existing music is approximately 2.9 MB; no new audio asset was added.
- Full tests: **521 passed, 3 skipped**, across 37 files. The skipped account integration cases are pre-existing.
- New tests cover incorrect codes, session persistence/removal, blocked storage, progression-key isolation, multi-throw five-of-a-kind, duplicate state/lock toggles, another completed hand, rematches, snapshot replay suppression, bank thresholds and win priority.
- Browser review includes desktop/390 px menu, incorrect/correct code, local roll/bank, held markers, score plaque and five-of-a-kind preview. Eight-seat layouts were checked at 390×844 and 844×390. The short-landscape collision found during review was fixed and seven geometry regressions were added. A 360×640 larger-text/high-contrast check and Return to Classic were also exercised. Reduced motion was enabled through Settings; final real-device motion/audio tuning remains for mobile feedback.

## Intentional boundaries and next work

This is the first playable visual slice, not the finished Locker/profile overhaul. Existing cosmetics retain their IDs and requirements; starter collectible materials, temporary sample equipment, illustrated mascots and profile synchronization remain in Phases 5–6. Settings and supporting screens inherit the beta surface treatment but have not had their full Phase 7 layout pass.

The phone viewport check is desktop-browser emulation. Actual iPhone Safari/Android touch behavior and audio quality need James’s mobile test. No claim of measured real-device frame rate or retention improvement is made. No paid assets, dependency upgrades, rules changes, database migrations or release-version changes were introduced.

## Mobile test script

1. Open the deployed website and refresh once if it was already open.
2. Scroll to **Visual Beta** on the classic main menu. Enter **2525**.
3. Try **Local game** or **Learn to play**. Roll, hold/release eligible dice, bank, and observe the next turn.
4. From the beta menu, open **Try the big moments** and preview hot dice/five-of-a-kind. Enable its sound checkbox to audition the cues.
5. Try reduced motion/larger text in Settings and check that controls remain comfortable.
6. Use **Return to Classic**. Verify the original presentation and earned items remain available.

Useful feedback: phone/browser, whether text and dice are easy to read, any accidental taps, which effects feel rewarding or too busy, sound loudness, and whether the new direction feels like Greed.

## Next checkpoint

Collect mobile feedback and fix the first slice before beginning 5A (Locker). User approval covers publishing this delivery, but does not start later phases automatically.
