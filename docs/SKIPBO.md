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
- `components/skipbo/*`: the flat table, cards (drawn in CSS and SVG), menu, online room, how to play. `useTableInput.ts` holds everything a table needs (picked-up card, hints, sounds, banners) and is shared by both views.
- 3D table (`SkipBoScene.ts`, `Table3DCanvas.tsx`, `Table3DView.tsx`, `lib/skipbo/layout3d.ts`): the same Renderer setting and quality tiers as Ludo. A felt table with wooden rim, cards painted on canvas textures, your hand fanned up towards you, opponents seated round the far side (the layout adapts to the screen shape), cards that fly where they are played, a burst when a pile is cleared. Drag to orbit, pinch or scroll to zoom, Reset camera, top-down and drone cameras. Tap works as on the flat table. If WebGL fails, the context is lost or the frame rate stays poor, play carries on on the flat table.

## Ways to play
Against bots (1 to 5, three skill levels), pass and play (2 to 4 people on one device; a cover screen hides each hand until the right person taps), online (room code, link or QR), and nearby (two or more phones on the same hotspot or Wi-Fi with no internet, using the same note-passing pairing as Ludo's nearby play).

## Not done yet
- Teams (partnership) rules.
- A host who closes the tab ends the room; rooms are not saved for resuming yet.
- Chat in Skip-Bo rooms (quick emoji reactions only).

## Points, progress and the rest
- **Points** (`POINTS` in `engine.ts`): 1 for a hand card, 2 for a discard-pile card, 3 for a stock card, 10 for finishing a pile, 10 for playing a whole hand, and 25 plus 5 a card left in the others' stocks for winning a round. They are shown live (a star beside each name, floating "+3 ★" when someone scores) in every kind of game. Ludo's squares-travelled score plays the same part there.
- **Experience** (`lib/client/profile.ts`): a finished game turns your points into XP (capped at 250), plus 10 for finishing, 30 for winning, and more for harder bots, tournaments, challenges and playing with friends. Levels need 50 x level x (level - 1) XP in total. The Profile page shows the level, stats, achievements for both games and the last games with what each paid.
- **Unlocks** (`lib/client/unlocks.ts`): six card backs and six table cloths open at levels 1 to 16; they show on the flat and the 3D table.
- **Achievements** (`lib/skipbo/achievements.ts`), **daily challenge** (`lib/skipbo/daily.ts`, a new twist each day with the same shuffle for everyone) and bot styles (balanced, blocker, racer).
- **Accessibility**: shapes on the cards for colour blindness, larger cards, a hidden live region that announces the last move, a main landmark and a heading on every screen, and card numbers that are painted by CSS so a button's label is its name.
- **Learn to play** (`/skipbo/learn`): seven scripted steps on the real rules, each checked by a test that its solution reaches its goal.
- **Chat and room reopening**: the host's room is saved while a game runs and can be reopened from the menu with the same code; guests rejoin their seats.
