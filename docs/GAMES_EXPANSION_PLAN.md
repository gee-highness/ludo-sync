# Games expansion plan: UI, UX and gameplay

Covers every game proposed after Ludo and Skip-Bo: Solitaire, 4 Colors (see `SOLITAIRE_AND_4COLORS_PLAN.md` for their full rules), Rummy and Gin Rummy, Hearts, Crazy Eights, Snakes and Ladders, Checkers, Dominoes, Backgammon, Four in a Row, Memory Match, and Blackjack and Poker (play money). Plus bot win streaks for every game.

**Rule for all games: online play is supported wherever the game allows it.** Every game gets online rooms (code, link, QR), nearby play (no internet), reconnect, spectators, chat and reactions. Games with no opponent (Solitaire, Memory solo) get **races on the same seeded deal** so they are still online.

## 1. Principles (apply to every game)

### 1.1 UX pillars
1. **Playable in 5 seconds.** Home tile -> "Play" -> a game against a bot starts with sensible defaults. Options live one tap away, never in the way.
2. **Always obvious what to do.** One clear highlighted action per turn: pulsing legal moves, a persistent turn banner ("Your turn: play a card or draw"), disabled actions say why on tap.
3. **No dead time.** Bot think time 0.4 to 1.2 s (scaled by level and a "Speed" setting), animations skippable, "Instant" mode, auto-play for forced moves (option), a live "waiting for X" indicator online with a nudge button.
4. **Forgiving.** Undo where the rules allow (all solo and bot games where no hidden information is revealed), confirm only on irreversible or costly actions, "Leave for now" never loses progress (autosave every action, resume from the menu, rooms reopen).
5. **Readable by everyone.** Colour is never the only cue (shapes, patterns, labels), large-card and large-text options, high-contrast theme, reduced motion, full keyboard play, screen-reader live region announcing the last move, 44 px minimum touch targets, left-handed layout.
6. **Delight without noise.** Short, satisfying animations (deal, flip, slide, capture, win), layered sound and haptics, one celebration per win. Everything respects Settings (sound, haptics, motion).
7. **One look.** Shared design tokens, cards, dice, cloths and card backs, the same top bar (Back, Info, Undo where allowed, Camera, Sound, Help), the same turn banner, results overlay, profile hooks and settings drawer for every game.

### 1.2 Screen map for every game
```
Hub tile
  -> Game menu: Play bots | Pass and play | Online | Nearby | Daily | Learn | Resume | Rules | Stats
       -> Setup (options + presets, one screen, defaults pre-filled, "Start")
            -> Table (flat or 3D)
                 -> Result overlay (points, XP, streak, rank, rematch, share, new game)
```
Bots, pass and play, daily, learn and resume need no connection. Online needs one; the screen says so and offers Nearby.

### 1.3 Gameplay pillars
- **Pure engine per game** (`lib/<game>/`): `applyAction(state, action) -> {state, events}`, seeded RNG, strict validation of saves and network input, `view.ts` for hidden information, `describe.ts` for the log and screen-reader text, `bot.ts` with easy, normal and hard.
- **Rule options with presets**, as in Ludo's tuning: every contested rule is a named option with a default, shown in setup and How to play.
- **Simulation tests**: thousands of seeded bot-vs-bot games must terminate with valid scores; hard beats normal beats easy over 1,000 games.
- **Learn to play** per game: 6 to 8 scripted steps on the real engine, each verified by a test that its solution reaches its goal.

## 2. Online and nearby: how each game works

The host's device is authoritative (as in Ludo and Skip-Bo). Clients send intents; the host validates through the engine and sends each seat a **view** that contains only what that seat may see. Same `SecureChannel`, pairing, reconnect token, spectators, quit-replaced-by-bot, away auto-play and reopen-room behaviour already built.

