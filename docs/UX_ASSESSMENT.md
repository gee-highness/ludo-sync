# Ludo Sync: UI/UX assessment

Date: 2026-10-24. Build assessed: `main` plus the city-graphics removal, commit following `251d7fa`.

## How this was done

| Method | What it covered |
|---|---|
| Automated accessibility audit (axe-core 4, WCAG 2.0/2.1 A and AA plus best-practice rules) | 9 views: menu, setup, game (flat and 3D), winner screen, piece maker, online entry, settings drawer, how-to-play dialog, all at 390 px wide |
| Screenshots at 6 viewports | 360x640, 390x844, 844x390 (phone landscape), 768x1024, 1366x768, 1920x1080 |
| Measurement | Touch-target sizes of every visible control, horizontal and vertical scroll, board size per viewport |
| Keyboard walk | 24 consecutive Tab presses on the game screen, checking for a visible focus indicator |
| Emulation | `prefers-reduced-motion`, and a 195 px wide viewport (about 200% zoom) |
| Performance profiling | Long bot-only games watching page size, animations and frame rate (this found and fixed a particle leak) |
| Heuristic review | Reading every screen against Nielsen's heuristics and the needs of each audience below |

**What this does not cover.** I did not use a real screen reader (VoiceOver, TalkBack, NVDA), real phones, or real people. Automated tools find roughly a third of accessibility problems; the rest needs people. Treat the ratings below as informed estimates, not certification. Online play and chat were assessed from code and the in-memory tests only, because the pairing service is not reachable from the build environment.

## Scorecard by audience

| Audience | Rating | One-line reason |
|---|---|---|
| Casual player on a phone in portrait | Good | Board fills the width, controls are reachable, points and bonus feedback are clear |
| Phone in landscape | **Needs work** | The Roll button is pushed below the visible area (see U1) |
| First-time player | **Needs work** | Setup is a 20-control scroll with Start at the bottom; the rules explanation is a text modal |
| Tablet and desktop | Good | Side panel layout works; board scales well up to 908 px |
| Keyboard-only | Good | Every control is reachable, Space/Enter rolls, focus is visible; some structure gaps |
| Screen-reader | Fair | Tokens, dice, log and status are labelled and announced; page landmarks and a few list/tab roles are wrong |
| Colour-blind | Fair | A symbols option and custom piece shapes exist, but symbols are off by default and hard to find |
| Low vision / zoom | Fair | No horizontal scroll at 200%; dark theme only, no high-contrast mode |
| Motor impairment / touch | Fair | Header buttons are 40x40 px; a single tap commits a move |
| Cognitive / children / older adults | Fair | Friendly core game; jargon and long rule screens |
| Reduced motion / vestibular | Good | Zero infinite animations under `prefers-reduced-motion` |
| Low-end devices / offline | Good | Offline PWA, 2D fallback, leak fixed; software-rendered test machine still ran slowly |
| Online and social | Fair | Chat and reactions exist; no mute, report or per-room chat switch |
| Non-English speakers | Needs work | English only, strings hard-coded |

## Strengths worth keeping

- **Game feedback is strong.** The status line is a live region; every token has a spoken label such as "Red token 2, on the board, can move 2"; the log is announced; bonus rolls now say why; points show on every card.
- **Reduced motion is respected.** With the OS setting on, the game runs zero looping animations.
- **Resilient.** Works offline, saves every move, resumes, falls back from 3D to flat on slow devices.
- **Keyboard play works end to end.** 21 tab stops on the game screen, visible focus on every real control, Space or Enter rolls.
- **Layout holds.** No horizontal scrolling on any tested viewport, and none at about 200% zoom on the menu.
- **Customisation is unusually deep** (rules, presets, piece maker), and the piece maker already helps colour-blind players because shape and pattern are independent of colour.

## Findings

Severity: **High** blocks or seriously slows a group of users; **Medium** causes friction or fails a standard; **Low** polish.

### Usability

**U1. Landscape phone: the Roll button is off screen. High.**
At 844x390 the right panel stacks four tall player cards, and the dice sit below the fold, so you must scroll the panel to take your turn. Landscape is a common way to hold a phone for a board game.
*Fix:* in short landscape viewports, put the dice and status in a fixed bar above or beside the board, and lay the player cards out as a compact 2x2 or one-line strip. Estimated effort: small.

