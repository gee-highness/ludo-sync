import type { RuleSchema } from "../../platform/rules";

/** Casino as it is played in different places: every rule is the players' choice. The presets are starting points, not limits. */
export const SCHEMA: RuleSchema = {
  rules: [
    { key: "target", kind: "number", label: "Play to (points)", hint: "The match ends when someone reaches this after a deal", def: 21, min: 5, max: 101, step: 1, group: "Match" },
    { key: "teams", kind: "bool", label: "Teams of two (4 players)", hint: "Seats 1 and 3 play against 2 and 4, sharing piles and score", def: false, group: "Match" },
    { key: "handSize", kind: "number", label: "Cards dealt each time", def: 4, min: 3, max: 6, group: "Dealing" },
    { key: "tableCards", kind: "number", label: "Cards turned up at the start", hint: "Face-up cards on the table before the first play", def: 4, min: 0, max: 6, group: "Dealing" },

    { key: "ace", kind: "choice", label: "Ace is worth", def: "either", choices: [{ value: "low", label: "1" }, { value: "either", label: "1 or 14 (your choice)" }, { value: "high", label: "14" }], group: "Card values" },
    { key: "faces", kind: "choice", label: "Jack, Queen and King", hint: "Pairing only: they can only take the same rank. By rank: Jack 11, Queen 12, King 13 can be added up and built.", def: "pair", choices: [{ value: "pair", label: "Pair with the same rank only" }, { value: "rank", label: "Count as 11, 12 and 13" }], group: "Card values" },

    { key: "builds", kind: "bool", label: "Building allowed", def: true, group: "Building" },
    { key: "maxBuild", kind: "number", label: "Highest build", def: 10, min: 4, max: 14, group: "Building", when: v => v.builds === true },
    { key: "buildNeedsCard", kind: "bool", label: "Must hold a card to take the build", hint: "To make a build you must hold (or already own a build of) the value you build", def: true, group: "Building", when: v => v.builds === true },
    { key: "increaseOwn", kind: "bool", label: "Add to your own builds", def: true, group: "Building", when: v => v.builds === true },
    { key: "increaseOpponents", kind: "bool", label: "Add to opponents' builds (and take them over)", def: true, group: "Building", when: v => v.builds === true },
    { key: "multiBuilds", kind: "bool", label: "Multiple builds", hint: "Combine several sets of the same value into one build", def: true, group: "Building", when: v => v.builds === true },
    { key: "ownBuildBlocksTrail", kind: "bool", label: "No trailing while you own a build", hint: "You must capture or build again", def: true, group: "Building", when: v => v.builds === true },

    { key: "mustCapture", kind: "bool", label: "Must capture when you can", hint: "Off: you may trail a card even if you could capture", def: false, group: "Play" },
    { key: "stealPileTop", kind: "bool", label: "Take the top card of an opponent's pile", hint: "African Casino: capture piles lie face up and the top card can be captured or built with", def: false, group: "Play" },
    { key: "tableToLast", kind: "bool", label: "Last capture takes the cards left on the table", def: true, group: "Play" },

    { key: "ptsCards", kind: "number", label: "Most cards", def: 3, min: 0, max: 10, group: "Scoring" },
    { key: "ptsSpades", kind: "number", label: "Most spades", def: 1, min: 0, max: 10, group: "Scoring" },
    { key: "ptsBig", kind: "number", label: "Big Casino (10 of diamonds)", def: 2, min: 0, max: 10, group: "Scoring" },
    { key: "ptsLittle", kind: "number", label: "Little Casino (2 of spades)", def: 1, min: 0, max: 10, group: "Scoring" },
    { key: "ptsAce", kind: "number", label: "Each ace", def: 1, min: 0, max: 5, group: "Scoring" },
    { key: "ptsSweep", kind: "number", label: "Each sweep (clearing the table)", def: 1, min: 0, max: 10, zeroLabel: "No points", group: "Scoring" },
    { key: "sweepLast", kind: "bool", label: "A sweep counts on the very last play", def: false, group: "Scoring", when: v => (v.ptsSweep as number) > 0 },
  ],
  presets: [
    { id: "classic", name: "Classic", blurb: "Cassino to 21, sweeps score", values: {} },
    { id: "african", name: "African Casino", blurb: "All cards count by rank, no sweep points, take from piles", values: { faces: "rank", ptsSweep: 0, stealPileTop: true, maxBuild: 13 } },
    { id: "royal", name: "Royal", blurb: "Picture cards add up as 11, 12 and 13", values: { faces: "rank", maxBuild: 13 } },
    { id: "short", name: "To 11", blurb: "A shorter match", values: { target: 11 } },
    { id: "nobuild", name: "No building", blurb: "Only capturing and trailing", values: { builds: false } },
    { id: "teams", name: "Teams", blurb: "Two against two", values: { teams: true } },
  ],
};
