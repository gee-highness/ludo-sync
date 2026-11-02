import type { GameModule } from "./types";

/** What the hub and menus need to know about a game without loading its code. */
export interface GameMeta { id: string; name: string; tagline: string; accent: string; icon: string; players: string; category: "Cards" | "Board" | "Dice" | "Puzzle" }

export const PLATFORM_GAMES: readonly GameMeta[] = [
  { id: "fourinrow", name: "Four in a Row", tagline: "Drop discs and connect a line. Change the board, the line length, add PopOut, bombs and more.", accent: "#eab308", icon: "🟡", players: "2 to 4 players", category: "Board" },
  { id: "casino", name: "Casino", tagline: "The South African card game of capturing, building and trailing. Every rule is yours to set.", accent: "#16a34a", icon: "♠️", players: "2 to 4 players", category: "Cards" },
  { id: "fourcolors", name: "4 Colors", tagline: "Match the colour or number, play action cards, be first out. Every rule and even the deck is yours to change.", accent: "#dc2626", icon: "🎴", players: "2 to 10 players", category: "Cards" },
  { id: "snakes", name: "Snakes and Ladders", tagline: "Race to the last square. Change the board, the dice, the finish and the twists.", accent: "#16a34a", icon: "🐍", players: "2 to 6 players", category: "Dice" },
  { id: "memory", name: "Memory Match", tagline: "Flip cards and find the matches. Solo or with friends, pairs or triples, with the pictures and scoring you choose.", accent: "#6366f1", icon: "🧠", players: "1 to 6 players", category: "Puzzle" },
];

export const metaOf = (id: string): GameMeta | undefined => PLATFORM_GAMES.find(g => g.id === id);

type Loader = () => Promise<{ default: GameModule<never, never, never> }>;
/** Each game's code (engine, bots, table) is a separate chunk, loaded only when that game opens. */
const LOADERS: Record<string, Loader> = {
  fourinrow: () => import("@/components/games/fourinrow/module") as unknown as ReturnType<Loader>,
  fourcolors: () => import("@/components/games/fourcolors/module") as unknown as ReturnType<Loader>,
  snakes: () => import("@/components/games/snakes/module") as unknown as ReturnType<Loader>,
  memory: () => import("@/components/games/memory/module") as unknown as ReturnType<Loader>,
  casino: () => import("@/components/games/casino/module") as unknown as ReturnType<Loader>,
};

export const loadModule = async (id: string): Promise<GameModule | null> => {
  const l = LOADERS[id];
  return l ? ((await l()).default as unknown as GameModule) : null;
};