**U2. Setup is a long scroll and Start is at the bottom. High for first-timers.**
On a phone the setup page is about 1,480 px tall: four seat rows, then 7 presets, 7 rule switches and 5 fine-tuning controls (more with Tycoon on) before the Start button. A first-time player just wants to play.
*Fix:* a sticky Start button; collapse "Rules" behind a "Customise rules" disclosure that shows a one-line summary ("Classic rules"); keep presets visible, hide fine tuning until asked. Estimated effort: small to medium.

**U3. The player-type dropdown is clipped on phones. Medium.**
"Person" shows as "Per" in the seat rows at 390 px.
*Fix:* give the select a minimum width, or use a segmented control (Person / Bot / Empty). Small.

**U4. The "Me's turn" banner covers the middle of the board. Medium.**
Every turn a pill appears over the centre for about 1.6 seconds, hiding tokens near home on small boards, and it repeats for every bot turn. It also reads awkwardly ("Me's turn").
*Fix:* move turn information to the status line and the highlighted player card only (they already show it), or shrink the banner and show it only when it is your turn. Small.

**U5. The piece maker preview scrolls away on phones. Medium.**
You change a setting several screens below the preview and cannot see the effect.
*Fix:* pin a compact preview (one 2D and one 3D thumbnail) to the top while editing. Small to medium.

**U6. A single tap commits a move. Medium.**
When only one move is possible the tap moves immediately; with several moves a choice appears. There is no undo and no confirm option. For players with tremor, young children, and anyone tapping through quickly, a mis-tap is permanent.
*Fix:* an optional "Confirm moves" setting (tap a token, see the destination, tap again or press a Go button). Medium.

**U7. First-time learning relies on a text modal. Medium.**
How to play is accurate and complete, but it is a wall of text with terms like "blockade" and "Tycoon". There is no first-run walkthrough and the rule switches in setup explain themselves only in small grey text.
*Fix:* a three-step first-game coach (roll, tap a glowing token, get home), small illustrations in How to play, and tooltips on rule switches. Medium.

**U8. Online entry screen is sparse and unexplained. Low to Medium.**
The name field has no placeholder or example, the disabled Join button looks almost as active as the enabled one, and the "check digits" shown after pairing are not explained anywhere (they exist to detect interception, but nobody will know to compare them).
*Fix:* placeholder text, a clearer disabled style, and one sentence under the check digits: "Both screens should show the same six digits." Small.

**U9. Setup and menu offer no sense of what each mode is. Low.**
"Pass and play", "Play vs bots", "Tycoon" are named but not described.
*Fix:* one-line subtitles on menu buttons and a short blurb under each preset (already present as tooltips; surface them). Small.

### Accessibility (measured)

**A1. No `<main>` landmark and no `<h1>` on any page. Medium (axe: landmark-one-main, page-has-heading-one, region).**
Screen-reader users cannot jump to the main content or find the page title; 1 to 8 pieces of content per page sit outside any landmark.
*Fix:* wrap each page in `<main>`, make the title ("Ludo Sync", "Play vs bots", "Piece maker") an `<h1>`, put the game header in `<header>`. Small.

**A2. Invalid list structure. Serious (axe: list).**
The player list and the winner standings contain children that are not list items, so screen readers announce the wrong item count.
*Fix:* make every direct child of the list an `li`, or drop the list role. Small.

**A3. Piece maker tabs are not valid tabs. Critical (axe: aria-required-children).**
The "Piece" row uses `role=tablist`, but the "All 4" control inside it is not a tab.
*Fix:* give "All 4" `role=tab` (or move it out of the tablist). Small.

**A4. Insufficient contrast on the red seat button. Serious (axe: color-contrast).**
White on `#E53E3E` is 4.13:1; text needs 4.5:1. The same colour carries white text elsewhere (seat tabs, player-colour chips).
*Fix:* use the darker red (`#C53030`, 5.47:1) wherever text sits on it. Small.

**A5. How-to-play body is scrollable but not focusable. Serious (axe: scrollable-region-focusable).**
A keyboard user cannot scroll it with the arrow keys.
*Fix:* `tabIndex={0}` on the scroll container with an accessible name. Trivial.

