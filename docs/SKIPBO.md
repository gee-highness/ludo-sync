# Skip-Bo in Ludo Sync

Ludo Sync is now a small collection of games. The home page (`/`) lists them (`src/lib/games.ts`); Ludo lives at `/ludo`, Skip-Bo at `/skipbo`.
Adding a game means a new entry in `GAMES` and its own routes.

## Rules implemented
- 162 cards: twelve each of 1 to 12 and 18 Skip-Bo wildcards.
- 2 to 6 players. Stock pile 30 cards (2 to 4 players) or 20 (5 to 6); the host or player may choose 10, 15 or 20 for a shorter game.
- Draw to five at the start of a turn. Play from the hand, the face-up stock card (the next one turns up at once) and the top of any of your four discard piles onto four shared building piles (1 up to 12). A pile reaching 12 is cleared; cleared cards are reshuffled into the draw pile when it runs out.
- Playing all five hand cards draws five more and the turn goes on. A turn ends with exactly one discard (playing the last hand card as your discard does not draw until your next turn).
- The round ends when a stock pile is empty. One-round games end there; tournaments score 25 plus 5 per card left in the other stocks and run to 500 (adjustable). A game where nobody can move any more ends with the shortest stock winning.

## Code
- `lib/skipbo/engine.ts`, `types.ts`: pure rules, seeded shuffle. `bot.ts`: easy, normal and hard bots (hard looks four plays ahead to free its stock card and avoids setting up opponents). `view.ts`: what each player may see; `describe.ts`: log text; `save.ts`, `validate.ts`: saved games and stats.
- `lib/skipbo/net/*`: online play. The host's phone is authoritative and, through the same encrypted `SecureChannel` and PeerJS pairing as Ludo, sends each guest a `TableView` holding only their own hand and everyone's face-up cards (never other hands, the draw pile or the stock under the top card). Guests can drop and rejoin their seat; someone who quits is replaced by a bot; away players are auto-played after a grace period.
- `components/skipbo/*`: the table, cards (drawn in CSS and SVG), menu, online room, how to play.

## Not done yet
- Pass-and-play on one device (it would need a "hand the phone over" screen to hide hands).
- Nearby (no internet) play for Skip-Bo: the net layer is transport-agnostic, so the nearby pairing screens can be pointed at `SkipBoHost` and `SkipBoGuest`.
- Teams (partnership) rules.
- A host who closes the tab ends the room; rooms are not saved for resuming yet.
