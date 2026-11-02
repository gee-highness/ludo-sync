import type { RuleSchema } from "../../platform/rules";

/** 4 Colors: every rule, the deck itself and the scoring are the players' choice. */
export const SCHEMA: RuleSchema = {
  rules: [
    { key: "handSize", kind: "number", label: "Cards each", def: 7, min: 3, max: 15, group: "Dealing" },
    { key: "zeroCopies", kind: "number", label: "Zeros per colour", def: 1, min: 0, max: 2, group: "The deck" },
    { key: "numberCopies", kind: "number", label: "Copies of 1 to 9 per colour", def: 2, min: 1, max: 3, group: "The deck" },
    { key: "skipCopies", kind: "number", label: "Skips per colour", def: 2, min: 0, max: 4, group: "The deck" },
    { key: "reverseCopies", kind: "number", label: "Reverses per colour", def: 2, min: 0, max: 4, group: "The deck" },
    { key: "drawTwoCopies", kind: "number", label: "Draw Twos per colour", def: 2, min: 0, max: 4, group: "The deck" },
    { key: "wilds", kind: "number", label: "Wild cards", def: 4, min: 0, max: 8, group: "The deck" },
    { key: "wildFours", kind: "number", label: "Wild Draw Fours", def: 4, min: 0, max: 8, group: "The deck" },

    { key: "mustPlay", kind: "bool", label: "Must play if you can", hint: "Off: you may draw even when you hold a playable card", def: false, group: "Turns" },
    { key: "drawUntil", kind: "bool", label: "Draw until you can play", def: false, group: "Turns" },
    { key: "mustPlayDrawn", kind: "bool", label: "Must play a drawn card that fits", hint: "Off: you may keep it and pass", def: false, group: "Turns" },
    { key: "reverseTwo", kind: "choice", label: "Reverse with two players", def: "skip", choices: [{ value: "skip", label: "Acts like a skip" }, { value: "turn", label: "Passes the turn as normal" }], group: "Turns" },
    { key: "endOnAction", kind: "bool", label: "May go out on an action or wild card", def: true, group: "Turns" },

    { key: "stack", kind: "choice", label: "Stacking draw cards", hint: "Answer a draw card with another instead of drawing", def: "off", choices: [{ value: "off", label: "Off" }, { value: "same", label: "Same kind only" }, { value: "any", label: "Any draw card" }], group: "House rules" },
    { key: "jumpIn", kind: "bool", label: "Jump in", hint: "Play an identical card out of turn", def: false, group: "House rules" },
    { key: "sevenZero", kind: "bool", label: "Seven-zero", hint: "A 7 swaps hands with someone; a 0 passes every hand along", def: false, group: "House rules" },

    { key: "challenge", kind: "bool", label: "Wild Draw Four can be challenged", def: true, group: "Wild Draw Four" },
    { key: "w4Restricted", kind: "bool", label: "Only legal with no card of the current colour", def: true, group: "Wild Draw Four" },
    { key: "challengePenalty", kind: "number", label: "Extra cards for a failed challenge", def: 2, min: 0, max: 6, group: "Wild Draw Four", when: v => v.challenge === true },

    { key: "lastCall", kind: "bool", label: "Must call “Last card!”", def: true, group: "Last card" },
    { key: "callPenalty", kind: "number", label: "Cards for not calling", def: 2, min: 1, max: 6, group: "Last card", when: v => v.lastCall === true },

    { key: "target", kind: "number", label: "Match target (0 = one round)", def: 500, min: 0, max: 2000, step: 50, zeroLabel: "One round", group: "Scoring" },
    { key: "actionValue", kind: "number", label: "Skip, Reverse, Draw Two are worth", def: 20, min: 0, max: 100, step: 5, group: "Scoring" },
    { key: "wildValue", kind: "number", label: "Wild cards are worth", def: 50, min: 0, max: 100, step: 5, group: "Scoring" },
  ],
  presets: [
    { id: "classic", name: "Classic", blurb: "The standard game to 500", values: {} },
    { id: "quick", name: "Quick", blurb: "One round, five cards", values: { target: 0, handSize: 5 } },
    { id: "chaos", name: "Chaos", blurb: "Stacking, jump in and seven-zero", values: { stack: "any", jumpIn: true, sevenZero: true } },
    { id: "family", name: "Family", blurb: "No challenge, draw until you can play", values: { challenge: false, w4Restricted: false, drawUntil: true } },
    { id: "brutal", name: "Brutal", blurb: "Stack everything, big penalties", values: { stack: "any", callPenalty: 4, challengePenalty: 4, mustPlay: true } },
  ],
};
