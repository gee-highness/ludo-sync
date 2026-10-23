# Ludo Sync

Classic Ludo for 2 to 4 players: play bots, pass-and-play on one device, or pair with friends online.
Installable, works offline, 3D board with a flat 2D fallback.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm run verify     # lint + typecheck + unit tests + production build
npm run e2e        # Playwright smoke test against a production build (run `npm run build` first)
```

Scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:watch`, `e2e`, `icons` (regenerates app icons from one SVG, needs Python + Pillow), `verify`.
CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests and build, then the e2e job.

## Architecture

| Path | What lives there |
| --- | --- |
| `src/lib/ludo` | Pure rules engine: board geometry, `applyAction(state, action) -> {state, events}`, seedable RNG, bots, strict validation of saves and network input. No React, fully unit tested, with seeded whole-game simulations. |
| `src/lib/client` | Settings, synthesized sound, haptics, device capabilities, save/resume, stats, animation planning, `FrameBus`. |
| `src/hooks` | `useLocalGame` (engine on this device, bot driver) and `useAnimatedGame` (plays frames step by step so tokens hop instead of teleporting). |
| `src/components/board` | `Board2D` (SVG), `Board3D` + `LudoScene` (Three.js, lazy-loaded), `BoardView` (chooses a renderer, falls back to 2D if 3D fails or runs slowly). |
| `src/components/game`, `setup`, `menu` | Game screen, setup, menu, settings, winner overlay. |
| `src/components/pwa` | Install button, offline badge, service worker registration. |
| `src/app/sw.js/route.ts` | Generates the service worker per build. |

Game flow: input -> `applyAction` -> new state plus events -> `FrameBus` -> animator -> renderer. Online play feeds host snapshots into the same bus.

## Engine

Token progress is one number: `-1` yard, `0..50` ring, `51..56` home column, `57` home. Rules (all toggleable): exact finish, safe squares, captures, blockades, three sixes forfeit, capture and finish bonus rolls, two-dice mode. Bots come in easy, normal and hard.

## Online pairing (summary)

Terra-style: the host shows a room code, QR code and share link; guests join by code, link or QR scan. A WebCrypto handshake derives six check digits both sides compare. The host is authoritative: clients send intents (`roll`, `move`), the host validates seat and phase through the engine and broadcasts snapshots. Reconnect uses a per-seat token; spectators, reactions, rematch and AFK auto-play are supported. Transports: PeerJS, plus an in-memory transport for tests.

## PWA and offline

`/sw.js` is generated at build time with a build id, so cache names (`ludo-shell-*`, `ludo-assets-*`) are versioned and old ones are deleted on activate. It precaches the shell (`/`, `/play`, icons, manifest) and the 3D models, caches `/_next/static` files cache-first, and falls back to the cached page when a navigation fails offline. The page tells the worker which chunks it loaded so they are warm for next time. A toast offers updates; the install button uses `beforeinstallprompt`; persistent storage is requested so saves are not evicted. The worker only registers in production builds.

## Performance

The Three.js board is a dynamic import, shown only when WebGL2 exists. Devices with 2 or fewer cores, 2 GB or less memory, Save-Data or reduced motion default to the 2D board; an FPS watchdog lowers 3D quality, then drops to 2D. Models are served immutable.

## Tycoon mode (planned)

A setup option adding a Monopoly-style economy to the same engine: buy properties on ring squares, pay rent, build on full sets, Chance on stars, tax and stations, start money $1500. See `docs/PLAN.md`.
