import { createGame } from "./engine";
import { WILD, type Action, type GameEvent, type GameState } from "./types";

export interface LessonStep {
  id: string;
  title: string;
  /** What to do, in plain words. */
  text: string;
  /** A little more, shown after a wrong tap or on request. */
  more: string;
  /** The state to start the step from. */
  start: () => GameState;
  /** Has the player done what the step is about? */
  done: (events: GameEvent[]) => boolean;
  /** One way to do it, so the lesson can be checked: used by the tests. */
  solution: Action[];
}

/** A table for teaching: you, and a rival who never plays. Everything is set by hand. */
const table = (o: { hand: number[]; stock: number[]; building?: number[]; discards?: number[][]; rival?: number[] }): GameState => {
  const g = createGame([{ name: "You", kind: "human" }, { name: "Coach", kind: "human" }], { stockSize: 10 }, 12345);
  g.turn = 0;
  g.dealer = 1;
  const me = g.players[0];
  me.hand = [...o.hand];
  me.stock = [...o.stock];
  me.discards = [0, 1, 2, 3].map(i => [...(o.discards?.[i] ?? [])]);
  g.building = [0, 1, 2, 3].map(i => Array.from({ length: o.building?.[i] ?? 0 }, (_, k) => k + 1));
  if (o.rival) g.players[1].stock = [...o.rival];
  return g;
};

const played = (e: GameEvent[], from?: "hand" | "stock" | "discard") => e.some(x => x.type === "play" && x.player === 0 && (!from || x.source.from === from));

export const LESSON: readonly LessonStep[] = [
  {
    id: "stock", title: "The stock pile",
    text: "You win by emptying your stock pile, the stack on the left. Only its top card shows. It is a 1, and every pile starts with a 1. Tap your stock card, then tap pile 1.",
    more: "Tap the card (it lifts up), then tap one of the glowing piles in the middle.",
    start: () => table({ hand: [5, 8, 2, 9, 3], stock: [9, 4, 1] }),
    done: e => played(e, "stock"),
    solution: [{ type: "play", source: { from: "stock" }, to: 0 }],
  },
  {
    id: "build", title: "Build in order",
    text: "Piles go up one number at a time: 1, 2, 3 and so on up to 12. Your stock card is a 3, but pile 1 only stands at 1. Play the 2 from your hand first, then your stock card.",
    more: "Hand cards can go on any pile that needs them. Tap the 2, then pile 1. Then tap your stock 3 and pile 1 again.",
    start: () => table({ hand: [2, 9, 9, 7, 11], stock: [8, 3], building: [1, 0, 0, 0] }),
    done: e => played(e, "stock"),
    solution: [{ type: "play", source: { from: "hand", index: 0 }, to: 0 }, { type: "play", source: { from: "stock" }, to: 0 }],
  },
  {
    id: "wild", title: "Skip-Bo cards",
    text: "The Skip-Bo card is a wildcard: it can be any number. Your stock card is a 6 and the pile stands at 4. Play the Skip-Bo as a 5, then your 6.",
    more: "Save Skip-Bo cards for moments like this: they unlock your stock pile.",
    start: () => table({ hand: [WILD, 10, 10, 12, 11], stock: [9, 6], building: [4, 0, 0, 0] }),
    done: e => played(e, "stock"),
    solution: [{ type: "play", source: { from: "hand", index: 0 }, to: 0 }, { type: "play", source: { from: "stock" }, to: 0 }],
  },
  {
    id: "discard", title: "End your turn",
    text: "Nothing fits? Every turn ends by discarding one card from your hand onto one of your four discard piles. Pick a card, then tap a discard pile on the right of your stock.",
    more: "A good habit: build discard piles downwards, a 9 on a 10, so you can play them in order later.",
    start: () => table({ hand: [7, 12, 10, 4, 9], stock: [8, 6], building: [0, 0, 0, 0] }),
    done: e => e.some(x => x.type === "discard" && x.player === 0),
    solution: [{ type: "discard", index: 1, pile: 0 }],
  },
  {
    id: "bonus", title: "Play your whole hand",
    text: "Play all five cards from your hand and you draw five more and carry on. You hold 1, 2, 3, 4, 5: build them all on one pile.",
    more: "Tap the 1 and pile 1, then the 2, and so on. Each card moves along, so tap the first card again each time.",
    start: () => table({ hand: [1, 2, 3, 4, 5], stock: [11, 10], building: [0, 0, 0, 0] }),
    done: e => e.some(x => x.type === "draw" && x.bonus && x.player === 0),
    solution: [0, 0, 0, 0, 0].map(() => ({ type: "play", source: { from: "hand", index: 0 }, to: 0 } as Action)),
  },
  {
    id: "block", title: "Block your rival",
    text: "Watch the others' stock cards. Coach needs a 4 and pile 1 stands at 3. If you play your 3, Coach plays the 4. Do not help: discard something else instead.",
    more: "You do not have to play every card you can. Keeping a pile stalled can win the game.",
    start: () => table({ hand: [3, 12, 12, 10, 11], stock: [9, 8], building: [3, 0, 0, 0], rival: [7, 4] }),
    done: e => e.some(x => x.type === "discard" && x.player === 0),
    solution: [{ type: "discard", index: 1, pile: 0 }],
  },
  {
    id: "clear", title: "Finish a pile",
    text: "A pile that reaches 12 is cleared away and its place is free again. The pile stands at 11: play your 12 on it.",
    more: "Cleared piles are shuffled back into the draw pile when it runs out.",
    start: () => table({ hand: [12, 7, 9, 5, 2], stock: [6, 5], building: [11, 0, 0, 0] }),
    done: e => e.some(x => x.type === "pileDone"),
    solution: [{ type: "play", source: { from: "hand", index: 0 }, to: 0 }],
  },
];

export const LESSON_XP = 75;