| Game | Online model | Players | Hidden info | Notes |
| --- | --- | --- | --- | --- |
| Ludo, Skip-Bo | existing | 2-4, 2-6 | stock/hands | unchanged |
| Solitaire | **Race** on the same seeded deal; host replays reported moves to verify; live progress bars; first win or best score at the time limit | 2-8 | none | also async daily leaderboard among friends by result code |
| 4 Colors | Full game | 2-10 | hands, draw pile | `TableView` per seat; challenge reveals only to the challenger |
| Rummy / Gin Rummy | Full game | 2-6 (Gin 2) | hands, stock | knock/show reveals hands only at round end |
| Hearts | Full game | 4 (3, 5 variants) | hands | passing phase simultaneous; each player's pass hidden until all chosen |
| Crazy Eights | Full game | 2-8 | hands, stock | same engine family as 4 Colors |
| Snakes and Ladders | Full game | 2-6 | none | dice roll authoritative on host, seeded |
| Checkers | Full game | 2 (+ spectators) | none | optional move clock |
| Dominoes | Full game | 2-4 | hands, boneyard | each seat sees own tiles and others' counts |
| Backgammon | Full game | 2 (+ spectators) | none | host rolls dice, doubling cube option |
| Four in a Row | Full game | 2 (+ spectators) | none | optional move clock, rematch swaps first player |
| Memory Match | Full game (shared board, turns) and **race** (same layout, fewest moves/time) | 1-6 | face-down cards are never sent until flipped | host sends card identity only on flip |
| Blackjack | Table of players vs dealer, all act on their own hand | 1-6 | dealer hole card, deck | play-money chips |
| Poker (Texas hold'em) | Full game | 2-9 | hole cards, deck | host deals; hole cards sent only to the owner and revealed at showdown |

Cross-cutting online features, built once and shared: lobby with ready check, seat colours and names, host kicks, ready-up rematch, spectator mode with no hidden information, chat and 18 emoji reactions, "Nudge" for slow players, optional per-turn timers (off by default), disconnection grace (about 60 s, then bot takes over and the player can reclaim the seat), connection quality indicator, and a clear "host left" state with room resume.

## 3. Games: rules, gameplay design and UI/UX

Each entry gives the rules baseline (options in brackets), the bots, the table UI, game-specific UX, progression hooks and a test focus.

### 3.1 Solitaire
See `SOLITAIRE_AND_4COLORS_PLAN.md` for rules, variants (Klondike first, then Spider, FreeCell, optional Pyramid and TriPeaks), solver, and race online.
- **UI/UX:** drag and drop plus tap-to-move plus double-tap to foundation; ghost preview of where a card will land; auto-complete banner; undo/redo/hint on the bottom bar; timer and moves in the top bar; smooth cascade on win; left-handed layout; scalable card size; theme cloths.
- **Streaks:** winning streak per variant and draw mode (vs the solver "ghost" in solo challenges; online races count as friends play and not as bots).

### 3.2 4 Colors
See the other plan. Extra UX: the fan of cards scrolls and magnifies on touch, playable cards lift and glow, unplayable ones dim, a direction ring and "next player" arrow, colour picker as four large buttons, challenge dialog with plain words, big "Last card!" button that appears when you hold two cards.

### 3.3 Rummy and Gin Rummy
**Rules baseline (Rummy 500-style and Gin as two modes):**
- *Gin Rummy (2 players):* 10 cards each. Draw from stock or discard pile, then discard. Form melds (sets of 3 to 4 of a rank, runs of 3+ of a suit; Ace low only [option: high]). **Knock** when deadwood is 10 or less; **Gin** with none; the opponent may lay off cards onto the knocker's melds (not on gin); **undercut** if the opponent's deadwood is less or equal, the opponent scores. Scores: difference in deadwood; gin bonus 25; undercut bonus 25; game to 100 plus box bonuses [option]. Face cards 10, Ace 1.
- *Rummy (2 to 6 players):* 7 to 10 cards by count of players. Melds can be laid down at any turn and added to by anyone. Round ends when a player goes out; others' remaining cards are scored against them [option: Rummy 500 scoring where melded cards score for the player and the discard pile can be taken to a chosen card].
- Options: Ace high/low, 1 or 2 decks, joker wild, go-out rules (must discard to go out or not), target score.
**Bots:** easy discards by highest card; normal counts melds and near-melds (outs), avoids feeding the opponent's discard picks; hard tracks what the opponent took from the discard, computes deadwood-minimising discards and knock timing probabilities.
**UI/UX:**
- Hand sorts **automatically** into melds and deadwood; a "Sort by rank / suit / smart" toggle; drag to reorder; **meld suggestions** highlighted with coloured brackets; live deadwood counter.
- Tap a card to discard (with a "hold to confirm" for the last card when it ends the round); one-tap Knock / Gin buttons enabled only when legal, with the deadwood shown.
- Layoff phase has a clear tutorial prompt; the end-of-round reveal animates the melds and a score table explains each number.
- Draw pile and discard pile large, with the discard history fannable ("see what was discarded").
**Test focus:** meld-finder correctness (brute-force vs optimiser), deadwood minimiser, layoff and undercut, scoring tables, every end state.

### 3.4 Hearts
**Rules baseline (4 players):** 13 cards each. Pass three cards left, right, across, none (rotating, option to disable). 2 of clubs leads. Follow suit; no hearts or Queen of Spades on the first trick (unless forced); hearts cannot be led until broken. Each heart 1 point, Queen of Spades 13. **Shoot the moon:** take all hearts and the queen: others +26 [option: you -26]. Game to 100 (lowest wins). Options: Jack of Diamonds -10, three or five player variants, 8 of hearts etc.
**Bots:** easy follows suit with random legal card; normal avoids taking points, dumps the queen, passes dangerous high cards; hard counts cards, plans shoot-the-moon attempts, targets the leader when passing, plays safe low cards in the right order.
**UI/UX:**
- Pass phase has a clear 3-slot tray, dimmed hint of suggested passes, a "Pass" button enabled at exactly three.
- Legal cards lift, illegal dim with a tooltip reason ("Must follow clubs").
- Trick area with winner highlighted and cards swept to the winner; point cards visibly collected in a pile beside each player.
- Score strip with per-hand totals; a "moon attempt" banner when a player has all points so far.
- Passing of hidden cards is simultaneous online: each player picks, the host reveals after all have chosen.
**Test focus:** legality rules, moon scoring, passing rotation, deterministic trick resolution, all seeds finishing.

### 3.5 Crazy Eights
**Rules baseline:** 52-card deck [option: two decks for 5+]. 5 cards each (7 for 2 players). Match the discard's suit or rank; **8s are wild** and the player names a suit. Draw from stock if you cannot play (draw one and pass, or draw until playable [option]). Round ends when a hand is empty; scoring: 8 = 50, face cards 10, Ace 1, others face value; game to 100 or 200. Options: Queens skip, 2s draw two, Aces reverse (the "action" preset), jump-in.
**Bots:** easy random legal; normal saves 8s, picks its most-held suit; hard tracks suits opponents have failed to follow and picks the suit they lack.
**Implementation note:** built on the 4 Colors engine skeleton (hands, stock, discard, direction, pending draws) so rules are shared and tested once.
**UI/UX:** shared card table with the 4 Colors layout; suit picker for 8s; "Last card" call is a rule option (off by default).

### 3.6 Snakes and Ladders
**Rules baseline:** 100-square board, 2 to 6 players, one die; exact finish [option: bounce back]; ladders up, snakes down; roll a 6 to roll again [option]; three sixes forfeit [option]; first to 100 wins. Boards: classic, a bigger 10x10 with more snakes, "kids" (few snakes), and a seeded **random board** generator (valid, no loops, balanced difficulty).
**Bots:** no decisions exist, so "bots" just roll; the tension comes from options: optional **power squares** (extra roll, shield from a snake, swap places) in "Fun" mode with real decisions (use shield now or save it).
**UI/UX:**
- Big, tactile die (reuse Ludo dice and throw physics); token slides along the path, climbs ladders and slithers down snakes with sound.
- A rolling turn banner and a fast-forward for opponent turns; auto-roll option for kids; very large tokens; pastel colour palette; zero text needed to play.
- 3D mode: a table with a raised board, animated snakes and ladders; flat mode: SVG.
**Streaks:** wins in a row against bots (here luck-based, so streak rewards are cosmetic and tiered without extra XP bonuses).

### 3.7 Checkers (Draughts)
**Rules baseline (American/English 8x8):** 12 pieces each, dark squares, men move diagonally forward, kings both ways; capture is **mandatory** [option off], multi-jumps required to continue; reaching the far row crowns (the turn ends on crowning); win by capturing or blocking all pieces; draw by repetition or 40 moves with no capture [option]. Variants: **International (10x10, flying kings, backward captures)** and **Russian**, behind a variant picker.
**Bots:** minimax with alpha-beta and iterative deepening; easy depth 1 with random blunders, normal depth 4 to 6, hard depth 8+ with opening book and endgame tables for small piece counts, runs in a Web Worker.
**UI/UX:**
- Tap a piece: legal destinations glow, **forced captures are highlighted** and non-capturing pieces are dimmed with a reason; multi-jump paths shown as a trail.
- Undo (bots), move history, takeback offers online; coordinate labels toggle for learners.
- Smooth piece slides, capture burst, crown animation; opposing view flips for pass and play.
- Optional move clock online (blitz presets), draw offers.
**Test focus:** move generator (perft numbers against known values), forced-capture rule, repetition draw, bot always legal.

### 3.8 Dominoes
**Rules baseline (double-six, 2 to 4 players):** draw games: Draw (boneyard) and Block (no drawing) and **All Fives / Muggins** scoring (ends sum to multiples of 5 scores) as the three modes; 7 tiles each (2 players), 5 (3 to 4 players); highest double starts; play to either end; spinner rule [option]; round ends when a hand is empty or the game is blocked (lowest pip count wins the round, difference scored); game to 100 or 150. Option: double-nine set.
**Bots:** easy random legal; normal plays doubles early, keeps balanced suits; hard counts remaining tiles by suit and infers what opponents lack from passes.
**UI/UX:**
- The chain auto-layouts (snaking at the edge of the table, never off-screen), highlighted end targets, doubles crosswise, tiles draggable or tappable, zoom and pan the chain.
- Hand tiles sorted by pip count; unplayable tiles dim; a boneyard pile with a count; All Fives shows the running end-sum and score preview.
- Round-end reveal of all hands with pip totals.
**Test focus:** layout algorithm never overlaps, legality, blocked game detection, scoring modes.

### 3.9 Backgammon
**Rules baseline:** 24 points, 15 checkers each, two dice (doubles play four times), move around the board, hit blots (sent to the bar), enter from the bar before any other move, bear off when all checkers are in the home board, must use both dice when possible and the larger if only one can be played. Scoring: single, **gammon (2x)**, **backgammon (3x)**; **doubling cube** option (Crawford rule in matches); match play to 1, 3, 5, 7 points.
**Bots:** easy picks a random legal full move; normal uses a pip-count/blot-risk heuristic; hard uses 1-ply or 2-ply expectimax over dice rolls with a hand-tuned evaluation (blots, primes, anchors, race), plus cube decisions by pip-count thresholds.
**UI/UX:**
- Tap a checker: legal landing points highlight; the app **auto-sequences dice** (tap the destination and it picks which die); "Undo move" before ending the turn; "Done" auto-appears if no moves remain; forced move auto-play option.
- Dice are rolled by tap or swipe (Ludo dice), the used dice dim; pip counts shown; a **move hint** on demand; the bar and bear-off tray are large and clear; a mirrored board and left/right orientation option.
- Cube: a draggable cube, a clear offer/take/drop dialog with plain explanations.
**Test focus:** move generator against known counts, bear-off legality, both-dice rule, gammon scoring, cube state machine.

### 3.10 Four in a Row
**Rules baseline:** 7x6 grid, drop discs, connect four in a line horizontally, vertically or diagonally; draw on full board. Variants: **PopOut** (remove your bottom disc), **5-in-a-Row** (9x6), **Power-ups** (one-shot "bomb" and "double drop", Fun mode), and size options.
**Bots:** easy random with obvious-block 50%; normal minimax depth 4; hard negamax with alpha-beta, transposition table and iterative deepening to depth 10+ (the game is solved; hard plays perfectly in the standard board with the first move optimal for the starter).
**UI/UX:**
- Tap a column (or drag a disc over a column); a ghost disc previews the landing spot; discs drop with a bounce and a click; winning four pulse.
- Column hover works on desktop; large column hit areas on phones; colour-blind patterns on discs (X and O marks).
- Quick rematch with swapped first move; board themes; optional move timer for online blitz.
**Test focus:** win detection in all directions, PopOut legality, solver agreement on known positions.

### 3.11 Memory Match
**Rules baseline:** a grid of face-down pairs (4x3 up to 8x6); flip two per turn; a match keeps the cards and gives another turn (multiplayer); a miss flips them back. Themes: emoji, shapes, animals, flags, user pieces (from the Piece Maker). Modes: Solo (fewest moves/time), Turns (2 to 6 players, most pairs), **Race** (everyone on the same layout, fewest moves) and **Daily layout**.
**Bots:** easy remembers 25% of seen cards, normal 60%, hard 95% with a realistic forgetting model (memory decays over turns) so it feels fair, not perfect.
**UI/UX:**
- Cards flip in 3D (CSS/SVG or 3D mode), distinct high-contrast symbols plus colour-blind-safe sets, a calm optional "zen" mode with no timer, cards sized to fit any screen, a streak-of-matches counter, a gentle "peek" at start option for kids.
- Online turn-based shows the other player's flips live; race mode shows only progress counts.
**Test focus:** layout seeded and balanced, hidden info never sent early, bot memory model bounds.

### 3.12 Blackjack (play money)
**Rules baseline:** 1 to 8 decks (default 6), dealer stands on 17 (S17) [option H17], blackjack pays 3:2 [option 6:5 shown as a warning], double on any two cards [option: 9-11 only], double after split, split pairs (up to 4 hands, split aces get one card), insurance, surrender (late) option, push on tie. 1 to 6 players at the same table online each acting on their own hand, the dealer is the host.
**Chips:** **play money only**: a starting stack, a free daily top-up, no purchases, no cash-out, no real-money mechanics anywhere. A clear "for fun, not real gambling" line in the rules and about screen, and an age note.
**Bots:** as co-players: **basic strategy** (perfect for easy-normal-hard differs by mistakes), and an optional **strategy coach** for the player: a toggle that shows the basic-strategy move and highlights deviations, with an explanation. Hard bots at the table never "cheat" and do not know the dealer card.
**UI/UX:** chip tray with quick bets (min, last bet, max, +/-), "Repeat bet" and "Deal" in one tap; hand totals shown (soft/hard), clear Hit/Stand/Double/Split buttons with the unavailable ones hidden or labelled, card dealing animation with sound, dealer hole-card flip, bankroll chart on the stats screen, side-bets off by default.
**Test focus:** payout table, split/double/insurance edge cases, deck penetration reshuffle, basic-strategy table correctness.

### 3.13 Poker (Texas hold'em, play money)
**Rules baseline:** 2 to 9 players, blinds increase on a timer or by hands (Cash and **Sit and Go tournament** modes), no-limit [option: limit, pot-limit], hand ranking, side pots, showdown, all-in, split pots, muck. Play money only as above; **no real-money features**.
**Bots:** easy plays tight-passive with obvious mistakes; normal uses hand-strength and pot-odds rules with a mixed strategy; hard adds position awareness, simple opponent modelling (VPIP/aggression), bluff frequencies, and bet sizing relative to pot. The bots never see hidden cards.
**UI/UX:**
- Big readable hole cards with the **current hand name** under them ("Pair of Kings"), a hand-strength helper toggle for learners, bet slider with preset buttons (1/2 pot, 3/4 pot, pot, all-in), pot odds readout, fold/check/call in thumb reach, auto-fold/auto-check pre-actions, a hand-history log with replays of the last hands, showdown animation with kickers explained.
- Online: timers per action (default 30 s with a time bank), "Sit out" and "Away" states, rebuy for the tournament-free cash game with a limit, and a clear table-rules card.
**Test focus:** hand evaluator against exhaustive 7-card ranking counts, side-pot allocation with multiple all-ins, blind rotation, tournament payouts, no leaks of hole cards in the views.

## 4. Win streaks against bots (all games)

- **Per game, per bot level**: `botStreak = {current, best, shields}` in stats for each game id and level (easy/normal/hard).
- **Counts:** a win against bots increases the streak; a loss or quitting for good resets it to 0. Pass and play and online games neither add nor break it. A draw (checkers, four in a row, backgammon cannot draw) keeps the streak but does not add.
- **Shield:** one streak shield for every 10 wins; it absorbs the next loss and the result overlay says so.
- **Display:** a flame chip beside the game's "Play bots" button, a "🔥 N in a row" banner on the win overlay, "Streak ended at N" on a loss, best streak on the Profile page and home tile.
- **Rewards:** milestone bonuses at 3, 5, 10, 25 and 50, paying XP, an achievement and cosmetic unlocks; hard-bot wins count 1.5x toward milestones; luck-heavy games (Snakes and Ladders, Memory, Poker, Blackjack) give cosmetic rewards only.
- **Code:** extend `stats.ts` into a per-game per-level record, add `streak.ts` with pure functions and tests, hook into `awardGame` in `profile.ts`, and show on `HubScreen` and each menu.

## 5. Shared infrastructure to build once

1. **Game registry** (`lib/games.ts` expanded): id, name, accent, players, modes, resume link, daily support, 3D support, categories (Cards, Board, Dice, Puzzle); the hub, profile, stats, achievements and offline precache iterate over it.
2. **Card engine kit** (`lib/cards/`): seeded shuffle, decks, hands, piles, trick-taking helpers, meld finder, hand evaluators (poker), `CardFace` painter, textures, sort modes, deal and flip animations.
3. **Board kit** (`lib/boards/`): grid and track helpers, move-path animation, highlight layer, piece shapes (use the Piece Maker for custom pieces everywhere possible).
4. **Dice kit**: reuse Ludo's dice and throw physics for Backgammon, Snakes and Ladders and Dominoes (shuffle animation).
5. **Table shell**: one component for top bar, turn banner, log, chat, reactions, settings drawer, results overlay, a11y live region.
6. **Online kit**: generic host/guest over `SecureChannel` with a game supplying `Action`, `Snapshot`, `View`, `validate`, and `bot` for away players; lobby, ready check, spectators, rematch, reopen room.
7. **Progress kit**: points, XP, ranks, achievements, daily, streaks, unlocks, profile entries, all driven by the registry.
8. **Bots in workers**: heavy search (checkers, four in a row, backgammon, poker) in a Web Worker with time budgets and cancellation.
9. **Learn kit**: scripted lesson runner with test-verified steps.
10. **Test kit**: seeded simulation runner, view-leak asserter (no hidden info in a serialized view), perft helpers.

## 6. UI/UX system details

- **Layouts:** portrait phone first, landscape and tablet/desktop adaptive; the table scales with safe-area insets; thumb-zone actions at the bottom; consistent top bar.
- **Motion:** 120 to 300 ms standard transitions, a physics-feel "settle"; reduced-motion switches to fades; animation queue can be skipped by tapping.
- **Sound:** shared palette (card slide, flip, chip click, dice rattle, capture, win, lose, turn chime) in `soundDesign` with moods; per-game extras; mute and volume sliders; subtitles in the log for key sounds.
- **Haptics:** light tick on select, medium on place, double pulse on your turn, success on win.
- **Themes:** shared cloths, card backs and piece styles unlocked by level; dark and light; high-contrast; colour-blind shape sets.
- **Onboarding:** first launch of any game shows a 20-second "how it works" overlay (skippable), a Learn button, and a rules card always one tap away. Tooltips appear on illegal-move taps.
- **Empty and error states:** friendly copy, "Try again" and "Back to the games", offline badge, "needs internet" screens that suggest Nearby.
- **Performance:** lazy-load each game and its 3D chunk, no game in the shell bundle; cap particles; the FPS watchdog falls back to flat.

## 7. Prioritised roadmap

| Phase | Scope | Why |
| --- | --- | --- |
| P0 | Shared infrastructure (section 5) and **bot win streaks** for Ludo and Skip-Bo | Makes every later game cheaper; delivers the streak request immediately |
| P1 | Solitaire (Klondike) and 4 Colors | Already planned in detail |
| P2 | Crazy Eights (as 4 Colors presets/variant), Four in a Row, Snakes and Ladders, Memory Match | Quick wins that exercise online turn-based, dice and race modes |
| P3 | Checkers, Dominoes, Hearts, Rummy and Gin Rummy | Deeper engines and bots; trick-taking and meld kits |
| P4 | Backgammon, Blackjack, Poker | Highest complexity (dice+cube, payouts, side pots); play-money framework |
| P5 | Solitaire variants (Spider, FreeCell, Pyramid, TriPeaks), teams options, 3D tables for all, tournaments and leaderboards among friends |

Each game ships only when its checklist is complete: engine and tests, bots at three levels, flat table, saves and resume, progression hooks, online and nearby with view-leak tests, lesson, a11y pass, offline e2e, docs and registry entry.

## 8. Legal and safety notes (not legal advice)
- Use generic names for generic games; avoid brand names: ours are **Four in a Row** (not the branded name), **Snakes and Ladders**, and **4 Colors** with original art and wording (see the other plan).
- **Play money only** in Blackjack and Poker: no purchases, no withdrawals, no ranking by money won tied to rewards that cost money; clear "not real gambling" copy and an age note; review local rules before any store release.
- No chat moderation gaps: chat messages are sanitised and rate-limited (existing); add block/mute and a "hide chat" setting before wider launch.

## 9. Open questions
1. Which phase order do you want, or should P0 and P1 come first as shown?
2. Are play-money Blackjack and Poker acceptable for the audience and the stores you target?
3. Do you want asynchronous (play-by-turn over days) online play for slow games like Checkers, or live-only?
4. Should custom pieces from the Piece Maker be usable in Checkers, Four in a Row and Memory?
5. Anything to drop from the list, or add (e.g. Chess, Spades, Euchre, Mahjong solitaire)?
