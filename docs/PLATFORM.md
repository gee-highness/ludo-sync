# Game platform

Every game after Ludo and Skip-Bo is a **driver** (a pure engine) plus a **table** (one React component). The platform supplies the rest, so adding a game is small and every game gets the same features.

## What a game gets for free
- Menu with name, bots (0 to n, three levels), **rules editor**, pass and play (unless `noHotseat`), online rooms, resume, how to play, pin to the top of the home screen.
- **Every rule is a player's choice**: the schema (`lib/platform/rules.ts`) drives the editor, presets, saved presets, share codes and validation of untrusted input. In an online room the host chooses the rules and everyone sees them.
- Bots on a timer, autosave after every move, cover screen for hidden hands, results, XP, points, ranks and bot win streaks.
- Online: host-authoritative rooms with per-player views (hidden hands never leave the host), chat, reactions, reconnect, kick, away auto-play.

## Adding a game
1. `lib/games/<id>/rules.ts`: the `RuleSchema` (rules plus presets).
2. `lib/games/<id>/driver.ts`: implement `GameDriver` (`create`, `apply`, `actors`, `over`, `scores`, `winners`, `view`, `bot`, `parseAction`, `describe`, `prompt`). Keep randomness in the state (`lib/platform/rng.ts`) so games are replayable and tests are deterministic. Put anything secret only in `view`, per viewer.
3. `components/games/<id>/module.tsx`: the `Table` component and how-to text.
4. Register it in `lib/platform/registry.ts` (metadata and loader).
5. Tests: rules by hand-built positions, bots finishing whole games with `simulate()`, a view test for hidden information, and a browser test in `e2e/`.

`GameDriver.mayAct` lets players act out of turn (catching a missed call, jumping in). `noHotseat` marks games where every seat plays at once (Solitaire races).

## Games
Four in a Row, Casino (South African, Swazi, Sotho, Crazy, Classic), 4 Colors, Snakes and Ladders, Memory Match, Crazy Eights, Solitaire (Klondike, FreeCell, Spider), Snakes and Ladders (themes, seeded fair boards with a shareable board number, special squares, choose-a-die), Checkers (American, Brazilian, big board; compulsory or optional captures, flying kings).

## Friends (invite without sharing a link)
Each device has a permanent **friend code** (8 characters, `lib/friends/store.ts`). While the app is open it listens at its own address on the pairing service (`lsf-<code>`), so a friend can reach it directly with an encrypted connection (`lib/friends/service.ts`).
- **Becoming friends:** type or scan a code (or open a `/friends?add=CODE` link). The other person sees a request with six check digits, and accepts, declines or blocks. The two devices share a secret; every invite and presence check is signed with it (HMAC-SHA-256), so only a real friend can invite you, and old invites cannot be replayed (10-minute window).
- **Inviting:** every lobby has an "Invite a friend" card with one tap per friend (`components/friends/InviteFriends.tsx`). On a friend's phone it appears as a banner anywhere in the app (and as a system notification if allowed). "Play" on the Friends page starts a room for any game and invites that friend automatically (`?host=1&invite=CODE`).
- **Limits:** there is no server holding messages, so an invite arrives only while the friend's app is open; otherwise the lobby still offers the room link. Spam is contained: unknown senders can only send a request (capped at 20, rate limited), and a code can be blocked. A device can switch listening off in Friends.

### Mailbox (friends who are offline) — needs a Vercel Blob store
`app/api/mailbox/route.ts` is a small mailbox kept in a **private Vercel Blob store** (`lib/mailbox/`). With it, an invite to a friend who is not online waits (up to two hours) and arrives the next time they open the app. It stays off, and the app works exactly as before, until the store exists.
- **Set up:** in the Vercel project (`gss-ludo-sync`), Storage, create a Blob store (private) and connect it to the project. That adds `BLOB_READ_WRITE_TOKEN`; redeploy. Nothing else is needed.
- **Trust:** the server only stores signed invites and accepts. They are signed with the secret the two friends share, and the owner checks the signature, so the server cannot forge or usefully read them. Friend *requests* never use the mailbox, because they carry that secret.
- **Abuse:** a device claims its code with a secret key (only a hash is stored), lists which friends may leave mail (strangers are refused), and a mailbox holds at most 30 messages, one per friend and room, deleted once collected.
- **Not included yet:** push notifications to a phone whose app is closed. That needs a pair of Web Push keys and a service-worker handler.

### Pairing on Vercel (instead of the public PeerJS service)
Rooms can pair through this app's own endpoint, `/api/signal`, so nothing depends on a third-party pairing server and nothing needs an always-on host. Phones leave each other a few kilobytes of connection details (kept in Redis for ~2 minutes), then talk **directly over WebRTC**: no game traffic passes through Vercel. Code: `lib/signal/` (server), `lib/net/signalTransport.ts` (browser side, same `Network` interface as PeerJS), `lib/net/network.ts` (which to use).
- **Switch it on (Vercel dashboard, project `gss-ludo-sync`):**
  1. Storage > Create > **Upstash Redis** (Marketplace) and connect it to the project. This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`); either pair works.
  2. Environment Variables: add `NEXT_PUBLIC_SIGNALING` = `vercel` (all environments).
  3. Redeploy. Check `https://<your-domain>/api/signal`: it should answer `{"enabled":true}`.
  To go back to PeerJS, delete `NEXT_PUBLIC_SIGNALING` and redeploy. Without Redis the endpoint answers 503 and the app uses PeerJS as before.
- **Trying it on one device first:** in the browser console run `localStorage.setItem("ludo-sync:v1:net-signaling", JSON.stringify("vercel"))` (or `"peerjs"` to force the old way).
- **Cost:** a phone asks for its mail every ~1.5 s only while it is waiting for someone (a host in a lobby, or someone joining), a few Redis commands each time. A room open for 10 minutes is roughly 2,000 commands, so the free tier (500,000 a month) covers a few hundred rooms. Idle apps do not poll.
- **Limits:** like PeerJS's free service this uses public STUN only; a strict network that blocks direct connections still needs a TURN relay (add one with `NEXT_PUBLIC_ICE_SERVERS`, a JSON list of ICE servers). The friends "online now" listener still uses PeerJS (polling for every open app would be expensive); invites to friends who are not online use the mailbox.
- **Trust:** the endpoint only passes opaque connection details. Every id is held with a secret token (only its hash is stored), so nobody can send as, or read the mail of, someone else; messages are size-limited and rate-limited.
