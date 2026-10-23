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
