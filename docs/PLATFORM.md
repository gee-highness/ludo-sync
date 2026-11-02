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
Four in a Row, Casino (South African, Swazi, Sotho, Crazy, Classic), 4 Colors, Snakes and Ladders, Memory Match, Crazy Eights, Solitaire (Klondike, FreeCell, Spider).

## Friends (invite without sharing a link)
Each device has a permanent **friend code** (8 characters, `lib/friends/store.ts`). While the app is open it listens at its own address on the pairing service (`lsf-<code>`), so a friend can reach it directly with an encrypted connection (`lib/friends/service.ts`).
- **Becoming friends:** type or scan a code (or open a `/friends?add=CODE` link). The other person sees a request with six check digits, and accepts, declines or blocks. The two devices share a secret; every invite and presence check is signed with it (HMAC-SHA-256), so only a real friend can invite you, and old invites cannot be replayed (10-minute window).
- **Inviting:** every lobby has an "Invite a friend" card with one tap per friend (`components/friends/InviteFriends.tsx`). On a friend's phone it appears as a banner anywhere in the app (and as a system notification if allowed). "Play" on the Friends page starts a room for any game and invites that friend automatically (`?host=1&invite=CODE`).
- **Limits:** there is no server holding messages, so an invite arrives only while the friend's app is open; otherwise the lobby still offers the room link. Spam is contained: unknown senders can only send a request (capped at 20, rate limited), and a code can be blocked. A device can switch listening off in Friends.
