import type { RuleSchema } from "../../platform/rules";

const klondike = (v: Record<string, unknown>) => v.variant === "klondike";
const spider = (v: Record<string, unknown>) => v.variant === "spider";
const freecell = (v: Record<string, unknown>) => v.variant === "freecell";

/** Solitaire in three families, every rule adjustable. Several seats play the same deal at once, as a race. */
export const SCHEMA: RuleSchema = {
  rules: [
    { key: "variant", kind: "choice", label: "Game", def: "klondike", choices: [{ value: "klondike", label: "Klondike" }, { value: "freecell", label: "FreeCell" }, { value: "spider", label: "Spider" }], group: "Game" },
    { key: "race", kind: "choice", label: "When several play", hint: "Everyone plays the same deal at the same time", def: "first", choices: [{ value: "first", label: "First to finish wins" }, { value: "score", label: "Play on; best score wins" }], group: "Game" },

    { key: "draw", kind: "choice", label: "Cards turned from the stock", def: "1", choices: [{ value: "1", label: "One at a time" }, { value: "3", label: "Three at a time" }], group: "Klondike", when: klondike },
    { key: "passes", kind: "choice", label: "Times through the stock", def: "0", choices: [{ value: "0", label: "As many as you like" }, { value: "1", label: "Once" }, { value: "3", label: "Three times" }], group: "Klondike", when: klondike },
    { key: "build", kind: "choice", label: "Build down the tableau", def: "alt", choices: [{ value: "alt", label: "Alternating colours" }, { value: "suit", label: "Same suit" }, { value: "any", label: "Any card" }], group: "Klondike", when: v => klondike(v) || freecell(v) },
    { key: "empty", kind: "choice", label: "Empty column takes", def: "king", choices: [{ value: "king", label: "A King (or a run from a King)" }, { value: "any", label: "Any card" }], group: "Klondike", when: klondike },
    { key: "fromFoundation", kind: "bool", label: "May move a card back from a foundation", def: true, group: "Klondike", when: klondike },
    { key: "scoring", kind: "choice", label: "Scoring", def: "standard", choices: [{ value: "standard", label: "Standard" }, { value: "vegas", label: "Vegas (start at -52, +5 a card)" }, { value: "none", label: "None" }], group: "Scoring", when: klondike },

    { key: "cells", kind: "number", label: "Free cells", def: 4, min: 1, max: 8, group: "FreeCell", when: freecell },
    { key: "supermove", kind: "bool", label: "Limit runs by free cells and columns", hint: "Off: any run can be moved in one go", def: true, group: "FreeCell", when: freecell },

    { key: "suits", kind: "choice", label: "Suits", def: "2", choices: [{ value: "1", label: "One suit (easy)" }, { value: "2", label: "Two suits" }, { value: "4", label: "Four suits (hard)" }], group: "Spider", when: spider },
    { key: "dealToEmpty", kind: "bool", label: "May deal onto an empty column", def: false, group: "Spider", when: spider },

    { key: "undo", kind: "bool", label: "Undo allowed", def: true, group: "Help" },
  ],
  presets: [
    { id: "klondike", name: "Klondike", blurb: "Classic, turn one card", values: {} },
    { id: "klondike3", name: "Klondike (turn three)", blurb: "Harder: three at a time", values: { draw: "3" } },
    { id: "vegas", name: "Vegas", blurb: "Turn three, one pass, Vegas scoring", values: { draw: "3", passes: "1", scoring: "vegas", undo: false } },
    { id: "freecell", name: "FreeCell", blurb: "Everything is face up", values: { variant: "freecell" } },
    { id: "spider1", name: "Spider (1 suit)", blurb: "The easy Spider", values: { variant: "spider", suits: "1" } },
    { id: "spider4", name: "Spider (4 suits)", blurb: "The hard Spider", values: { variant: "spider", suits: "4" } },
    { id: "race", name: "Race", blurb: "Same Klondike deal, first to finish", values: {} },
  ],
};
