import type { Link } from "../net/transport";

/**
 * A nearby invite accepted from anywhere in the app hands its connection to the game's nearby screen, which picks it up
 * when it opens. Old ones are dropped so a stale connection never joins a later game.
 */
const waiting = new Map<string, { link: Link; at: number }>();
export const handOff = (kind: string, link: Link) => { waiting.get(kind)?.link.close(); waiting.set(kind, { link, at: Date.now() }); };
export const takeHandOff = (kind: string): Link | null => {
  const w = waiting.get(kind);
  waiting.delete(kind);
  return w && w.link.open && Date.now() - w.at < 60_000 ? w.link : null;
};
export const hasHandOff = (kind: string) => !!waiting.get(kind)?.link.open;
