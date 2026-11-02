import type { RuleSchema } from "../../platform/rules";

/** Casino as it is played in different places: every rule is the players' choice. The presets are starting points, not limits. */
export const SCHEMA: RuleSchema = {
  rules: [
    { key: "deck", kind: "choice", label: "Cards in the pack", hint: "The full pack, or the 40 cards of South African Casino with the Jacks, Queens and Kings taken out", def: "52", choices: [{ value: "52", label: "52 (full pack)" }, { value: "40", label: "40 (no picture cards)" }], group: "Match" },
    { key: "target", kind: "number", label: "Play to (points)", hint: "0 picks the usual target: 11 for two players or partnerships, 7 when three or four play for themselves", def: 0, min: 0, max: 101, step: 1, zeroLabel: "Usual target", group: "Match" },
    { key: "teams", kind: "bool", label: "Partnerships (4 players)", hint: "Seats 1 and 3 play against 2 and 4, sharing a pile and a score", def: true, group: "Match" },
    { key: "direction", kind: "choice", label: "Direction of play", def: "anti", choices: [{ value: "anti", label: "Anticlockwise (South African)" }, { value: "clock", label: "Clockwise" }], group: "Match" },
    { key: "dealMode", kind: "choice", label: "How cards are dealt", hint: "South African: 10 each and an empty table for 2 or 4 players; 13 each and one card on the table for 3. Crazy: 8 each, refill after every turn.", def: "african", choices: [{ value: "african", label: "South African (by number of players)" }, { value: "classic", label: "Set the numbers below" }, { value: "crazy", label: "Crazy Casino (draw back up to 8)" }], group: "Dealing" },
    { key: "handSize", kind: "number", label: "Cards dealt each time", def: 4, min: 3, max: 13, group: "Dealing", when: v => v.dealMode === "classic" },
    { key: "tableCards", kind: "number", label: "Cards turned up at the start", def: 4, min: 0, max: 6, group: "Dealing", when: v => v.dealMode === "classic" },

    { key: "ace", kind: "choice", label: "Ace is worth", def: "low", choices: [{ value: "low", label: "1" }, { value: "either", label: "1 or 14 (your choice)" }, { value: "high", label: "14" }], group: "Card values" },
    { key: "faces", kind: "choice", label: "Jack, Queen and King", hint: "Pairing only: they can only take the same rank. By rank: Jack 11, Queen 12, King 13 can be added up and built.", def: "pair", choices: [{ value: "pair", label: "Pair with the same rank only" }, { value: "rank", label: "Count as 11, 12 and 13" }], group: "Card values" },

    { key: "builds", kind: "bool", label: "Building allowed", def: true, group: "Building" },
    { key: "maxBuild", kind: "number", label: "Highest build", def: 10, min: 4, max: 14, group: "Building", when: v => v.builds === true },
    { key: "buildNeedsCard", kind: "bool", label: "Must hold a card to take the build", hint: "To make a build you must hold (or already own a build of) the value you build", def: true, group: "Building", when: v => v.builds === true },
    { key: "increaseOwn", kind: "bool", label: "Add to your own builds", def: true, group: "Building", when: v => v.builds === true },
    { key: "increaseOpponents", kind: "bool", label: "Add to opponents' builds (and take them over)", def: true, group: "Building", when: v => v.builds === true },
    { key: "multiBuilds", kind: "bool", label: "Multiple builds", hint: "Combine several sets of the same value into one build", def: true, group: "Building", when: v => v.builds === true },
    { key: "ownBuildBlocksTrail", kind: "bool", label: "No trailing while you own a build", hint: "You must capture or build again", def: true, group: "Building", when: v => v.builds === true },

    { key: "mustCapture", kind: "bool", label: "Must capture when you can", hint: "Off: you may trail a card even if you could capture", def: false, group: "Play" },
    { key: "stealPileTop", kind: "bool", label: "Take the top card of an opponent's pile", hint: "South African Casino: capture piles lie face up (lowest card on top) and the top card can be captured or built with", def: true, group: "Play" },
    { key: "tableToLast", kind: "bool", label: "Last capture takes the cards left on the table", def: true, group: "Play" },

    { key: "ptsCards", kind: "number", label: "Most cards", def: 2, min: 0, max: 10, group: "Scoring" },
    { key: "ptsSpades", kind: "number", label: "Most spades", def: 2, min: 0, max: 10, group: "Scoring" },
    { key: "ptsBig", kind: "number", label: "Mummy / Big Casino (10 of diamonds)", def: 2, min: 0, max: 10, group: "Scoring" },
    { key: "ptsLittle", kind: "number", label: "Spy Two / Little Casino (2 of spades)", def: 1, min: 0, max: 10, group: "Scoring" },
    { key: "ptsAce", kind: "number", label: "Each ace", def: 1, min: 0, max: 5, group: "Scoring" },
    { key: "ptsSweep", kind: "number", label: "Each sweep (clearing the table)", def: 0, min: 0, max: 10, zeroLabel: "No points", group: "Scoring" },
    { key: "sweepLast", kind: "bool", label: "A sweep counts on the very last play", def: false, group: "Scoring", when: v => (v.ptsSweep as number) > 0 },
  ],
  presets: [
    { id: "full", name: "Full pack", blurb: "52 cards, anticlockwise, steal from piles, 11 points a deal", values: {} },
    { id: "sa", name: "South African (40)", blurb: "40 cards with no picture cards, 11 points a deal", values: { deck: "40" } },
    { id: "swazi", name: "Swazi", blurb: "Full pack, picture cards 11 to 13, ace 1 or 14", values: { faces: "rank", ace: "either", maxBuild: 14 } },
    { id: "sotho", name: "Sotho", blurb: "Full pack, picture cards only pair, ace 1", values: { faces: "pair", ace: "low" } },
    { id: "crazy", name: "Crazy Casino", blurb: "Draw back up to 8 after every turn", values: { dealMode: "crazy", ownBuildBlocksTrail: true } },
    { id: "classic", name: "Classic Cassino", blurb: "52 cards, to 21, sweeps score, no stealing", values: { deck: "52", direction: "clock", dealMode: "classic", target: 21, ptsCards: 3, ptsSpades: 1, ptsSweep: 1, stealPileTop: false, ace: "either", teams: false } },
    { id: "royal", name: "Royal", blurb: "Classic with picture cards as 11, 12 and 13", values: { deck: "52", direction: "clock", dealMode: "classic", target: 21, ptsCards: 3, ptsSpades: 1, ptsSweep: 1, stealPileTop: false, ace: "either", faces: "rank", maxBuild: 13, teams: false } },
    { id: "nobuild", name: "No building", blurb: "Only capturing and trailing", values: { builds: false } },
  ],
};
