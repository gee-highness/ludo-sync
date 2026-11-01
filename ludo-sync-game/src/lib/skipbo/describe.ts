import type { GameEvent } from "./types";
import type { TableView } from "./view";

const label = (v: number) => (v === 0 ? "a Skip-Bo" : String(v));

/** Plain sentences for what just happened, for the log and the status line. */
export const describeEvents = (events: GameEvent[], v: TableView): string[] => {
  const name = (i: number) => (i === v.you ? "You" : v.players[i]?.name ?? "Someone");
  const verb = (i: number, you: string, other: string) => (i === v.you ? you : other);
  const out: string[] = [];
  for (const e of events) {
    switch (e.type) {
      case "deal": out.push(e.round > 1 ? `Round ${e.round} is dealt` : "The cards are dealt"); break;
      case "reshuffle": out.push("The finished piles were shuffled back into the draw pile"); break;
      case "play": {
        const from = e.source.from === "stock" ? " from their stock pile" : e.source.from === "discard" ? " from a discard pile" : "";
        out.push(`${name(e.player)} ${verb(e.player, "played", "played")} ${e.card === 0 ? `a Skip-Bo as ${e.value}` : label(e.card)}${from === "" ? "" : from.replace("their", v.you === e.player ? "your" : "their")}`);
        break;
      }
      case "pileDone": out.push(`Pile ${e.to + 1} reached 12 and was cleared`); break;
      case "discard": out.push(`${name(e.player)} ${verb(e.player, "discarded", "discarded")} ${label(e.card)}`); break;
      case "draw": if (e.bonus) out.push(`${name(e.player)} played every card and ${verb(e.player, "draw", "draws")} five more`); break;
      case "pass": out.push(`${name(e.player)} had no cards to play`); break;
      case "roundEnd": out.push(`${name(e.winner)} ${verb(e.winner, "emptied your", "emptied their")} stock pile${e.points ? ` and ${verb(e.winner, "score", "scores")} ${e.points}` : ""}`); break;
      case "gameOver": out.push(`${name(e.winner)} ${verb(e.winner, "win", "wins")}!`); break;
      default: break;
    }
  }
  return out;
};

/** What to say about whose turn it is. */
export const turnLine = (v: TableView): string => {
  if (v.phase === "over") return `${v.winner === v.you ? "You win" : `${v.players[v.winner ?? 0]?.name ?? "Someone"} wins`}!`;
  if (v.phase === "roundOver") return `${v.roundWinner === v.you ? "You" : v.players[v.roundWinner ?? 0]?.name} won the round`;
  return v.turn === v.you ? "Your turn" : `${v.players[v.turn]?.name}'s turn`;
};
