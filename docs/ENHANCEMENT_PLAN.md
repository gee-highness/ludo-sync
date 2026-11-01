# Ludo Sync: the full experience

Goal: a games app people open every day: something to continue, something new today, visible progress, things to unlock, easy to learn, kind to every player, and solid on every screen.

## 1. Foundations and polish
- Error and not-found screens that offer a way back; metadata and manifest describe the whole app (shortcuts for both games).
- Home screen: a Continue strip for games in progress, today's challenge for each game, and your level.

## 2. Profile and progression (both games)
- One XP total: every finished game earns XP (more for winning, hard bots, tournaments, challenges); a level curve; a level-up toast.
- A Profile page: level and XP bar, per-game stats, all achievements for both games, and what has been unlocked.
- Pure functions (`xpFor`, `levelFor`) with tests.

## 3. Skip-Bo depth
- Achievements (stats extended: wins by level, piles completed, stock cards played in a turn, tournaments won, challenges won).
- Daily challenge: same shuffle for everyone, a rule twist each day (short stock, fast rounds, a hard bot).
- Card backs and felt colours, unlocked by level, shown on both the flat and the 3D table.
- Accessibility: shapes on number colours (colour-blind), larger cards option, announcements for screen readers.
- Bots with names and play styles.

## 4. Learn to play
- A guided lesson on the real engine with a scripted deal: play your stock card, build 1-2-3, use a Skip-Bo, discard to end a turn, block an opponent. A coach bubble explains each step; finishing it gives XP.

## 5. Online and social
- Chat in Skip-Bo rooms (rate limited, cleaned like Ludo's).
- Rooms the host closes the tab on can be reopened from the menu (saved game state, same code).

## 6. Game feel
- Confetti and a fanfare on a win, vibration on key moments, a celebratory pile-clear on the flat table.

## 7. Quality
- End-to-end smoke tests for the home screen and both games, an accessibility audit of the new screens, unit tests for every new pure module, a production build and a look at every screen at phone and desktop size.
