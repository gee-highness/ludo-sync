# Ludo Sync — Master Plan

Goal: take Ludo Sync from a single 1,600-line prototype page to a tested, installable,
online-capable game, with friend pairing modelled on Terra's device pairing.

## Audit of the starting point

| Area | Finding |
|---|---|
| Architecture | One 1,592-line client component; game rules, animation timers, bot AI and rendering are tangled together and driven by `setTimeout` + 5 ref mirrors. |
| Rules | 3-sixes rule documented but not implemented; no finish bonus; bot hard-wired to `player3`; "multiplayer" mode is a bot placeholder; blockades/exact-finish untested. |
| Correctness risk | Path progress uses absolute board indices with modulo/wrap special cases; no tests of any kind. |
| Online | Not present (modal says "coming soon"). |
| PWA | Manifest points to `/icons/*` but files live in `/icon/*`; no service worker; no maskable icon. |
| Tooling | No tests, no CI, ESLint rules switched off for the pages, `tsconfig` includes a deleted file, three/cannon-es/three-to-cannon bundled as dependencies but never imported. |
| UX / a11y | Fixed pixel layout, tokens are non-focusable divs, no keyboard play, no sound, no persistence, no settings, "Play Again" reloads the page. |

## Target architecture

```
src/
  lib/
    ludo/          pure, deterministic game engine (no React, no timers)
      board.ts       geometry: 52-cell ring, 6-cell home columns, bases, safe cells
      types.ts       GameState, Action, Rules, Player, Token
      rng.ts         seedable PRNG so the host owns dice and tests are exact
      engine.ts      createGame · legalMoves · roll · move · pass · reducer
      bot.ts         easy / normal / hard move choosers
      *.test.ts
    net/           online play, modelled on Terra's pairing
      crypto.ts      WebCrypto helpers: HKDF, HMAC, base32, room codes
      transport.ts   Link / Endpoint / Network interfaces
      peerTransport.ts   PeerJS adapter (broker only introduces peers)
      memoryTransport.ts in-memory network for tests
      pairing.ts     code-proof handshake + six-digit check, one host to many joiners
      protocol.ts    validated wire messages
      host.ts        authoritative host: seats, turn validation, snapshots, reconnect
      client.ts      joiner / spectator
      identity.ts    persisted device key + seat tokens
      *.test.ts
    storage.ts     versioned localStorage (settings, saved game, stats)
  hooks/           useLocalGame · useOnlineGame · useSettings · useSound
  components/      Board · Token · Dice · PlayerCard · Lobby · QR · dialogs
  app/             / (menu) · /play (setup + game) · /online (host / join / lobby)
```

Principles:
1. Rules live only in the engine. The UI renders state and dispatches actions.
2. The host is authoritative online: clients send intents, the host validates seat + phase,
   rolls dice from its own RNG, applies the action and broadcasts a snapshot.
3. Pairing copies Terra's trust model: a one-time room code is never sent; it derives the
   broker ID and keys an HMAC proof; both devices show the same six check digits.
4. Time, randomness and transport are injected, so everything is testable without waiting.

## Phases

1. **Foundation** — dependencies cleaned (drop unused 3D libs), Vitest, strict ESLint, tsconfig fix.
2. **Engine** — board geometry, full rules (exact finish, safe cells, captures, blockades toggle,
   three-sixes, capture/finish bonus), seedable RNG, three bot levels, exhaustive tests including
   seeded full-game simulations that must always terminate with one winner.
3. **Local UI** — responsive board, accessible tokens (buttons, shapes for colour-blind play),
   animated dice, step-by-step token hops, player cards, log drawer, setup screen with names,
   colours, rules and bot level, winner screen with real rematch, save/resume.
4. **Settings & feel** — synthesized sound (no asset downloads), haptics, animation speed,
   reduced-motion, colour-blind symbols, stats.
5. **Online** — Terra-style pairing: room code, QR code, share link, optional QR scan, host
   lobby (seats, bots, kick, rules), join by code, reconnect to the same seat after refresh,
   spectators, quick reactions, rematch, host-left handling, turn timer / AFK auto-play.
6. **PWA** — fixed manifest, maskable icons, service worker with offline shell, install prompt, meta tags.
7. **Quality** — unit + simulation + network integration tests, GitHub Actions CI
   (lint, typecheck, test, build), browser smoke test, docs rewrite.

