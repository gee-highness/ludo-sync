import { FINISH, SEAT_INFO, YARD, pointOf, type Point, type Seat } from "@/lib/ludo/board";
import type { GameState } from "@/lib/ludo/types";

export interface TokenView {
  seat: Seat;
  token: number;
  progress: number;
  /** Centre of the square (or yard slot) the token is on. */
  point: Point;
  color: string;
}

export interface PlacedToken extends TokenView {
  /** Where to draw it, nudged so tokens sharing a square stay visible. */
  at: Point;
  scale: number;
}

/** Offsets for tokens sharing a square, so none is hidden. */
const STACK: Record<number, Point[]> = {
  1: [{ x: 0, y: 0 }],
  2: [{ x: -0.2, y: 0 }, { x: 0.2, y: 0 }],
  3: [{ x: -0.2, y: 0.14 }, { x: 0.2, y: 0.14 }, { x: 0, y: -0.2 }],
  4: [{ x: -0.2, y: -0.2 }, { x: 0.2, y: -0.2 }, { x: -0.2, y: 0.2 }, { x: 0.2, y: 0.2 }],
};

export const stackOffset = (index: number, count: number): Point => {
  if (count <= 4) return STACK[count][index];
  const a = (index / count) * Math.PI * 2;
  return { x: Math.cos(a) * 0.28, y: Math.sin(a) * 0.28 };
};

/** Vehicles that have made it home shrink a little, so the middle stays tidy. */
export const FINISHED_SCALE = 0.75;

export const stackScale = (count: number) => (count === 1 ? 1 : count <= 2 ? 0.72 : count <= 4 ? 0.62 : 0.5);

export const tokenKey = (seat: Seat, token: number) => `${seat}-${token}`;

export const seatTokens = (state: GameState): TokenView[] =>
  state.players.flatMap(p =>
    p.tokens.map((progress, token) => ({
      seat: p.seat, token, progress, point: pointOf(p.seat, token, progress), color: SEAT_INFO[p.seat].main,
    })),
  );

/** Every token's drawing position, with squares shared by several tokens fanned out. */
export const placeTokens = (tokens: TokenView[], moving?: { seat: Seat; token: number } | null): PlacedToken[] => {
  const groups = new Map<string, TokenView[]>();
  const travelling: PlacedToken[] = [];
  for (const t of tokens) {
    // a token passing through is drawn exactly on its square, so the tokens it passes do not shuffle aside and back
    if (moving && t.seat === moving.seat && t.token === moving.token) {
      travelling.push({ ...t, at: { ...t.point }, scale: t.progress === FINISH ? FINISHED_SCALE : 1 });
      continue;
    }
    const key = `${t.point.x.toFixed(2)},${t.point.y.toFixed(2)}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const out: PlacedToken[] = [];
  for (const group of groups.values()) {
    group.forEach((t, i) => {
      const fixed = t.progress === YARD || t.progress === FINISH;
      const off = fixed ? { x: 0, y: 0 } : stackOffset(i, group.length);
      out.push({ ...t, at: { x: t.point.x + off.x, y: t.point.y + off.y }, scale: t.progress === FINISH ? FINISHED_SCALE : fixed ? 1 : stackScale(group.length) });
    });
  }
  return [...out, ...travelling];
};

/** Which way a token is facing, as a direction on the board (x right, y down): into the square it is on, out of the yard, or in towards the middle when home. */
export const travelDirection = (seat: Seat, token: number, progress: number): Point => {
  const here = pointOf(seat, token, progress);
  const towards = (to: Point): Point => ({ x: to.x - here.x, y: to.y - here.y });
  if (progress === YARD) return towards(pointOf(seat, token, 0));
  if (progress >= FINISH) return towards({ x: 7, y: 7 });
  if (progress === 0) return towards(pointOf(seat, token, 1));
  const from = pointOf(seat, token, progress - 1);
  return { x: here.x - from.x, y: here.y - from.y };
};
