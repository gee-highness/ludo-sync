# Ludo Sync: making it amazing

Goal: a game that is beautiful, calm and easy to follow, with a sense of place. Six phases, each shipped on its own
(code, tests, a real look at the screen, commit). Everything is offline-first and asset-free: sound is synthesised,
scenery is SVG/CSS, so nothing is downloaded or cached.

## Principles
- **Calm by default.** Every new effect respects Reduce motion and has an off switch.
- **Pure logic is tested.** Anything that decides something (what plays, when, what unlocks) is a pure function with a unit test.
- **Nothing blocks play.** Scenery, music and effects never delay a move or intercept a tap.
- **Same on every screen.** Online players see the same events, so effects hang off game events, not local guesses.

## Phase 1. Sound and music
| Piece | How |
|---|---|
| Vehicle voices | `engineVoice(vehicle)` gives each vehicle a pitch, timbre and rev shape (bicycle: tick-whirr; motorbike: buzzy; truck and bus: low rumble; sports: high growl; tuk-tuk: put-put). Played on each hop, rev up on a long move. |
| Horn and tyres | Horn on entering the road and on getting home; tyre squeal on a capture; crash thump with the crash effect. |
| Dice and UI | Existing dice sound kept; add soft clatter variants. |
| Music | Generative, calm, looped from a scheduler: a slow chord pad with a pentatonic melody, three moods (Relaxed, Sunny, Night). Starts on first tap, ducks under big moments, suspends when the tab hides. |
| Ambience | Optional soft rain (filtered noise) when weather is rain. |
| Settings | Sound effects on/off + volume (existing), Music on/off + volume, Engine sounds on/off, Mood. Sanitised and persisted. |
| Tests | Pure: `engineVoice` table is complete; `musicPlan` produces notes inside range and deterministic from a seed; settings sanitising. |

## Phase 2. Easy-to-follow turns
| Piece | How |
|---|---|
| Last move marker | A soft ring on the square a token just left and a bright ring on where it landed; fades after the next roll. |
| Crash moment | A capture shows an impact burst and brief shake on the flat board, the victim returns to its yard; text banner "Blue was sent home". |
| Turn strip | A slim strip showing turn order with the current driver highlighted and who rolls next. |
| Replay last move | A button replays the previous frame's animation (kept frames: previous state + events), disabled mid-animation and when nothing has happened yet. |
| Spoken-style status | Status bar already narrates; add the last move result ("Blue rolled 4 and moved the taxi"). |
| Tests | Pure: `lastMove(prev, frame)` finds from/to/captured; replay buffer keeps exactly the last frame. |

## Phase 3. A living road world
| Piece | How |
|---|---|
| Scenery layer | `Scenery` sits behind the board on the flat board: sky gradient, distant hills, a skyline built from the players' own island buildings, trees. |
| Time of day | Setting: Auto (follows the device clock), Day, Dusk, Night. Night dims the board, lights street lamps and brightens headlights. |
| Weather | Setting: Clear, Rain, Snow. Drops and flakes are CSS-animated; rain adds the quiet rain sound; Reduce motion shows a still tint instead. |
| Ambient traffic | A few small cars drive along the top and bottom of the screen, never over the board. |
| Board lighting | Night: a dark overlay with soft circles of light around every vehicle with headlights on. |
| Tests | Pure: `skyFor(hour, mode)`, `sceneryPlan(seed, islands)` deterministic and bounded. |

## Phase 4. Moments of delight
| Piece | How |
|---|---|
| Photo mode | A camera button saves the board as a PNG (flat: serialise the SVG to canvas; 3D: render then read the canvas) and offers the share sheet. |
| Podium | The winner screen becomes a podium with the winner's vehicle driving in, runner-ups on lower steps, confetti. |
| Reactions | Online emoji reactions already exist; float them over the board for a moment. |
| Achievements and streaks | First win, ten captures, win streaks, play every vehicle; shown in a Garage page with progress. A win streak counter on the menu. |
| Tests | Pure: `achievements(stats)` unlocks at the right thresholds; streak maths. |

## Phase 5. Sharing and replayability
| Piece | How |
|---|---|
| Invite polish | Online invite link, QR and share already exist; add a copy-link button and a clearer "waiting for friends" panel. |
| Board image | Photo mode doubles as the shareable image, with the game result stamped on after a win. |
| Daily challenge | One seeded game per day (rules, bot level, seat colour chosen from the date), one-tap start from the menu, remembers completion and streak. |
| Tests | Pure: `dailyChallenge(date)` deterministic, valid rules; completion record. |

## Phase 6. Polish and verification
- Mobile layout pass at 360x640, 390x844, 768x1024 and landscape; fix overflow, tap targets (min 44px), safe areas.
- A "Calm" preset button in Settings that sets slow pace, reduced effects, relaxed music, road board.
- PWA: make sure the new routes are cached, scenery has no network dependency.
- Lint, types, full tests, production build, browser smoke test of every route.
- Update docs and the how-to-play text; merge to `main`.

## Order and risk
1 -> 2 -> 3 -> 4 -> 5 -> 6. Phase 3 is the largest; it is built so the flat board works without it (a setting turns scenery off). 3D scenery is out of scope: the 3D board keeps its own city.

## Status
All six phases are built, tested and merged.

| Phase | Result | Where |
|---|---|---|
| 1. Sound and music | Per-vehicle engines and horns, tyre squeal and crash, generated music (3 moods), rain ambience, settings | `lib/client/soundDesign.ts`, `audio.ts` |
| 2. Easy-to-follow turns | Last-move rings and sentence, calm turn pill (the full-width ribbon is gone), "Next" tag, crash shake and "sent home" notice, replay last move | `lib/client/lastMove.ts`, `hud/`, `Board2D.tsx` |
| 3. Living road world | Sky for the time of day, skyline from the players' islands, trees, lamps, passing traffic, rain and snow, night dimming; settings for each | `lib/client/scenery.ts`, `board/Scenery.tsx` |
| 4. Moments of delight | Photo mode (flat and 3D), podium, floating reactions, 15 achievements, streaks, Garage page | `lib/client/photo.ts`, `achievements.ts`, `garage/` |
| 5. Sharing and replayability | Photo with a result line, "waiting for friends" note, daily challenge with a different rule twist each day and the same dice for everyone | `lib/client/daily.ts` |
| 6. Polish | Calm preset in Settings, layout sweep on five screen sizes with no horizontal overflow, small tap targets fixed, `/garage` and `/nearby` cached for offline | `settings.ts`, `sw.js/route.ts` |

Known limits: scenery, last-move rings and the crash shake are on the flat board only; the 3D board keeps its own city. Sounds were not listened to on a device.
