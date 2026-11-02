# Snakes and Ladders: the best board, and the most interesting games

Goal: make Snakes and Ladders feel as good as Ludo and Skip-Bo (see `UX_ASSESSMENT.md` and `GAMES_EXPANSION_PLAN.md` for the bar), and turn a pure-luck game into one with real moments, choices and replay value, without losing what a child or grandparent expects from it.

## 0. Where it stands today
- Engine (`lib/games/snakes/`): square grid, random or classic 100-square jumps, 1 to 3 dice, getting on, bonus rolls, exact finish, bump, chains. All rules editable. Bots just roll.
- Board (`components/games/snakes/module.tsx`): flat 2D SVG. Squares are two flat yellows, ladders are two lines with rungs, snakes are a green curve with two dots. Tokens are coloured circles.
- **Done this round:** tokens now hop square by square (hop sound per square, a little arc, speed setting respected), glide up ladders and slide down snakes, and bumped tokens fly back. The roll event now carries the path (`land`, `slides`).
- Gaps: the board is plain; luck is the only decision (none); no way to share or create boards; no 3D; no lesson; no themes; layouts are not checked for fairness; the flat board is small on tablets.

## 1. Principles
1. **Readable first.** A child must see at a glance where a ladder or snake starts and ends, whose turn it is, and what the roll did. Art never hides numbers.
2. **Fair by construction.** Every generated board is simulated before it is offered (section 3).
3. **Choices without losing the charm.** Optional "Strategy" features add decisions; the default stays classic.
4. **One look with Ludo and Skip-Bo.** Same top bar, banner, dice, results overlay, XP, sounds, settings drawer and 2D/3D switch.
5. **Everything is a rule.** New features are switches with presets, like the rest of the platform.

## 2. Board art and rendering (the biggest visible win)
**Themes** (a theme is colours, a pattern, jump art, token art and a sound set; all are data, so more can be added cheaply):
| Theme | Squares | Ladders | Snakes | Extras |
|---|---|---|---|---|
| Classic | parchment, coloured number tiles | wooden ladders with rails and rungs | striped snakes with eyes and tongue | the board people remember |
| Jungle | leafy tiles, vines | rope bridges | pythons | monkeys and parrots as idle animations |
| Space | star-field, planet tiles | beam lifts | black holes (slide) | comets, UFO as a token |
| Volcano | basalt and lava | stone stairs | lava slides | rising lava glow |
| Candy | pastel sweets | candy canes | licorice slides | sparkle on a win |
| Night | dark with neon outlines (high contrast option) | neon rails | neon ribbons | calm and low power |
Each theme must pass contrast checks and a colour-blind check (jump direction is also shown by an arrow glyph and shape, never colour alone).

