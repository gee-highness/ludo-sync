import { nextRandom } from "../../ludo/rng";

/** Everything that makes a board: where ladders and snakes go, and the special squares. */
export interface BoardCfg {
  cols: number; rows: number; ladders: number; snakes: number; minJump: number;
  /** How many special squares to place (bonus, skip, safe, and portal pairs). */
  specials: number;
  dice: number; sides: number; finish: "exact" | "bounce" | "any";
}
export type Special = "bonus" | "skip" | "safe" | "warp";
export interface BoardReport {
  /** Typical number of turns one token needs, from simulation. */
  avg: number;
  /** One game in twenty takes at least this many turns. */
  p95: number;
  longestClimb: number;
  longestSlide: number;
  ladders: number;
  snakes: number;
  /** How many candidate layouts were tried before this one passed. */
  tries: number;
  /** True when the layout is within the target length window. */
  balanced: boolean;
}
export interface Board { jumps: Record<number, number>; special: Record<number, Special>; warp: Record<number, number>; report: BoardReport }

class Rng {
  constructor(public s: number) {}
  next(): number { const r = nextRandom(this.s >>> 0); this.s = r.state; return r.value; }
  int(lo: number, hi: number): number { return lo + Math.floor(this.next() * (hi - lo + 1)); }
}

/** One candidate layout. Jumps are spread in bands along the board so they never bunch up, and nothing sits on the first or last square. */
const candidate = (rng: Rng, c: BoardCfg): { jumps: Record<number, number>; used: Set<number> } => {
  const size = c.cols * c.rows;
  const jumps: Record<number, number> = {};
  const used = new Set<number>([1, size]);
  const sameRow = (a: number, b: number) => Math.ceil(a / c.cols) === Math.ceil(b / c.cols);
  const maxLen = Math.max(c.minJump + 2, Math.floor(size * 0.4));
  const segs: [number, number, number, number][] = [];
  const xy = (q: number): [number, number] => { const i = q - 1, row = Math.floor(i / c.cols), col = i % c.cols; return [row % 2 === 0 ? col : c.cols - 1 - col, row]; };
  const ccw = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
  const crosses = (p: number, q: number) => { const [ax, ay] = xy(p), [bx, by] = xy(q); return segs.some(([cx, cy, dx, dy]) => ccw(ax, ay, cx, cy, dx, dy) !== ccw(bx, by, cx, cy, dx, dy) && ccw(ax, ay, bx, by, cx, cy) !== ccw(ax, ay, bx, by, dx, dy)); };
  const total = c.ladders + c.snakes;
  const order: boolean[] = [];
  for (let i = 0; i < c.ladders; i++) order.push(true);
  for (let i = 0; i < c.snakes; i++) order.push(false);
  // alternate ladders and snakes along the board, in a random rotation, so a stretch never holds only one kind
  for (let i = order.length - 1; i > 0; i--) { const j = rng.int(0, i); [order[i], order[j]] = [order[j], order[i]]; }
  order.forEach((up, k) => {
    const lo = 2 + Math.floor((k * (size - 3)) / Math.max(1, total)), hi = Math.max(lo, 2 + Math.floor(((k + 1) * (size - 3)) / Math.max(1, total)) - 1);
    for (let tries = 0; tries < 160; tries++) {
      const len = rng.int(c.minJump, maxLen);
      let a: number, b: number;
      if (up) { a = rng.int(lo, hi); b = a + len; if (b > size - 1) b = size - 1 - rng.int(0, 3); }
      else { b = rng.int(lo, hi); a = b + len; if (a > size - 2) a = size - 2 - rng.int(0, 2); }
      const bottom = up ? a : b, top = up ? b : a;
      if (bottom < 2 || top > size - 1 || top - bottom < c.minJump || used.has(bottom) || used.has(top) || sameRow(bottom, top) || (tries < 110 && crosses(bottom, top))) continue;
      { const [x1, y1] = xy(bottom), [x2, y2] = xy(top); segs.push([x1, y1, x2, y2]); }
      used.add(bottom); used.add(top);
      jumps[up ? bottom : top] = up ? top : bottom;
      return;
    }
  });
  return { jumps, used };
};

