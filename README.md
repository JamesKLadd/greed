# Greed 🎲

A push-your-luck 5-dice game — web edition. Play local co-op (pass-and-play) or
against bots. Built as a TypeScript monorepo so the same rules engine powers the
local UI, the bots, and (later) an online server.

## Quick start

```bash
npm install        # install all workspace dependencies
npm run dev        # start the client at http://localhost:5173
npm test           # run the engine + bot + client test suites
npm run build      # production build of the client
```

### Code quality

```bash
npm run typecheck    # tsc --noEmit across every package
npm run lint         # ESLint (flat config, typescript-eslint + react-hooks)
npm run format       # Prettier: write
npm run format:check # Prettier: verify (used by CI)
```

CI (`.github/workflows/ci.yml`) runs typecheck → lint → format check → tests →
build on every push and pull request.

### One-click launchers (Windows)

Don't want to remember commands? Double-click these files in the project folder:

- **`start-dev.bat`** — starts the web client (offline play) at http://localhost:5173
- **`start-server.bat`** — starts the online server (ws://localhost:8787)
- **`start-online.bat`** — starts both in their own windows and opens the game in your browser

### Play online (matchmaking / private rooms)

Online play needs the authoritative server running alongside the client:

```bash
npm run server    # start the WebSocket server on ws://localhost:8787
npm run dev       # in another terminal, start the client
```

Then choose **Play online** → Quick match, Create private room (share the 4-letter
code), or Join by code. The client connects to `ws://<host>:8787` by default;
override with the `VITE_SERVER_URL` env var when building the client.

## Production build & deploy

The client is a static site; the server is a small Node WebSocket process.

```bash
# 1. Build the static client (outputs packages/client/dist/)
VITE_SERVER_URL=wss://greed.example.com npm run build

# 2. Serve packages/client/dist/ from any static host (Netlify, Vercel,
#    GitHub Pages, nginx, `npx serve packages/client/dist`, …)

# 3. Run the authoritative server on a Node host (offline-only play needs no server)
npm run server            # listens on port 8787 (set PORT to change)
```

Notes:

- **`VITE_SERVER_URL`** is baked into the build — point it at your server's public
  WebSocket URL. Use **`wss://`** (secure) when the site is served over HTTPS, or
  browsers will block the connection. Omit it for an offline-only static deploy.
- The client is fully self-contained (no external requests, no audio/image assets),
  so it also runs from `file://` or inside a desktop wrapper (e.g. Tauri) later.
- Everything is client-side except online play; **stats, unlocks, and settings live
  in the browser's localStorage.**

## Desktop app (Tauri)

Greed can be packaged as a native desktop app with [Tauri](https://tauri.app)
(config in `packages/client/src-tauri/`). The web client is the UI — no engine
rewrite.

**Prerequisites:** the [Rust toolchain](https://rustup.rs) plus your platform's
WebView (WebView2 on Windows — preinstalled on Windows 10/11 — WebKitGTK on Linux),
and platform build tools (MSVC on Windows, `build-essential` on Linux).

```bash
npm run tauri:dev      # run the app in a native window (hot-reloads the web UI)
npm run tauri:build    # produce a release build + installers (.msi/.exe/.dmg/.deb)
npm run desktop:icon   # regenerate app icons from the built-in Greed die art
```

Installers land in `packages/client/src-tauri/target/release/bundle/`. Point the
app at your online server by building the web client with `VITE_SERVER_URL` set
(the desktop build reuses `npm run build`).

## Steam release

Everything for a Steam launch lives in [`steam/`](steam/README.md) and is **off by
default** — the standard `npm run tauri:build` needs no Steamworks SDK or App ID.

```bash
npm run steam:assets        # regenerate branded placeholder store capsules
npm run tauri:build:steam   # desktop build WITH Steam achievements (needs the SDK + App ID)
```

- Achievement sync is wired frontend→backend (`game/steam.ts` →
  `steam_unlock_achievement`) but no-ops unless built with the `steam` cargo feature.
- `steam/store-copy.md`, `steam/assets/`, the ContentBuilder `.vdf` templates, and
  `steam/LAUNCH_CHECKLIST.md` cover the store page and upload pipeline.

## How to play

Roll 5 dice and press your luck:

- **Scoring:** a `1` = 100, a `5` = 50, three of a kind = 100 × the face
  (three 6s = 600), a straight (1-2-3-4-5 or 2-3-4-5-6) = 500. Everything in a
  throw adds together.
- Every scoring die is **kept automatically**; only the non-scoring dice can be
  rerolled.
- **Reroll or bank?** Reroll to add more — but if a reroll scores nothing you
  **bust** and lose the turn's points. If all 5 dice score ("hot dice") you roll
  a fresh 5 and keep going.
- **Winning:** reach the goal (default 2000) to trigger the finish. If the
  starting player is first to the goal they win outright; otherwise the round
  plays out to its end — the last seat takes the final turn — and the highest
  total wins (the starting player, who already opened the round, does not go
  again). Ties are settled by a sudden-death round.

## Project layout

```
packages/
  core/    Pure, dependency-free rules engine (scoring, turn + game state
           machines, seedable RNG). Fully unit-tested. No rendering/network.
  bots/    Easy / medium / hard / expert AI, each with a cautious/balanced/reckless
           personality. Uses roll statistics + a full transition model computed from
           the exact engine; medium and up are endgame-aware, and expert solves the
           turn as a dynamic program over the model. Win-rate + behavior tests.
  client/  React + Vite web app (2-D table, dice, HUD, menus). Drives the engine
           and bots for offline play, and talks to the server for online play.
           `src-tauri/` wraps this same build as a native desktop app.
  protocol/ Shared client<->server message contracts.
  server/  Authoritative Node WebSocket server: rooms, lobby, matchmaking, and the
           game loop (reuses @greed/core to validate every action). Drives bot
           turns and pacing on the server so all clients stay in sync.
```

The engine is deliberately isolated from rendering and networking. That is what
keeps the bots, the offline client, and the authoritative online server all
sharing one validated source of truth for the rules.

## Status

- **v1 (done):** complete rules engine + tests, bots, offline client
  (local co-op + vs bots).
- **v2 (done):** online matchmaking + private rooms via an authoritative Node
  WebSocket server that reuses `@greed/core`; server-driven bots and pacing;
  basic reconnection after a refresh.
- **Polish (done):** seat-around-the-table layout — players sit around an oval
  felt in **turn order** (clockwise; the local player at the bottom online), dice
  in the middle, controls below; collapses to a stacked layout on narrow screens
  (`TableView.tsx`). Art & theme depth: a wood-rail / vignette / textured felt,
  per-player color identity with initial avatars (`src/game/theme.ts`), a richer
  glossy dice material, and punchier animations (3-D dice tumble, lock-pop,
  hot-dice glow, active-seat breathe). Synthesized sound effects (roll / bank /
  bust / hot dice / endgame / win) with a persisted mute toggle (on by default),
  plus `prefers-reduced-motion` support. Sounds are generated live via the Web
  Audio API — no audio assets to ship. Shared by offline and online play
  (`src/game/sfx.ts`, `useGameSounds.ts`).
- **Bots (done):** four difficulty tiers (easy < medium < hard ≤ expert, a
  measured ladder) plus cautious/balanced/reckless personalities, selectable per
  bot in offline setup and the online lobby. Expert plays the risk-neutral optimal
  turn policy via a dynamic program over the exact roll model.
- **Onboarding (done):** a "Learn to play" guided practice game (you vs one easy
  bot) with a contextual coach hint bar that narrates the roll-vs-bank loop; a
  hints toggle available in any local game; a visual scoring reference in the
  rules screen; and a first-run highlight for new players.
- **Stats & progression (done):** a local (localStorage) profile tracking games,
  wins, streaks, best turn/total and average bank across solo games; eight
  achievements; a post-game summary with any newly-unlocked badges; and a Stats
  screen from the home menu.
- **Customization (done):** unlockable dice skins and table themes earned via
  achievements/milestones, equipped in a Locker screen and applied in-game (offline
  and online) as CSS-variable overrides on the dice and felt.
- **Online polish (done):** live presence dots (connected/disconnected) on seats
  with disconnect/reconnect toasts, an "is thinking…" cue on the seat the server is
  playing, dice roll animation reconstructed from broadcast state diffs, and online
  games recorded into the stats profile with a post-game summary. (Spectator mode is
  the remaining online item.)
- **Accessibility & settings (done):** a Settings screen with larger-text mode,
  high-contrast mode, a colorblind-safe seat palette, reduce-motion, and separate
  SFX/Music volume sliders — persisted to localStorage and applied live via
  document-root data attributes plus audio/palette hooks.
- **Sound & music (done):** a synthesized ambient background-music loop (its own
  volume, no audio assets), separate SFX/Music buses under one mute, subtle pitch
  variation so repeated cues differ, and a soft UI click on every button.
- **Release prep (done):** an SVG favicon + page metadata (description, theme-color,
  Open Graph), a pre-React loading splash, a React error boundary with a graceful
  crash screen, a build-injected version footer, and a production build & deploy
  guide (above).
- **PWA / installable (done):** a web app manifest + maskable icon, a service
  worker that caches the app shell (so local & vs-bots play works offline), and an
  "Install app" button when the browser offers it. The service worker registers in
  production builds only.
- **Desktop app (done):** packaged as a native app via Tauri (`packages/client/src-tauri`);
  builds real Windows installers (see "Desktop app (Tauri)" above).
- **Internationalization (done):** a lightweight in-house i18n (string catalog +
  `t()` + React context, no library) with an English/Spanish language switcher in
  Settings (persisted). Home, Settings, and the in-game UI are translated; add
  locales by extending `src/i18n/catalog.ts`.
- **Later:** desktop/Steam build by wrapping the web client (e.g. Tauri); richer
  online polish (roll animations from state diffs, spectating, presence).
