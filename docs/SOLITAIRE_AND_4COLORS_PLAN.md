# Plan: Solitaire and 4 Colors

Two new games for the Ludo Sync hub, built to the same depth as Ludo and Skip-Bo: pure engine, bots, saves, points/XP/achievements/daily, flat and 3D tables, online + nearby + pass-and-play (where it makes sense), lessons, accessibility, offline, tests.

Rules research notes: no governing body publishes an "official" Klondike rulebook; sources agree on the core and differ on recycle limits and scoring, so every difference becomes a **rule option** (as Ludo's tuning does). For 4 Colors the commonly published card-matching rules (colour/number matching, Skip, Reverse, Draw Two, Wild, Wild Draw Four, challenge, 500-point scoring) are the baseline; house rules (stacking, jump-in, seven-zero) are toggles, off by default.

## 0. Decisions made up front

| Topic | Decision |
| --- | --- |
| Names | **Solitaire** (route `/solitaire`) and **4 Colors** (route `/fourcolors`). |
| 4 Colors IP | Game mechanics are free to use, but the well-known commercial game's name, logo, card layout, typeface and artwork are protected. 4 Colors uses its own name, its own card art (CSS/SVG/canvas, shapes on every card), its own card names and no "call the brand name" shout: the warning call is **"Last card!"**. Not legal advice; do a trademark check before any store release. |
| Hidden info | 4 Colors reuses the Skip-Bo pattern: the host is authoritative and sends each guest a `TableView` with only their own hand. |
| Solitaire online | There is no opponent hand, so online means **race**: everyone plays the same seeded deal, live progress is shown, first to clear (or best score at the time limit) wins. |
| Shared code | Extract what Skip-Bo already has into `lib/cards/` (seeded shuffle, deck helpers, `CardFace` painting, card-back/cloth unlocks, `useTableInput` ideas) before building on it, not copy it. |

## 1. Solitaire: rules specification

### 1.1 Klondike (the core game, ships first)
- 52-card deck, seeded shuffle. Tableau of 7 piles (1 to 7 cards, top card face up), 24-card stock, empty waste, 4 foundations.
- **Foundations:** build up by suit, Ace to King.
- **Tableau:** build down in alternating colours; only a King (or a King-led sequence) may fill an empty pile; any face-up run in correct sequence moves as a unit; a face-down card turns up when exposed.
- **Stock and waste:** *Draw 1* or *Draw 3* (option). In draw 3 only the top waste card is playable. When the stock is empty the waste is turned back over (a "pass").
- **Pass limit (option):** unlimited, 3 passes, or 1 pass.
- **Scoring (option):**
  - Standard: waste to tableau +5, waste/tableau to foundation +10, turned-up card +5, foundation back to tableau -15, each recycle in draw 1 beyond the first -100 (draw 3: after the third pass).
  - Vegas: start at -52, +5 per card to a foundation, pass limit forced (1 pass draw 1, 3 passes draw 3), cumulative bankroll across games kept on this device.
  - None: moves and time only.
- **Win:** all 52 on foundations. **Stuck:** no legal move left and no pass left: the game reports it and offers undo, hint or new deal.
- **Options:** timer on/off, auto-move to foundations (off / safe only / always), auto-complete when every card is face up, left-handed layout, winnable-deals-only.

### 1.2 Quality-of-life that players expect
- Unlimited **undo/redo** (counts in the score option where Vegas forbids it), **hint** (next best move, never gives away more than the move), move counter, timer, **new deal / restart this deal / replay deal by number** (seed shown, shareable).
- **Winnable deals**: the engine includes a solver (depth-limited DFS with transposition table). "Winnable only" regenerates seeds until the solver finds a win within a node budget; hints use the same solver. Solver runs in a Web Worker so the UI never stalls.
- Drag and drop, tap-to-move, double-tap to foundation, tap a source then a target, keyboard play, screen reader announcements.

### 1.3 Variants (phase 2, same engine interface)
| Variant | Key rules | Notes |
| --- | --- | --- |
| Spider (1, 2 or 4 suits) | 104 cards, 10 tableau piles, build down regardless of suit, move only same-suit runs, deal a row from stock to all piles (no empty piles), a K-to-A run of one suit is removed | difficulty = suit count |
| FreeCell | 8 tableau piles all face up, 4 free cells, 4 foundations, move runs limited by free cells and empty columns ((cells+1) x 2^empty) | every deal solvable except 11982 of the Microsoft numbering; ours are solver-checked |
| Pyramid | 28-card pyramid, remove pairs totalling 13, Kings alone | standard and scored |
| TriPeaks | three peaks, stock/waste, play one rank up or down | streak scoring |

Ship Klondike, Spider and FreeCell first; Pyramid and TriPeaks are optional stretch. The engine is a `SolitaireVariant` interface (`deal`, `legalMoves`, `apply`, `isWon`, `score`, `autoMoves`) so a variant never touches UI code.

### 1.4 Ways to play (parity with Skip-Bo)
| Mode | How it works |
| --- | --- |
| Solo | Pick variant and options, resume later (autosaved every move). |
| Daily deal | One shared seeded deal per day for everyone, with a streak and a result that can be copied as text. Works offline. |
| Challenges | Weekly twists (e.g. "win draw 3 in under 5 minutes", "no undo", "Vegas with a single pass"). |
| Online race | Room code, link or QR as with Ludo. Same deal for all; live progress bars; first win or highest score at the limit wins. Host authoritative and validates each reported move by replaying it through the engine, so progress can't be faked. |
| Nearby race | Same, with the no-internet note-passing pairing. |
| Pass and play | Take-turns on one device: same deal, each player plays a full game in turn, scores compared (cover screen between turns). |

No bots for solitaire proper; the **solver acts as a "ghost"** you can race in solo mode ("beat the solver's move count").

### 1.5 Engine design (`lib/solitaire/`)
- `types.ts`: `Card {id, suit, rank}`, `GameState` per variant, `Move` (from, to, count), `Event` (turned, moved, scored, recycled, won).
- `engine.ts`: `applyMove(state, move) -> {state, events}` pure, undo via a move log (state is reconstructible from seed + moves, which also makes saves, replays and online validation tiny).
- `deal.ts`: seeded shuffle shared with Skip-Bo.
- `solver.ts`, `solver.worker.ts`, `hint.ts`.
- `score.ts` (standard, Vegas, none), `validate.ts` (saves and network input), `save.ts`, `stats.ts`, `daily.ts`, `achievements.ts`, `lesson.ts`, `describe.ts`.
- `net/`: `protocol.ts`, `host.ts`, `guest.ts` for races.

## 2. 4 Colors: rules specification

### 2.1 Deck (108 cards)
For each of four colours (red, yellow, green, blue): one 0, two each of 1 to 9 (19 cards), two each of **Skip**, **Reverse**, **Draw Two** (6 cards) = 25 per colour = 100. Plus four **Wild** and four **Wild Draw Four** = 108. (Colour-blind mode adds a distinct shape per colour on every card; number cards also show a corner symbol.)

### 2.2 Round
- 2 to 10 players. Deal 7 each (option: 5 to 10). Turn one card face up to start the discard pile: a number card is simply the start; Skip skips the first player, Reverse starts play the other way, Draw Two makes the first player draw two and lose the turn, Wild lets the first player pick the colour, a Wild Draw Four is returned to the deck and another is drawn.
- Play goes clockwise; on your turn you must play a card matching the **colour, number or symbol** of the top card, or a Wild. If you cannot, draw one card; if it is playable you may play it, otherwise the turn passes (option: draw until playable).
- **Skip:** next player loses the turn. **Reverse:** direction flips (with two players it acts as a Skip). **Draw Two:** next player draws two and loses the turn. **Wild:** play any time, choose the colour. **Wild Draw Four:** choose the colour, next player draws four and loses the turn; legal **only when you hold no card of the current colour** (matching number/symbol cards do not count against you, per the common rule).
- **Challenge:** the player who would draw four may challenge. The player of the Wild Draw Four shows their hand to the challenger only: if they held a card of the current colour they draw four instead and the challenger draws none; if the play was legal the challenger draws six (four plus two) and loses the turn.
- **Last card:** when you drop to one card you must call **"Last card!"** before the next player starts their turn. If you are caught by another player first (or the host's bot logic in a bot game) you draw two. Calling is a button; bots call with a human-like delay and sometimes forget on easy.
- **Round end:** the first player to play their last card wins the round. If it was Draw Two or Wild Draw Four, the next player still draws the cards first. Draw pile empty: reshuffle the discard pile (except the top card).
- **Scoring:** winner collects the value of every card left in the others' hands: numbers face value, Skip/Reverse/Draw Two 20, Wild/Wild Draw Four 50. First to 500 wins the match (option: 200, 300, 1000, or single round). Option: winner-takes-round only.

### 2.3 Rule options (all in a `Rules` object with presets, like Ludo's tuning)
| Option | Default |
| --- | --- |
| Starting hand size | 7 |
| Stacking Draw Two on Draw Two (and Wild Draw Four on Wild Draw Four) | off |
| Jump-in with an identical card out of turn | off |
| Seven-zero (play a 7: swap hands; play a 0: pass all hands) | off |
| Draw until playable | off |
| Must play a drawn playable card | off |
| Wild Draw Four restriction and challenge | on |
| Forced "Last card!" call and penalty | on (2 cards) |
| Teams (2 v 2, partner's hand counts) | off, phase 3 |
| Match target score | 500 |
| Bot level, bot count | normal, 1 to 9 |

Presets: Classic, Quick (single round, 5 cards), Chaos (stacking, jump-in, seven-zero), Family (no challenge, draw until playable).

### 2.4 Bots (`bot.ts`)
- **Easy:** plays a random legal card, often forgets "Last card!", picks the colour at random.
- **Normal:** prefers action cards when the next player is low on cards, keeps Wilds late, picks the colour it holds most.
- **Hard:** counts cards played (colours and numbers), infers opponents' missing colours from their draws, saves Wild Draw Four for the end or for the player about to win, challenges when the numbers say the player probably had the colour, avoids setting up an opponent with one card.
- Bot styles as in Skip-Bo (balanced, aggressive, defensive).

### 2.5 Engine design (`lib/fourcolors/`)
- `types.ts`, `engine.ts` (`applyAction(state, action) -> {state, events}`; actions: `play`, `draw`, `pass`, `chooseColour`, `challenge`, `acceptDraw`, `callLast`, `catchLast`, `jumpIn`, `swapWith`), `deck.ts`, `rules.ts`, `bot.ts`, `view.ts` (what a seat may see: own hand, counts for everyone else, discard top, direction, pending draw penalty), `describe.ts`, `validate.ts`, `save.ts`, `stats.ts`, `achievements.ts`, `daily.ts`, `lesson.ts`, `net/`.
- Every ambiguous rule is covered by a named unit test (two-player Reverse, Wild Draw Four challenge both ways, last card as Draw Two, starting card effects, empty draw pile, jump-in against a pending penalty, stacking chains).

## 3. Parity checklist with Skip-Bo and Ludo

Every row is a deliverable for both games unless noted.

| Area | Solitaire | 4 Colors |
| --- | --- | --- |
| Pure engine, seeded RNG, events | yes | yes |
| Validation of saves and network input | yes | yes |
| Bots, 3 levels, styles | solver ghost and hints | yes |
| Save every move, "Resume game" in menu | yes | yes |
| Local stats, XP and levels (`profile.ts`) | yes | yes |
| Points, lifetime points, ranks (`lifetime`, `best`, `rankFor`) | yes | yes |
| Achievements (`achievements.ts`) | yes | yes |
| Daily challenge, same seed for everyone | daily deal and streak | daily twist rule set |
| Unlocks (card backs, cloths) shared with Skip-Bo | yes, plus new ones | yes, plus new ones |
| Flat table (SVG/CSS cards) | yes | yes |
| 3D table (Three.js, same renderer setting and quality tiers, falls back to flat) | yes | yes |
| Pass and play with cover screen | turns on one deal | hands hidden between turns |
| Online rooms (code, link, QR), reconnect, spectators, rejoin, reopen room | race | full game |
| Nearby play (no internet) | race | full game |
| Chat and emoji reactions | yes | yes |
| Learn to play (`/<game>/learn`, scripted steps each verified by a test) | 7 steps | 8 steps |
| Sound, music, haptics, `soundDesign` moods | card sounds, win fanfare | card sounds, colour chime, "Last card!" sting |
| Accessibility: shapes for colour, large cards, live region for the last move, landmarks, headings, keyboard play, reduced motion | yes | yes |
| Offline: pages, scripts and models precached by the service worker; offline badge; e2e with network off | yes | yes |
| Hub entry in `lib/games.ts`, home chip, resume link | yes | yes |
| Docs: `docs/SOLITAIRE.md`, `docs/FOURCOLORS.md`, README table | yes | yes |
| Tests: unit, seeded simulations, e2e smoke | yes | yes |

## 4. Shared groundwork (do first)
1. `lib/cards/`: seeded shuffle and deck helpers, generic `CardFace` painter and canvas texture cache (`cardTextures.ts`), card back/cloth unlock lookups, a game-agnostic `useTableInput` base (picked card, hints, banners, sounds).
2. Make `profile.ts`, `achievements`, `daily`, `stats` and the Profile page **game-registry driven** so adding a game is data, not edits across files (today Ludo and Skip-Bo are special-cased).
3. Generalise `SecureChannel` pairing and the host/guest protocol skeleton so a game supplies only its `Action`, `Snapshot` and `View` types.
4. Extend `lib/games.ts` (`GameInfo`) with `accent`, `resumeHref`, `modes`; add the two entries; update service worker precache list and `e2e/offline.spec.ts` to open the new routes.
5. Regression: Skip-Bo tests must pass untouched after the extraction.

## 5. Milestones

| # | Milestone | Exit criteria |
| --- | --- | --- |
| M0 | Groundwork (section 4) | Skip-Bo unchanged and green; registry in place. |
| M1 | Klondike engine + solver | All rules and scoring modes tested; 1,000 seeded games simulated without invalid states; solver verified against known-winnable deals; undo/redo property test (apply n moves, undo n, state equals start). |
| M2 | Klondike flat table | Drag and tap play, auto-move, hints, undo, timer, options screen, autosave/resume, sounds, a11y. |
| M3 | 4 Colors engine + bots | All rule tests in 2.5; 10,000 seeded bot-vs-bot rounds always terminate with correct scores; bots measurably ordered hard > normal > easy over 1,000 games. |
| M4 | 4 Colors flat table | Fan of cards, colour picker, challenge dialog, "Last card!" button and catch, direction indicator, pass-and-play cover screen, autosave. |
| M5 | Progression for both | Points, XP, lifetime ranks, achievements, daily, unlocks and Profile page entries. |
| M6 | Online and nearby | 4 Colors host-authoritative rooms with `TableView` (never leaks other hands or the draw pile, covered by a view test); Solitaire race rooms with replay validation; reconnect, spectators, quit-replaced-by-bot, reopen room; nearby for both. Two-browser e2e. |
| M7 | 3D tables | Felt table and cards for both, fan hand, flying cards, orbit/zoom, quality tiers and fall-back to flat. |
| M8 | Lessons and polish | Learn pages with test-verified steps, sound design, haptics, animations (card deal, flip, win cascade), reduced-motion variants. |
| M9 | Variants | Spider and FreeCell on the variant interface, each with its own tests and daily; Pyramid and TriPeaks if time. 4 Colors teams option. |
| M10 | Ship | `npm run verify` and `npm run e2e` green, offline e2e with network off for both, docs, README, hub tiles, bundle-size check (new games lazy-loaded; 3D chunks not in the shell). |

## 6. Risks and answers
- **Solver cost:** budget nodes, run in a worker, cache per seed, never block input.
- **Rule disputes:** every contested rule is an option with a named default and shown in the setup screen and How to play.
- **Hidden information leaks (4 Colors online):** view builder is the only path to guests; a test asserts the serialized view contains no other hand or draw-pile order.
- **Cheating in solitaire races:** host replays reported moves; the client is never trusted for score.
- **Bundle growth and offline size:** lazy-load each game; add routes to the precache list; measure.
- **Trademark/trade dress (4 Colors):** original name, art and wording as decided in section 0.
- **Mobile drag UX:** pointer events with a tap-to-move fallback, large hit targets, tested at phone width in e2e.

## 7. Open questions for you
1. Solitaire scope for the first release: Klondike only, or Klondike + Spider + FreeCell?
2. 4 Colors: confirm defaults (7 cards, no stacking, challenge on, 500 points) and whether the Chaos preset should be on the menu.
3. Should solitaire online be a **race** (as planned) or do you want a co-op/shared-table idea instead?
4. Do you want the shared-code groundwork (section 4) done first, even though it delays visible features, or the games built in place and refactored later?
5. 3D tables: required for the first release of each game, or after?

Sources consulted: [Solitaire rules and scoring guide](https://solitaire-royale.pages.dev/articles/solitaire-rules-and-scoring), [Vegas solitaire rules and scoring](https://solitaire.com/blog/vegas-solitaire-rules-scoring/), [Klondike draw 1 vs draw 3](https://classicklondikesolitaire.com/faq/what-is-the-difference-between-turn-1-and-turn-3-solitaire), [Official-style UNO rules summary](https://officialgamerules.org/game-rules/uno/), [Mattel Let's Play UNO rules page](https://prod-letsplayuno.mattel163.com/support/rules.html). Several are secondary sources that disagree on details, which is why those details are options.