/** How many turns one token takes, over many simulated games. Cheap: no other players. */
const simulate = (jumps: Record<number, number>, c: BoardCfg, special: Record<number, Special>, warp: Record<number, number>, rng: Rng, games: number): number[] => {
  const size = c.cols * c.rows;
  const lengths: number[] = [];
  for (let g = 0; g < games; g++) {
    let pos = 0, turns = 0, skip = false;
    while (pos < size && turns < 600) {
      turns++;
      if (skip) { skip = false; continue; }
      let total = 0;
      for (let d = 0; d < c.dice; d++) total += 1 + Math.floor(rng.next() * c.sides);
      let to = pos + total;
      if (to > size) to = c.finish === "exact" ? (pos + c.dice > size ? size : pos) : c.finish === "bounce" ? size - (to - size) : size;
      if (to !== pos && jumps[to] !== undefined) to = jumps[to];
      else if (special[to] === "warp" && warp[to] !== undefined) to = warp[to];
      else if (special[to] === "skip" && to !== size) skip = true;
      pos = to;
    }
    lengths.push(turns);
  }
  return lengths.sort((a, b) => a - b);
};

const placeSpecials = (rng: Rng, c: BoardCfg, used: Set<number>): { special: Record<number, Special>; warp: Record<number, number> } => {
  const size = c.cols * c.rows;
  const special: Record<number, Special> = {}, warp: Record<number, number> = {};
  const free = () => { for (let t = 0; t < 200; t++) { const q = rng.int(2, size - 1); if (!used.has(q)) { used.add(q); return q; } } return 0; };
  const kinds: Special[] = [];
  let left = c.specials;
  while (left > 0) {
    if (left >= 2 && kinds.filter(k => k === "warp").length < 4 && kinds.length % 4 === 3) { kinds.push("warp"); left -= 2; } else { kinds.push((["bonus", "skip", "safe"] as const)[kinds.length % 3]); left -= 1; }
  }
  for (const k of kinds) {
    if (k === "warp") { const a = free(), b = free(); if (a && b) { special[a] = "warp"; special[b] = "warp"; warp[a] = b; warp[b] = a; } }
    else { const q = free(); if (q) special[q] = k; }
  }
  return { special, warp };
};

/** Baseline: turns one token needs on an empty board with the same dice and finish, so an exact finish does not count against a layout. */
const baselines = new Map<string, number>();
const baseline = (c: BoardCfg) => {
  const k = `${c.cols}x${c.rows}:${c.dice}d${c.sides}:${c.finish}`;
  let v = baselines.get(k);
  if (v === undefined) { const l = simulate({}, c, {}, {}, new Rng(12345), 300); v = l.reduce((a, b) => a + b, 0) / l.length; baselines.set(k, v); }
  return v;
};

export const reportOf = (jumps: Record<number, number>, c: BoardCfg, special: Record<number, Special>, warp: Record<number, number>, seed: number, tries = 1): BoardReport => {
  const rng = new Rng((seed ^ 0x9e3779b9) >>> 0);
  const lens = simulate(jumps, c, special, warp, rng, 400);
  const avg = lens.reduce((a, b) => a + b, 0) / lens.length, base = baseline(c);
  let climb = 0, slide = 0, ladders = 0, snakes = 0;
  for (const [a, b] of Object.entries(jumps)) { const d = b - Number(a); if (d > 0) { ladders++; climb = Math.max(climb, d); } else { snakes++; slide = Math.max(slide, -d); } }
  const ratio = avg / base, p95 = lens[Math.floor(lens.length * 0.95)];
  return { avg: Math.round(avg), p95, longestClimb: climb, longestSlide: slide, ladders, snakes, tries, balanced: ratio >= 0.75 && ratio <= 2.1 && p95 <= base * 4.5 };
};

/** A seeded board that has been played out in simulation: it is kept only if the length of a game falls in a healthy window. */
export const generateBoard = (seed: number, c: BoardCfg): Board => {
  const rng = new Rng(seed >>> 0);
  let best: Board | null = null, bestScore = Infinity;
  const base = baseline(c);
  for (let tries = 1; tries <= 14; tries++) {
    const { jumps, used } = candidate(rng, c);
    const { special, warp } = placeSpecials(rng, c, used);
    const report = reportOf(jumps, c, special, warp, rng.s, tries);
    const score = Math.abs(report.avg / base - 1.35) + (report.balanced ? 0 : 5);
    if (score < bestScore) { bestScore = score; best = { jumps, special, warp, report }; }
    if (report.balanced && Math.abs(report.avg / base - 1.35) < 0.45) return { jumps, special, warp, report };
  }
  return best!;
};
