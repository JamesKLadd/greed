# Greed — Steam launch checklist

Ordered from account creation to release. Boxes you can do in-repo are marked
**(repo)**; the rest happen in the Steamworks partner site.

## 1. Account & app

- [ ] Steamworks partner account created, identity/tax/bank onboarding done.
- [ ] New app created; **App ID** recorded.
- [ ] Depot created; **Depot ID** recorded.
- [ ] Steamworks SDK downloaded.

## 2. Integration

- [ ] **(repo)** Achievements created in App Admin using the API names in
      `packages/client/src/game/steam.ts` (all 8).
- [ ] **(repo)** `npm run tauri:build:steam` produces a working build on your machine.
- [ ] `steam_appid.txt` present for local testing.
- [ ] Launch the Steam build with Steam running → win a solo game → confirm the
      achievement pops and shows in your Steam profile.

## 3. Store presence

- [ ] **(repo)** Store copy finalized from `steam/store-copy.md`.
- [ ] **(repo)** Capsules uploaded (regenerate placeholders with `npm run steam:assets`,
      or replace with final art first).
- [ ] ≥ 5 screenshots (1920×1080) captured from the real game.
- [ ] Library hero (3840×1240) + transparent library logo designed.
- [ ] Short trailer (optional but strongly recommended).
- [ ] Tags & categories set; Steam Achievements category checked.
- [ ] Pricing set; release date chosen.

## 4. Build & branches

- [ ] **(repo)** App copied into `steam/content/`; `.vdf` templates renamed & filled.
- [ ] First upload pushed via steamcmd (see `steam/README.md`).
- [ ] Build promoted to a **beta** branch and smoke-tested end to end (offline,
      vs-bots, online, achievements, install/uninstall).
- [ ] Default branch set live only after beta passes.

## 5. Compliance / pre-review

- [ ] Content survey completed.
- [ ] EULA (default Steam EULA is fine unless you need custom terms).
- [ ] Supported languages listed (interface: English, Spanish).
- [ ] System requirements filled in (Windows 10+; WebView2 runtime — the Tauri
      installer already handles WebView2).
- [ ] Build passes Valve review; coming-soon page live for wishlists.

## 6. Release day

- [ ] Set the app to Released.
- [ ] Announce; verify the store page, achievements, and library art in a clean
      Steam client.

## Notes carried over from the desktop build

- Installers already produced by `npm run tauri:build`:
  `Greed_x64_en-US.msi` and `Greed_x64-setup.exe` (see repo `installers/`).
- The 1.3 GB `src-tauri/target/` build cache is intentionally **not** committed
  (repo lives under OneDrive); the first Steam build recompiles (~2 min, plus the
  `steamworks` crate the first time).
