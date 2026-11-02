import type { RuleValues } from "./rules";
import { sanitizeRules } from "./rules";
import type { BaseView, BotLevel, GameDriver, GameEvent, SeatInfo } from "./types";

export interface Frame<V> { base: BaseView; view: V; events: GameEvent[] }

/**
 * One running game: the driver's state plus the seats around it. The same class runs a local game, a pass-and-play game and the
 * authoritative table of an online room, so every game behaves the same everywhere.
 */
export class GameTable<S, A, V> {
  state: S;
  readonly rules: RuleValues;
  constructor(readonly driver: GameDriver<S, A, V>, public seats: SeatInfo[], rules: unknown, seed: number, resume?: S) {
    this.rules = sanitizeRules(driver.schema, rules);
    this.state = resume ?? driver.create(seats, this.rules, seed);
  }

  get over(): boolean { return this.driver.over(this.state); }
  canAct(p: number): boolean { return this.actors().includes(p) || (!!this.driver.mayAct && this.driver.mayAct(this.state, p)); }
  actors(): number[] { return this.driver.actors(this.state); }

  base(viewer: number | null): BaseView {
    const d = this.driver, s = this.state;
    const over = d.over(s);
    return {
      you: viewer, players: this.seats.map(p => ({ name: p.name, kind: p.kind, level: p.level })), actors: over ? [] : d.actors(s), over,
      winners: over ? d.winners(s) : [], scores: d.scores(s), prompt: viewer === null ? "Watching" : d.prompt(s, viewer),
    };
  }

  frame(viewer: number | null, events: GameEvent[] = []): Frame<V> {
    return { base: this.base(viewer), view: this.driver.view(this.state, viewer), events };
  }

  /** Applies a player's move. Returns the events, or null if the move was refused. */
  act(player: number, action: A): GameEvent[] | null {
    if (this.over || !this.canAct(player) || !this.seats[player]) return null;
    const r = this.driver.apply(this.state, action, player);
    if (!r) return null;
    this.state = r.state;
    return r.events;
  }

  /** The next bot that has a move, if any. */
  botTurn(): { player: number; action: A } | null {
    if (this.over) return null;
    // bots that may react out of turn (catching a missed call, jumping in) are asked first, then the players whose turn it is
    const order = [...this.seats.map((_, i) => i).filter(i => !this.actors().includes(i) && this.driver.mayAct?.(this.state, i)), ...this.actors()];
    for (const p of order) {
      const seat = this.seats[p];
      if (seat?.kind !== "bot") continue;
      const action = this.driver.bot(this.state, p, seat.level ?? "normal");
      if (action !== null) return { player: p, action };
    }
    return null;
  }

  /** Plays one bot move. Returns its events, or null when no bot is due. */
  botStep(): GameEvent[] | null {
    const t = this.botTurn();
    return t ? this.act(t.player, t.action) : null;
  }

  /** Plays for someone who is away or out of time, at normal strength. */
  playFor(player: number, level: BotLevel = "normal"): GameEvent[] | null {
    if (!this.canAct(player)) return null;
    const action = this.driver.bot(this.state, player, level);
    return action === null ? null : this.act(player, action);
  }

  /** A person leaves for good mid-game: a bot takes over the seat. */
  replaceWithBot(player: number, level: BotLevel = "normal") {
    const s = this.seats[player];
    if (s) this.seats[player] = { name: `${s.name} (bot)`.slice(0, 24), kind: "bot", level };
  }

  names(): string[] { return this.seats.map(s => s.name); }
}

/** Plays a whole game of bots against each other, for tests and for checking that a driver always finishes. */
export const simulate = <S, A, V>(driver: GameDriver<S, A, V>, levels: BotLevel[], rules: unknown, seed: number, maxSteps = 20000): { table: GameTable<S, A, V>; steps: number; finished: boolean } => {
  const seats: SeatInfo[] = levels.map((level, i) => ({ name: `Bot ${i + 1}`, kind: "bot", level }));
  const table = new GameTable(driver, seats, rules, seed);
  let steps = 0;
  while (!table.over && steps < maxSteps) {
    if (!table.botStep()) break;
    steps++;
  }
  return { table, steps, finished: table.over };
};
