# Shipping Greed on Steam

This folder holds everything for the Steam release **except** the things that must
live in your Steam partner account (App ID, depots, keys). Nothing here is wired
into the default build — the Steam integration is off until you turn it on.

## What's here

| Path                      | What it is                                                        |
| ------------------------- | ----------------------------------------------------------------- |
| `store-copy.md`           | Store name / descriptions / tags / categories draft               |
| `assets/`                 | Branded placeholder capsules (`npm run steam:assets` regenerates) |
| `app_build_APPID.vdf`     | ContentBuilder app-build script (template)                        |
| `depot_build_DEPOTID.vdf` | ContentBuilder depot script (template)                            |
| `LAUNCH_CHECKLIST.md`     | Step-by-step path from account to release                         |

## One-time setup (your side)

1. Join the [Steamworks partner program](https://partner.steamgames.com/) (US$100
   per app, refundable after US$1,000 in sales).
2. Create the app → note your **App ID** and create a **depot** → note its **Depot ID**.
3. Download the **Steamworks SDK** and, for local testing, drop
   `steam_appid.txt` (one line: your App ID) next to the built executable.
4. In App Admin → **Stats & Achievements**, create the 8 achievements using the
   API names in `packages/client/src/game/steam.ts`
   (`STEAM_ACHIEVEMENT_IDS`): `ACH_FIRST_WIN`, `ACH_HOT_HAND`, `ACH_BIG_TURN`,
   `ACH_FLAWLESS`, `ACH_HIGH_ROLLER`, `ACH_HAT_TRICK`, `ACH_GIANT_SLAYER`,
   `ACH_VETERAN`.

## How the integration is wired

- **Frontend** (`packages/client/src/game/steam.ts`): when a game unlocks
  achievements, `syncSteamAchievements()` calls the Tauri command
  `steam_unlock_achievement`. On the web build or a desktop build without the
  Steam feature it is a silent no-op — local progression is unaffected.
- **Backend** (`packages/client/src-tauri/src/lib.rs`): the command is a no-op
  stub unless compiled with the `steam` cargo feature, which pulls in the
  `steamworks` crate, initialises the Steam client on a background thread, and
  sets + stores the achievement.

So the standard `npm run tauri:build` keeps working with **no SDK and no App ID**.

## Building the Steam version

Prerequisite: the Steamworks SDK's redistributable is discoverable by the
`steamworks` crate (see its docs — typically `STEAM_SDK_LOCATION` or vendored
libs), and `steam_appid.txt` is present for local runs.

```bash
# From the repo root:
npm run tauri:build:steam      # = tauri build --features steam
```

Verify the App ID once by launching the built exe with Steam running and earning
an achievement in a solo game.

## Uploading a build

1. Copy the built app (the Tauri bundle output) into `steam/content/`.
2. Rename the two `.vdf` templates, filling in your App ID and Depot ID.
3. Run ContentBuilder via steamcmd:

```bash
steamcmd +login <partner_account> \
  +run_app_build "<abs-path>/steam/app_build_<APPID>.vdf" \
  +quit
```

4. In App Admin → **Builds**, promote the new build to a branch (test on a `beta`
   branch first; only then set `default` live).

`steam/content/`, `steam/output/` and any real (renamed) `.vdf` files are
git-ignored — commit only the templates.
