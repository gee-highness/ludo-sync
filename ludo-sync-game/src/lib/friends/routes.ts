import { GAMES } from "../games";
import { isRoomCode } from "../net/crypto";

/** Where a friend's invite leads. Only games this app has, and only a proper room code, so an invite can never send you somewhere else. */
export const joinPathFor = (game: string, room: string): string | null => {
  if (!GAMES.some(g => g.id === game) || !isRoomCode(room)) return null;
  return game === "ludo" ? `/online?join=${room}` : game === "skipbo" ? `/skipbo/online?join=${room}` : `/g/${game}/online?join=${room}`;
};

/** Starts a room for a game and invites these friends as soon as it opens. */
export const hostPathFor = (game: string, friendCodes: string[]): string | null => {
  if (!GAMES.some(g => g.id === game)) return null;
  const base = game === "ludo" ? "/online" : game === "skipbo" ? "/skipbo/online" : `/g/${game}/online`;
  return `${base}?host=1${friendCodes.length ? `&invite=${friendCodes.join(",")}` : ""}`;
};

export const gameName = (id: string) => GAMES.find(g => g.id === id)?.name ?? "a game";
