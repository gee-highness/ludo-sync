# Handoff (read this first in a new session)

Branch: `claude/modest-turing-wrmuxy`. Main already has everything up to the Friends feature (PR 15). The commit after it is **not merged yet**.

## Done and merged to main
Platform (customisable rules, generic online host/guest, bots, saves, streaks, pins) and the games: Four in a Row, Casino (South African rules, 52-card default), 4 Colors, Snakes and Ladders, Memory Match, Crazy Eights, Solitaire (Klondike, FreeCell, Spider). Friends: device codes, add by code/QR/link, one-tap invites. See `docs/PLATFORM.md`.

## Built, tested, pushed, NOT merged (this branch's latest commit)
1. **Friends mailbox** (`lib/mailbox/`, `app/api/mailbox/route.ts`): store-and-forward for invites to friends who are offline. Private Vercel Blob. Off until a Blob store is connected (`BLOB_READ_WRITE_TOKEN`).
2. **Pairing on Vercel** (`lib/signal/`, `app/api/signal/route.ts`, `lib/net/signalTransport.ts`, `lib/net/network.ts`): our own signalling instead of PeerJS, using **Upstash Redis**. Opt-in with `NEXT_PUBLIC_SIGNALING=vercel`; default is still PeerJS. Setup steps are in `docs/PLATFORM.md`.
3. A fix to the flaky Ludo "sends reactions to everyone" unit test (it now resends until received).

Checks last run: typecheck clean, lint clean, **546 unit tests passed three times in a row**. A real two-browser test (two Chromium contexts pairing through `/api/signal` over WebRTC and playing a move) passes.

## To do first in the new session
- Run the **full browser suite** once on a fresh build (`npx next build` then `npx playwright test`); it was interrupted before it finished. Then merge the branch to main (PR as before).
- Before running Playwright, make sure no old server is on port 3100 (`curl localhost:3100`); Playwright reuses it and will test an old build.
- On Vercel (project `gss-ludo-sync`, team `gss`): connect a **Blob** store (mailbox) and an **Upstash Redis** store (pairing); add `NEXT_PUBLIC_SIGNALING=vercel`; redeploy; check `/api/signal` returns `{"enabled":true}`. Nothing has been changed on Vercel yet.

## Not started
Checkers, Dominoes, Hearts, Rummy and Gin Rummy, Backgammon, Blackjack, Poker. Crazy Eights variants (Countdown, Knockout, lowest-score-wins, last-card call). Web Push notifications for a closed app (needs push keys and a service-worker handler). Friends "online now" still uses PeerJS.

## Gotchas
- `.env*` is gitignored; document variables in docs instead.
- `GameDriver` in `lib/platform/types.ts` is the contract for every game; add a game by following "Adding a game" in `docs/PLATFORM.md`.