## Done criteria
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` all pass.
- A bot game plays to completion in a real browser; an in-memory network test plays a
  host + guest game, including a mid-game reconnect.
- README documents running, architecture and the pairing protocol.

---

# Status and handoff (branch `claude/modest-turing-wrmuxy`)

App lives in `ludo-sync-game/`. Run `npm run verify` (lint, typecheck, test, build). Tests: 70 passing.

## Done and pushed
- **Engine** (`src/lib/ludo`): progress model (yard, ring 0-50, home column 51-56, home 57), exact finish,
  safe squares, captures, blockades, three sixes, capture/finish bonus, two-dice sums, forfeits, seedable RNG,
  easy/normal/hard bots, strict validation of saves and network input. Fixes the original home-column entry bug.
  The ring has four diagonal corner steps at ring indexes 4/17/30/43, as on a physical board.
- **Client infra** (`src/lib/client`, `src/hooks`): persisted settings, synthesized sound (no audio files),
  haptics, capability detection, FrameBus + animator (`useAnimatedGame`), local game + bot driver, save/resume, stats.
- **UI**: menu, setup (humans/bots in any seat, bot levels, six rule toggles), game screen (portrait, landscape,
  tablet, desktop, safe areas), settings drawer, how-to, winner overlay, log, CSS 3D dice, SVG board
  (rotatable view, stacking, destination ghosts, bursts, a11y). Old `/chakra-ludo` links redirect to `/play`.
- **3D board** (`components/board/LudoScene.ts`, `Board3D.tsx`, `BoardView.tsx`): Three.js on the existing GLBs,
  squash/stretch hops, dust, shockwaves, shake, spinning flights, idle breathing, winner fireworks, raycast
  picking, FPS watchdog (lower quality, then fall back to 2D).
  Gotchas found: glTF default metalness 1 renders black; flat plates must not cast shadows.
- **Icons**: `scripts/generate-icons.py` builds all variants from one SVG (any, maskable, apple, favicon).
- Verified in Chromium: a full bot game to a winner, no console errors, phone/landscape/tablet/desktop.

## Still to do (in this order)
1. **2D board "alive" pass**: the same personality as 3D in SVG (squash/stretch hop, landing dust, capture
   shockwave and star burst, spinning return flight, idle breathing, bouncing movable tokens, twinkling
   stars, glowing active yard, turn banner, winner dance). Respect `reduceMotion`.
2. **Monopoly look + Tycoon mode** (requested, design agreed below).
3. **Online play, Terra-style** (see "Online" in the plan above): room code + QR + link, WebCrypto handshake
   with six check digits, PeerJS and in-memory transports, authoritative host, reconnect by seat token,
   spectators, reactions, AFK autoplay, integration tests. Terra's reference code is in `gee-highness/terra-finance`
   under `src/lib/sync/` (pairing.ts, crypto.ts, peerTransport.ts).
4. **Offline-first PWA**: generated service worker route with versioned caches, warm-caching of 3D models and
   chunks, offline navigation fallback, install prompt (button exists), update toast, persistent storage request.
5. **All-device optimisation**: perf budgets, bundle splitting, low-power path, touch targets, tested viewports.
6. **CI** (workflow added; still to do:) Playwright smoke tests, README rewrite, docs.

## Tycoon mode design (Monopoly-style gameplay on the Ludo board)
Classic Ludo stays untouched. Tycoon is a setup option that adds an economy to the same engine:
- Start $1500. Landing a token on a ring square: unowned property -> offer to buy; opponent-owned -> pay rent;
  own full colour set -> may build (levels 0-3, rent multiplies); star squares -> Chance card; some squares are
  Community Chest, Tax, Station, Utility. Start squares stay safe from capture.
- Ring layout (52): per arm offsets 0 start, 1-2 property, 3 chest, 4 property, 5 station, 6-7 property, 8 star
  (chance), 9 property, 10 tax (even arms) or utility (odd arms), 11-12 property. 32 properties in 12 colour
  groups (eight of three, four of two), price rising with ring order (~$60 to $400), rent 10% of price,
  doubled with a full set, house cost 50% of price.
- Money events: entering the board from the yard +$100, token home +$250, capture takes $50 from the victim.
  A shortfall auto-sells buildings then properties at half price; still short means bankrupt (forfeit).
- Phase `decide` after a move for a pending purchase; actions `buy`, `pass`, `build`. Bots buy while keeping a
  cash reserve and complete colour sets first.
- Game ends when someone brings all four tokens home or only one player is solvent. Winner is the highest net
  worth (cash + property + buildings), with the finisher getting +$500.
- Monopoly look: pale mint board, cream tiles with a colour band on the inner side, owner flag and house pips,
  centre logo with Chance/Chest decks, corner "GO" banners. Also offered as a board theme for classic play.
  Prices and names show on tap or hover (too small to print on phone-sized cells).
- Engine plan: a `tycoon` substate on GameState (cash per seat, property map), `settle()` extracted from
  `doMove` so a pending decision can defer the turn continuation, new events, tests for every money path,
  and simulations that must always terminate.
