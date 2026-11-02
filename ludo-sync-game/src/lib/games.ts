import { PLATFORM_GAMES } from "./platform/registry";

/** The games in the app. Adding one is a new entry here and its own route. */
export interface GameInfo {
  id: string;
  name: string;
  href: string;
  tagline: string;
  players: string;
  /** Where a saved game can be picked up again, if there is one. */
  resumeHref?: string;
  accent: string;
  icon?: string;
}

export const GAMES: readonly GameInfo[] = [
  { id: "ludo", name: "Ludo", href: "/ludo", tagline: "Race your vehicles round the road and home. Bots, friends, nearby play.", players: "2 to 4 players", accent: "#E53E3E" },
  { id: "skipbo", name: "Skip-Bo", href: "/skipbo", tagline: "Empty your stock pile first. Build 1 to 12, discard wisely, block your rivals.", players: "2 to 6 players", accent: "#2563eb" },
  ...PLATFORM_GAMES.map(g => ({ id: g.id, name: g.name, href: `/g/${g.id}`, tagline: g.tagline, players: g.players, accent: g.accent, icon: g.icon })),
];