**A6. Header icon buttons are 40x40 px. Medium.**
The back, log, mute, fullscreen, help and settings buttons are all 40 px; the common comfortable minimum is 44 to 48 px (WCAG 2.2 requires 24 px as a floor, so this passes the standard but is tight for thumbs and tremor).
*Fix:* 44 px minimum with 8 px spacing, or a menu overflow on very narrow screens. Small.

**A7. Colour is still the main cue for seats. Medium.**
Red/green/blue/purple tokens are distinguishable for most people, but red and green are the classic confusion pair. The "Token symbols" switch fixes this, yet it is off by default and lives in Settings.
*Fix:* ask once on first launch ("Show shapes on tokens?"), or turn symbols on automatically when `prefers-contrast: more` is set; mention the piece maker as another way. Small.

**A8. Dark theme only; no high-contrast or light mode. Medium.**
`color-scheme: dark` is fixed. Bright sunlight, photophobia on the other side, and Windows forced-colours users get no alternative; the SVG board does not adapt to forced colours.
*Fix:* a "High contrast" board theme that follows `prefers-contrast`, plus a light UI option. Medium.

**A9. Motion and flash safety. Low.**
Win confetti and 3D fireworks and camera shake are decorative and are already switched off by reduced motion. None flash faster than 3 times per second.
*Keep it that way;* add a visible "Reduce motion" toggle in the first-run flow (it exists in Settings as Motion).

**A10. Screen-reader experience beyond axe is unverified. Unknown.**
Token labels and live regions look correct in code and in the accessibility tree, but pass-and-play, the animated sequence timing, and online chat announcements need real screen-reader testing.

### Online and social

**O1. Chat has no safety controls. Medium to High for public or children's use.**
There is rate limiting and text cleaning, but no way to mute a player, report abuse, hide the chat, or let the host turn chat off. Any guest who knows the code can post.
*Fix:* a host switch "Chat on/off", a per-player Mute, a "Hide chat" toggle, and an optional word filter. Medium.

**O2. Room sharing relies on the code and QR. Low.**
That is fine, but there is no one-tap native share sheet on phones.
*Fix:* `navigator.share()` where available. Small.

**O3. The host's tab must stay open and the game tells guests only after the connection drops. Low to Medium.**
A warning on the host's screen ("Closing this tab ends the room") would prevent surprises.

### International users

**I1. English only. Medium for a global audience.**
`lang="en"`, all strings in components, a rules vocabulary that is hard to translate ("blockade", "yard"). No right-to-left layout testing; names allow any characters but the board labels truncate at 14.
*Fix:* extract strings to a message catalogue, test RTL, and use `Intl` for numbers. Large.

### Performance and reliability

**P1. The slowdown over long games was a real leak, now fixed.**
Particle bursts on the flat board were never removed, so a minute of play left about 500 dust circles and 600 live animations. After the fix, DOM size and animation count stay flat. No further leaks were found in 90-second runs in either renderer.

**P2. Heavy decoration is gone with the city graphics.**
Removing the animated backdrop and 3D city also removes the main per-frame cost measured earlier (flat board about 26 fps without it versus about 13 with it on a software-rendered test browser).

**P3. First-load size.** `/play` ships 233 kB of JavaScript on first load; the 3D engine loads separately on demand. Acceptable; revisit if the piece maker's 3D preview is added to the main bundle.

## Recommended order of work

**First (small, high value):** U1 landscape Roll button; U2 sticky Start and collapsed rules; A1 to A5 structural accessibility fixes (about half a day together); A6 44 px targets; U3 select width.

**Next:** U4 turn banner; U5 sticky piece preview on phones; A7 symbols prompt; U8 online microcopy; O1 chat safety.

**Then:** U6 confirm-move option; U7 first-run coach and illustrated rules; A8 high-contrast and light themes; O2 share sheet.

**Later:** I1 internationalisation; real-user and real screen-reader testing on at least two phones.

## What to test with real people

1. Five first-time players of different ages: can they start a game vs a bot without help, and what do they say about the setup screen?
2. A VoiceOver or TalkBack user playing a full pass-and-play game.
3. Two colour-blind players choosing a colour and reading the board with and without symbols.
4. A player with limited dexterity: is a mis-tap common, and would a confirm step help?
5. Phone in landscape on a small device, before and after U1.
