# Greed 🎲

A push-your-luck 5-dice game — web edition. Play solo against bots, pass-and-play
locally, take on the daily and weekly challenges, or play online against other
people. Built as a TypeScript monorepo so **one rules engine** powers the local
UI, the bots, the authoritative online server, and both timed challenges.

Live at **[playgreed.vercel.app](https://playgreed.vercel.app)**.

## Quick start

```bash
npm install        # install all workspace dependencies
npm run dev        # start the client at http://localhost:5173
npm test           # run every package's test suite
npm run build      # production build of the client
```

The client runs on its own: solo, local and the "learn to play" game need no
server. Accounts, online play, the daily and the weekly do.

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
npm run server    # WebSocket + REST server on http://localhost:8787
npm run dev       # in another terminal, start the client
```

Then choose **Play online** → Quick match, Create private room (share the 4-letter
code), or Join by code. The client connects to `ws://<host>:8787` by default;
override with the `VITE_SERVER_URL` env var when building the client.

With no `DATABASE_URL` set the server still runs — it degrades to guest play, so
rooms and matches work while accounts, leaderboards and the challenges are
switched off. That is a useful way to test the online loop without standing up
Postgres.

## How to play

Roll 5 dice and press your luck:

- **Scoring:** a `1` = 100, a `5` = 50, three of a kind = 100 × the face
  (three 6s = 600), a straight (1-2-3-4-5 or 2-3-4-5-6) = 500. Per face the
  engine pays whichever is better, the triple or the dice counted singly — so
  three 1s are 300, not 100. **Five of a kind = 1000 and replaces** what those
  dice were paying rather than adding to it. Both of these use all five dice,
  and both can be **built across several throws** — hold 2-3-4-5 and throw for
  the 1 or the 6, and the straight pays 500 even though the die that completed
  it scores nothing on its own.
- **Holding dice:** scoring dice are kept automatically, and you can overrule
  that by tapping a die to hold or release it. Once you have thrown, **at least
  one die must stay held** — otherwise a throw would be free, and you could keep
  re-throwing all five until you liked the result.
- **Roll or bank?** Roll again to add more — but if a throw scores nothing you
  **bust** and lose the turn's points. If all 5 dice are held and scoring
  ("hot dice") you throw a fresh 5 and keep going.
- **Winning:** reach the goal (**default 3000**) to trigger the finish. Turn
  order comes from an opening roll-off — lowest pip total goes first, highest
  goes last — and **the last seat is the anchor**: it takes the final turn. If
  the last seat is first to the goal it wins outright; otherwise the round plays
  out through the last seat and the highest total wins. Ties are settled by a
  sudden-death round.

## What's in the game

- **Modes:** learn-to-play (a three-turn offline challenge with coaching), solo vs bots,
  local pass-and-play up to 8 seats, teams, online matchmaking and private rooms
  with spectating and rematch, plus two timed challenges.
- **Daily challenge:** one 10-turn run per day, independent secret dice per player.
- **Weekly challenge:** the same 10-turn run, reset **Monday 00:00
  America/Chicago**, ten attempts each day with your best one standing. Fresh dice
  every attempt; this week's board is public from the start.
  Both challenges are server-authoritative — the server keeps the seed secret,
  owns the move list and replays it to derive the score, so the client never
  sees a seed and never reports a score.
- **Bots:** one skill level, three temperaments (cautious / balanced /
  reckless). There is no difficulty setting — what differs is nerve. The
  strategy is built on an exhaustive roll model computed from the real scoring
  function, plus a dynamic program for the optimal turn.
- **Accounts and social:** signup/login with optional email verification,
  friends, per-account match history and profiles.
- **Mobile marketing:** shareable daily score images, Friends standings, and
  private room invitation links. The `/welcome/` landing page leads into practice;
  `/privacy/` explains optional first-party usage measurements. The owner can
  open Account → Growth report. [Launch kit and promotional assets](docs/mobile-marketing.md).
- **Leaderboards:** all-time, daily and weekly boards, with past champions.
- **Progression:** 33 achievements, a stats screen, and a Locker of 18 dice
  skins and 14 table themes earned by playing.
- **Presentation:** seats around an oval felt in turn order, 3-D dice tumble,
  synthesized sound and music (no audio assets to ship), reactions in online
  games, English / Spanish / French, larger-text, high-contrast, colorblind-safe
  and reduce-motion settings, and an installable PWA that plays offline.

The in-app **Update log** (`packages/client/src/game/changelog.ts`) is the
release-by-release record; this section is only a snapshot of where the game is.

## Project layout

```
packages/
  core/     Pure, dependency-free rules engine (scoring, turn + game state
            machines, seeded RNG threaded through state, roll-off, teams).
            `run.ts` + `zone.ts` are the challenge machinery the daily and the
            weekly share; `daily.ts` and `weekly.ts` are calendars on top of it.
            No rendering, no network. Fully unit-tested.
  bots/     Exhaustive roll model computed from the real `scoreRoll`, plus a DP
            for the optimal turn. One skill level, three temperaments.
            Win-rate + behavior tests.
  protocol/ Shared client<->server message contracts.
  server/   Authoritative Node WebSocket server (rooms, lobby, matchmaking, the
            game loop — reusing @greed/core to validate every action, and
            driving bot turns and pacing so all clients stay in sync) plus the
            REST API for accounts, friends, leaderboards and both challenges.
            Postgres, with an idempotent migration that runs on boot.
  client/   React + Vite web app. Drives the engine and bots for offline play,
            and talks to the server for everything online. Plain CSS in
            `src/styles/*.css`. `src-tauri/` wraps this same build as a native
            desktop app.
```

The engine is deliberately isolated from rendering and networking. That is what
keeps the bots, the offline client, the online server and both challenges all
sharing one validated source of truth for the rules.

## Production build & deploy

The client is a static site; the server is a Node process with a Postgres
database.

```bash
# 1. Build the static client (outputs packages/client/dist/)
VITE_SERVER_URL=wss://greed.example.com npm run build

# 2. Serve packages/client/dist/ from any static host (Vercel, Netlify,
#    GitHub Pages, nginx, `npx serve packages/client/dist`, …)

# 3. Run the server on a Node host (offline-only play needs no server)
npm run server            # listens on port 8787 (set PORT to change)
```

**Client build var**

- **`VITE_SERVER_URL`** is baked into the build — point it at your server's
  public URL. Use **`wss://`** (secure) when the site is served over HTTPS, or
  browsers will block the connection. Omit it for an offline-only static deploy.

**Server env**

- **`DATABASE_URL`** — Postgres. Unset degrades to guest play (see above).
- **`JWT_SECRET`** — signs session tokens. Set it in any real deployment.
- **`GROWTH_ADMIN_USERNAME`** — optional override for the private usage-report
  owner (defaults to the existing James account).
- **`PORT`**, **`ALLOWED_ORIGINS`**, **`APP_URL`** — listen port, CORS allow-list,
  and the base URL used in verification and password-reset links.
- **`RESEND_API_KEY`**, **`EMAIL_FROM`**, **`REQUIRE_EMAIL_VERIFICATION`** —
  outbound email. Without a key the server logs the link instead of sending it.

Never commit any of these: `.env*` is gitignored.

**How this repo deploys.** A push to `main` ships both halves automatically —
the client to Vercel, the server to Render (`render.yaml`), against a Neon
Postgres whose `migrate()` runs on boot. Nothing needs doing by hand. They do
not finish together, though: Vercel is quick and the server's build plus boot is
not, so for a few minutes after every push the new client is talking to the old
server. Anything reading a field the deployed server has not sent yet must
survive `undefined` — normalise once at the network boundary (`fill()` in
`net/daily.ts` and `net/weekly.ts` are the worked examples) rather than guarding
at each use.

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

## Contributing

[`CLAUDE.md`](CLAUDE.md) is the working notes for this repo: the settled rules
that are easy to get wrong, how much verification a change is worth, and the
contract tests that exist because each of them shipped broken once. Read it
before making changes.