**Board drawing:**
- Real-looking tiles: bevel, soft shadow, rounded frame, a snaking number path (boustrophedon) with a faint arrow trail so the order is obvious.
- Ladders drawn with perspective: two rails, rungs spaced evenly, feet and top shadows; length varies with the climb. Snakes drawn as a smooth tapered body along a curve (cubic Bezier through two control points so snakes never cross other snakes where avoidable), pattern along the body, head with eyes at the start square, tail at the end square. Head and tail squares get a coloured ring and a small up or down arrow.
- Tap or hover a ladder or snake: it lights up and shows "from 28 to 84 (+56)" so the effect is clear before you land on it.
- Start area drawn as a base where waiting tokens stand; finish square is a flag, castle or portal by theme.
- Token art by theme (pawns, animals, rockets) with a number or shape mark for colour-blind players, and a soft shadow. Several tokens on one square fan out without overlapping.
- Responsive: board fills the width on phones, is centred and larger on tablets and desktops, and in landscape moves the dice and status beside the board (Ludo's fix for the cut-off Roll button, UX finding U1).
- Performance: one static SVG for the board; only tokens and the active jump animate; no per-frame React renders (the walk uses CSS transitions and the Web Animations API).

**3D board (second step):** a tilted wooden board with real ladders and snakes, tokens that hop, camera that follows the mover, same `Table3D` pattern as Skip-Bo with automatic fall-back to 2D. Ladders are climbed (tokens walk the rungs), snakes are slid down.

## 3. Interesting, fair boards (the generator)
Today the random board is a placement of jumps with a minimum length. Replace it with a **seeded, validated generator** (`lib/games/snakes/boards.ts`):
- **Constraints:** no jump starts on square 1 or ends on the last square; no two jumps share a start or end; ladders go up and snakes go down by at least the minimum; spread jumps across the board in bands (not all in one row); limit snake and ladder crossings; keep the last ten squares from being a wall of snakes; optional "no chains".
- **Simulation gate:** run a few thousand bot games with the board and the chosen rules. Accept only boards where the average game length is in a target window (for example 25 to 45 rolls per player on 100 squares, one die), the first seat's win rate is within about 3 percentage points of fair, and the longest games are not extreme. Reject and retry with the next seed. The result is a **board report** the host can read: length, win spread, hardest snake, best ladder.
- **Difficulty presets:** Gentle (more ladders), Balanced, Wild (long snakes), Marathon (more squares), Sprint (6 by 6, or half the squares).
- **Seeds and codes:** every board has a short code (rules plus seed). Share it by link, QR or text; friends get the same board. "Board of the day" gives everyone the same board, with a friends leaderboard on fewest rolls (solo race, see 6).
- **Classic boards:** keep the traditional Indian Moksha Patam style board and the well-known Western 100-square layout as named boards.

## 4. Gameplay layers (all optional switches with presets)
Pure luck stays the default. These make games interesting; each ships behind a rule so the family game is unchanged.

**Strategy options (choices, not just dice):**
1. **Choose a die.** Roll two dice; pick which one to use (or the sum), the other waits for next turn. A real decision each turn with no extra rules text.
2. **Split a move.** With two tokens each, move either.
3. **Power cards** (one drawn every few rolls, or collected on gold squares): Shield (ignore the next snake), Boost (+3), Swap places with someone, Reroll, Reverse a ladder (use it only downwards to dodge), Freeze (a rival skips one turn). Hand limit 2, played before rolling. Cards are public or hidden by a rule.
4. **Pick your risk:** before rolling, choose Safe (one die) or Risky (two dice, both snakes and ladders hurt or help more). Bots use the same rule.

**Special squares** (shown with clear icons, listed in the rules panel): Bonus (roll again), Skip, Safe (cannot be bumped), Warp (a pair of portals), Chest (draw a power card), Trap (miss a turn unless you roll a 5 or 6), Mirror (move back by what you rolled). Counts and placement are rules and the generator keeps them balanced.

**Modes:**
- **Classic** (default), **Race to two** (play on for second place, already supported), **Teams** (2 v 2, either teammate's token counts; shared score), **Last one home loses**, **Quick** (half the board), **Co-op** (everyone beats a "snake-master" bot that moves snakes each round), **Solo challenge** (reach the end in at most N rolls with power cards).
- **Handicap for mixed ages:** adults need exact finish while children do not, or children get a free reroll per game. A single "Friendly" preset.

**Bots with personality:** careful (uses shields early), reckless (risky mode), mischievous (freezes the leader). They have no luck advantage; their dice come from the same seeded stream as everyone's.

## 5. UX and delight
- **Turn flow:** roll button changes to "Your turn: tap to roll", big dice with a short tumble (reuse Ludo's dice), the walk plays, then a one-line result banner ("Rolled 5: up the ladder to 84!").
- **Jump moments:** ladder: the token climbs with a rising chime and sparkle; snake: it slides with the squeal and a "wobble"; longest slide of the game gets a "Ouch!" reaction. Haptics on each.
- **Foresight (opt-in "Show where I will land" in Settings):** after the dice, a ghost token shows the landing and any jump before the walk starts, which turns waiting into anticipation.
- **Camera and focus:** in 3D follow the mover; in 2D scroll or zoom to the mover on small screens for 12 by 12 boards, and dim the rest.
- **Catch-up feel:** a progress bar per player along the edge and a "leader" crown; the last place token gets a gentle encouragement line.
- **Win moment:** confetti, fanfare, a replay strip of the winner's path ("your 18 rolls") and the biggest swings, then rematch with swapped start order.
- **Sound:** a per-step hop pitch that rises as you near the end; snake hiss, ladder creak, special-square stings; per-theme music beds with the existing music setting.
- **Accessibility:** every square and jump has an accessible name ("Square 28: ladder up to 84"); the status line announces every roll and result; keyboard rolls with Space; large-tile and high-contrast board options; reduced motion jumps tokens directly and keeps the sound; 44 px targets for all buttons.
- **Learn to play:** a 6-step guided lesson on a small board (roll, walk, climb, slide, bonus roll, finish), like Skip-Bo's.
- **Pass and play:** no hidden information, so no cover screen; a "your turn" banner names the player.

## 6. Online, nearby, social
- **Online and nearby** already work through the platform; keep each roll authoritative on the host's seeded stream, and send the path details in the event so every screen walks identically.
- **Spectators** see the same walk. **Chat and reactions** (including "Ouch" and "Nice") reuse the platform.
- **Race mode:** everyone plays the same seeded rolls solo and compares total rolls (a luck-free, asynchronous way to play with a friend who is offline). Daily board uses this.
- **Stats:** longest climb, biggest slide, luckiest and unluckiest game, streaks, in the profile.

## 7. Technical plan
| Area | Work |
|---|---|
| Engine | `boards.ts` generator and validator; special squares and cards as pure reducers; extra event fields (`land`, `slides` done; add `cards`, `special`). Rules stay in `SCHEMA` with presets. Save/resume handles new state. |
| Simulation | `lib/games/snakes/report.ts`: simulate N games, compute length and fairness stats; used by the generator, by tests and by the board report UI. |
| Rendering | Theme objects (`themes.ts`), `BoardArt` (tiles, jumps, tokens) separated from game logic, shared by 2D and 3D; a `useWalk` hook (queue, speed setting, reduced motion) extracted from the table so other race games can reuse it. |
| 3D | `SnakesScene.ts` following `SkipBoScene.ts`; model-free first (extruded boards, tube snakes, box ladders), GLB later. |
| Tests | Unit: generator constraints (property tests over many seeds), fairness window, every special square and card, parse validation. Sim: bots finish all rule combinations. Browser: walk visits each square in order, ladder climb and snake slide end where the event says, resume mid-walk, reduced motion, landscape layout, board share code round-trip. Axe audit and screenshots at six viewports. |
| Docs | Update `PLATFORM.md` and the in-app How to play. |

## 8. Phases
Status: phases 1 to 3 and the choose-a-die and special-square parts of phase 4 are built (themes Classic, Jungle, Night; seeded generator with simulation and crossing avoidance; board numbers; board report; choose a die; bonus, trap, safe and portal squares; presets Strategy, Adventure, Sprint). Still to do: power cards, risk picker, teams, co-op, race mode and daily board, guided lesson, stats, 3D board, more themes. A rules fix shipped too: with several dice and an exact finish, a token one square short could never finish.
1. **Steps and polish (done, plus a day):** hopping tokens, shadows, per-square sound, bonus and bump handling. Add the shadow and arc art, the result banner and a11y names for squares and jumps.
2. **Art pass:** tile bevels, new ladder and snake drawing, themes (Classic, Jungle, Night), token art, responsive and landscape layout, tap-a-jump info.
3. **Generator and board report:** constraints, simulation gate, difficulty presets, board codes and share link, board of the day.
4. **Choices:** choose-a-die, risk picker, then power cards and special squares with presets and bot support.
5. **Modes and lesson:** teams, co-op, solo challenge, race mode, guided lesson, stats.
6. **3D board** with camera follow and the ladder-walk and snake-slide animations.
7. **Polish and audit:** sound design per theme, performance on low-end phones, accessibility audit and real-device and screen-reader testing.

## 9. Definition of done for each phase
Typecheck, lint and all unit tests pass; the browser suite passes on a fresh build; bots finish every rule combination; screenshots reviewed at 360 by 640, 390 by 844, landscape and desktop; no new axe violations; the default (classic) game is unchanged unless the player turns something on.

## 10. Decisions needed from you
- Which themes first (suggestion: Classic, Jungle, Night)?
- Do you want the strategy layer (choose a die, power cards) on by default for adults, or kept as presets ("Strategy", "Family")?
- 3D board before or after the generator and modes?
