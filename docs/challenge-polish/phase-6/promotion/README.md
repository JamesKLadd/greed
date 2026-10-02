# Visual design promotion

The user authorized making the completed visual design the default and pushing
the approved work to `main`. This checkpoint includes the challenge, menu,
table-detail, setup/results, supporting-screen, character/material and Phase 6
reliability work from the feature branch.

## Default presentation and fallback

New visitors, existing beta sessions and missing/damaged/blocked presentation
storage open the new look. The tester password is no longer part of normal
navigation. Home offers **Return to Classic**; Classic offers **Use new look**.
Both use the same gameplay, account and challenge controllers.

Classic writes an explicit session opt-out. The `?classic=1` URL fallback also
survives reload when browser storage is unavailable. Returning to the new look
clears that parameter while preserving unrelated query parameters and hashes.
Crash recovery uses the same fallback and can navigate even when history or
storage writes fail. No account permissions or game access are changed.

## Equipment at promotion

- Existing earned equipment controls the new look. The legacy ivory/classic
  base maps visually to the free house/club base; saved catalog fields stay
  compatible with Classic and existing servers.
- Portraits, frames, backgrounds, nameplates and earned badges retain the
  existing profile identity schema.
- Former temporary circuit/volcanic dice and afterhours felt remain available
  to preview. They cannot be equipped or become owned through promotion.
- Loading ignores stale session sample equipment without editing progression.
  A deliberate, valid Locker equip saves dice/table and portrait style to the
  existing profile, then uses the existing account sync.
- Classic equipment changes notify the still-mounted appearance provider.
  Online dice follow the throwing player's actual catalog skin, including
  during mixed old/new client play; old sample or unknown skin IDs use the base.

No unlocks, achievements, wins, challenge allowances, rule calculations,
database schemas or account API contracts are migrated.

## Version and deployment

The user also requested a new release version and an in-game changelog.
The release is **0.8.0**, dated **2026-10-02**, with eight new update-log bullets
covering the shipped scope. The root and all five workspace package versions
and the generated lockfile agree. Existing release dates and notes are intact.

Pushing `main` automatically deploys the client to Vercel and the server to
Render. The two deployments can finish at different times; this checkpoint
does not require a new server field or schema. The production state before
promotion was `8d87c2d70251e188d9fdfd8a573c868eb527dcb5`.

The new worker precaches all deferred screens, revalidates HTML/worker updates
and retains one previous shell cache. Existing game tabs keep running through
the normal waiting lifecycle. Installed-PWA users should close all Greed tabs/
windows, then reopen, before expecting the new offline shell to activate.

## Verification and limits

The preceding [Phase 6 notes](../README.md) record the reliability and viewport
checks. Promotion adds regression coverage for default/Classic round trips,
storage failures and recovery URLs, sample-equipment rejection, retained earned
equipment and profile identity, Classic-to-new-look equipment notification and
online catalog skins.

Full release validation: **808 tests passed, 3 database-dependent tests skipped,
62 passing files**. All five package type checks, repository ESLint/Prettier
and production build passed. After the version, release notes and duplicate
base-cosmetic cleanup, the 111 affected tests, client type check and final build
passed again. The production entry is 350.59 kB (115.45 kB gzip); the generated
worker revision is `d049730710dafc8f` and includes all 28 JS/CSS chunks.

Built-client browser checks confirmed the default presentation, both view
switches across reload, disabled equipment actions for preview-only samples,
saved portrait selection across reload, a single free base in each collection,
and all eight 0.8.0 update-log entries. Guest Daily/Weekly entry remains intact;
no account challenge attempts were consumed. French large-text/high-contrast
Home fits a 320-pixel viewport without horizontal overflow. Preview settings
were restored after these checks.

- [Default Home, 390 x 844](default-home-phone.png)
- [0.8.0 in-game update log](update-log-phone.png)
- [French large text and high contrast, 320 x 740](french-large-phone.png)

Physical iPhone/Android audio, native keyboards, VoiceOver/TalkBack,
measured device frame times and installed-PWA update behavior cannot be verified
from this PC. They remain explicitly unverified; desktop viewport checks and
the green automated suite do not substitute for those hardware checks.

## Rollback

Use **Return to Classic** or open `/?classic=1` for an immediate presentation
fallback. This leaves saved progression and equipment intact.

For a deployment-wide presentation fallback, set the presentation availability
flag (`BETA_AVAILABLE`) to false in a follow-up main commit, then build and push
normally. Retain the generated worker/update pipeline so older open games still
finish safely. Use the recorded production commit as a reference for selective
reverts if another change needs reversing. Do not reset user storage or
force-update an active game. The rollback build gets a distinct worker revision.
