# Nearby play: phone to phone, no internet

## What is and is not possible
A web app cannot make two phones talk over Bluetooth: browsers can only act as a Bluetooth *client* to gadgets
(Web Bluetooth), never as the other end of a phone-to-phone link. So "Nearby play" uses a **direct WebRTC connection over the local network that
two phones can make without internet**:

| Way the two phones are linked (set up in the phone's own settings) | Works? |
|---|---|
| One phone shares a Wi-Fi hotspot, the other joins it | Yes, the usual way |
| Both on the same Wi-Fi router (even with no internet behind it) | Yes |
| **Bluetooth tethering** (Bluetooth PAN: one phone shares its connection over Bluetooth) | Yes. This is real Bluetooth carrying the game |
| Wi-Fi Direct / Nearby Share pairing | Not as a network. Nearby Share / AirDrop is used only to *send the pairing text* |

The game itself does not need to know which one is used; it only needs the two phones to reach each other by IP.

## How pairing works without a server
WebRTC normally uses a broker (today PeerJS) to introduce the two phones. Offline, the **people are the broker**:

1. Host taps "Host a nearby game". The phone makes an *offer* (a short block of text, about 600-900 bytes) and shows it as a **QR code**, with **Copy** and **Share** buttons.
   Share opens the system sheet, so the offer can be sent by Bluetooth (Nearby Share, AirDrop, Messages) with no internet.
2. Guest taps "Join a nearby game", **scans** the QR (or pastes the text). Their phone makes an *answer* and shows it the same way.
3. Host **scans or pastes the answer**. The data channel opens. Six check digits appear on both screens, as with online play.
4. Repeat for each extra player (up to four seats). Then play.

No STUN or TURN servers are configured, so only local addresses are shared and nothing leaves the building.

## Architecture
Online play is already built on three small interfaces (`Network`, `Endpoint`, `Link` in `lib/net/transport.ts`);
host, guest, encryption, resume, chat and reactions all sit above them. So nearby play is **one new `Network`**, not a new game mode.

```
lib/net/
  offerCodec.ts      pack/unpack an RTCSessionDescription: strip to what is needed, deflate, base32/base64url,
                     versioned and checksummed; strict size and shape limits; chunking for oversized QR
  manualTransport.ts ManualNetwork implements Network over RTCPeerConnection with an injectable factory.
                       host:  createInvite() -> offer text ; acceptReply(text) -> Link via endpoint.onIncoming
                       guest: dial() waits for desk.acceptInvite(text) -> answer text ; resolves with a Link when the channel opens
  nearbyDesk.ts      the object the screens talk to (events: status, local-text-ready, connected, failed; methods above)
components/nearby/
  NearbyHost.tsx     name + rules, invite slots (1-3), QR + copy + share, scan/paste reply, check digits, start
  NearbyJoin.tsx     scan/paste invite, show reply, wait, check digits
  PairCard.tsx       QR (qrcode.react, already a dependency), Copy, Share, Scan (existing ScanButton), Paste
app/nearby/page.tsx  entry; menu gets a "Play nearby (no internet)" button next to online play
```
`useHostSession` / `useGuestClient` get a `network` option so they can take a `ManualNetwork` instead of `new PeerNetwork()`.
Everything above the transport (SecureChannel handshake, six-digit check, host authority, rejoin) is reused unchanged.

## Failure handling (honest messages, no dead ends)
| Situation | What the player sees |
|---|---|
| Phones on different networks, hotspot client isolation, or browser hides local addresses | After 20 s: "The phones cannot reach each other. Put both on the same hotspot or Wi-Fi, or turn on Bluetooth tethering, then try again" with a Retry that makes a fresh offer |
| Wrong or corrupted pasted text / QR | "That is not a Ludo Sync invite" (codec rejects: bad version, checksum, size, shape) |
| Reply scanned for an old invite | "That reply is for a different invite", slot stays open |
| Link drops mid-game | Existing "waiting for player" flow; rejoin means a new quick offer/reply, because there is no server to find them again |
| Browser lacks WebRTC / camera | Paste-only mode; Share still works |
| Camera permission refused | Paste and Share paths remain |

## Security
- Offers/answers are untrusted input: parsed through a strict codec with hard size limits, then handed to `setRemoteDescription` only after validation (must be `v=0`, one data channel, no media, candidates are private-range or `.local`).
- The existing `SecureChannel` (ECDH + AES-GCM) and six-digit check run on top, so a swapped QR cannot read or alter the game.
- No public IP is gathered (no STUN), so pairing does not reveal location.

## Tests
- `offerCodec`: round trip; stays under the QR budget for typical offers; rejects junk, truncated, wrong checksum, wrong version, oversize, non-private candidates.
- `manualTransport` with a **fake RTCPeerConnection pair** (in-memory): full invite/reply flow produces working `Link`s; a second guest on a second slot; late/duplicate/old replies are ignored; timeout error kind `blocked`; closing cleans up.
- **Integration**: run the existing `net.test.ts` scenarios (full game host + guest, rejoin, rematch) through `ManualNetwork`, to prove nothing above the transport changed.
- Browser smoke test: two Playwright pages exchange text through the real UI on localhost and play a turn.

## Build order
1. `offerCodec` + tests.
2. `manualTransport` + `nearbyDesk` + fake-RTC tests + reuse of the net scenarios.
3. `useHostSession`/`useGuestClient` take a network option.
4. `PairCard`, `NearbyHost`, `NearbyJoin`, `/nearby`, menu entry, How-to-play help text.
5. Two-browser smoke test, lint, types, tests, build.
6. Commit, then merge to `main`.

## Also considered, not in this change
- **Bluetooth gamepad / keyboard** input through the Gamepad API (works already for keyboards; a controller layer could be added later).
- Wi-Fi Direct / Web Bluetooth peripherals: not available to web apps.
