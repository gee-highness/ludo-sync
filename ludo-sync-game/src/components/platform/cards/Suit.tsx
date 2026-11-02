import type { ReactNode } from "react";

export const SUIT_PATHS: ReactNode[] = [
  // clubs: three lobes and a stem
  <g key="c"><circle cx="50" cy="27" r="22" /><circle cx="26" cy="60" r="22" /><circle cx="74" cy="60" r="22" /><path d="M50 50 C50 72 46 86 36 97 L64 97 C54 86 50 72 50 50 Z" /></g>,
  // diamonds
  <path key="d" d="M50 3 L89 50 L50 97 L11 50 Z" />,
  // hearts
  <path key="h" d="M50 94 C18 68 4 50 4 31 C4 17 15 7 28 7 C38 7 46 13 50 22 C54 13 62 7 72 7 C85 7 96 17 96 31 C96 50 82 68 50 94 Z" />,
  // spades
  <path key="s" d="M50 3 C50 3 6 38 6 60 C6 74 17 83 30 83 C38 83 44 79 47 73 C46 83 42 91 33 97 L67 97 C58 91 54 83 53 73 C56 79 62 83 70 83 C83 83 94 74 94 60 C94 38 50 3 50 3 Z" />,
];

/** A suit drawn as a shape, so every suit is exactly the same size (text symbols differ a lot between fonts and suits, which made them collide). */
export function Suit({ suit, size }: { suit: number; size: number }) {
  return <svg width={size} height={size} viewBox="0 0 100 100" fill="currentColor" aria-hidden style={{ display: "block" }}>{SUIT_PATHS[suit]}</svg>;
}
