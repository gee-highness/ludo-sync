import type { BoardTheme } from "./settings";

/** The colours of one world: sky, fog, lights, towers and board. Original palettes, not tied to any brand. */
export interface WorldTheme {
  name: string;
  blurb: string;
  skyTop: string; skyHorizon: string; fog: string;
  hemiSky: number; hemiGround: number; sun: number;
  /** Quay line, board frame and track glow. */
  accent: string;
  /** Pool lights and signs. */
  lights: readonly string[];
  /** Flat-board backdrop tower colours. */
  walls: readonly string[];
  /** Multipliers over the tower windows, rooftops, street and water. */
  windowTint: number; roofTint: number; groundTint: number; waterTint: number;
  /** 3D tile and edge, then the flat board's backdrop, cell and frame. */
  tile: number; edge: number;
  bg: string; cell: string; frame: string;
}

export const WORLDS: Partial<Record<BoardTheme, WorldTheme>> = {
  neon: {
    name: "New York", blurb: "Electric blue night",
    skyTop: "#04061a", skyHorizon: "#2a1b5c", fog: "#150f35", hemiSky: 0xa9b8ff, hemiGround: 0x1a2240, sun: 0x9db4ff,
    accent: "#22d3ee", lights: ["#22d3ee", "#e879f9", "#facc15", "#4ade80", "#fb7185", "#60a5fa", "#fb923c"],
    walls: ["#101a3a", "#14214a", "#1a1840", "#0f2540", "#221a45", "#12303f"],
    windowTint: 0xffffff, roofTint: 0x9aa4c8, groundTint: 0xffffff, waterTint: 0xffffff,
    tile: 0x191919, edge: 0x101010, bg: "#05081a", cell: "#122248", frame: "#6f8cff",
  },
  atlantic: {
    name: "Atlantic City", blurb: "Golden boardwalk glow",
    skyTop: "#0a0710", skyHorizon: "#5a3418", fog: "#2a1a10", hemiSky: 0xffd9a0, hemiGround: 0x2a1c10, sun: 0xffc27a,
    accent: "#fbbf24", lights: ["#fbbf24", "#f97316", "#22c55e", "#ef4444", "#fde68a"],
    walls: ["#2a1a10", "#33200f", "#1f1a10", "#2e2410", "#3a2414", "#26180e"],
    windowTint: 0xffd9a0, roofTint: 0xc8a070, groundTint: 0xffd9b0, waterTint: 0xb08a50,
    tile: 0x241a10, edge: 0x120d08, bg: "#120a06", cell: "#3a2812", frame: "#fbbf24",
  },
  forest: {
    name: "Forest", blurb: "Mossy, mushroom-lit glade",
    skyTop: "#06130a", skyHorizon: "#1f5a30", fog: "#0e2a18", hemiSky: 0xbfe8b0, hemiGround: 0x14301c, sun: 0xd8ffb0,
    accent: "#a3e635", lights: ["#84cc16", "#4ade80", "#f59e0b", "#a3e635", "#f472b6"],
    walls: ["#0f2a1a", "#16351f", "#1a3a22", "#0f2f26", "#233a16", "#123222"],
    windowTint: 0xb6f0a8, roofTint: 0x7fb070, groundTint: 0x9fe090, waterTint: 0x70d0a0,
    tile: 0x1a2a1c, edge: 0x0c160e, bg: "#07140a", cell: "#1b3a22", frame: "#a3e635",
  },
  atlantis: {
    name: "Atlantis", blurb: "Deep-sea teal and aqua",
    skyTop: "#021626", skyHorizon: "#0a6a9a", fog: "#07405f", hemiSky: 0x9ee7ff, hemiGround: 0x08304a, sun: 0xa0f0ff,
    accent: "#2dd4bf", lights: ["#22d3ee", "#38bdf8", "#2dd4bf", "#a5f3fc", "#818cf8"],
    walls: ["#0a2a44", "#0c3550", "#0a3a4a", "#123a5a", "#0a2f3f", "#16405a"],
    windowTint: 0x9fe8ff, roofTint: 0x70c0e0, groundTint: 0x70b8d8, waterTint: 0x60e0ff,
    tile: 0x0f2f44, edge: 0x071a28, bg: "#031a2c", cell: "#0f3a58", frame: "#2dd4bf",
  },
  transylvania: {
    name: "Transylvania", blurb: "Crimson and violet gothic night",
    skyTop: "#08040f", skyHorizon: "#4a1230", fog: "#1c0a22", hemiSky: 0xd7a8ff, hemiGround: 0x1a0f2a, sun: 0xff9ab0,
    accent: "#ef4444", lights: ["#c026d3", "#ef4444", "#a855f7", "#f59e0b", "#fb7185"],
    walls: ["#1c0f26", "#240f2a", "#2a1020", "#1a1030", "#2e1226", "#180c22"],
    windowTint: 0xe0a8ff, roofTint: 0xa070a8, groundTint: 0xb080c0, waterTint: 0x9060c0,
    tile: 0x1d1224, edge: 0x0e0814, bg: "#0a0512", cell: "#2a1238", frame: "#ef4444",
  },
  tokyo: {
    name: "Tokyo", blurb: "Cherry-blossom pink and cyan",
    skyTop: "#1a0b2a", skyHorizon: "#c0508a", fog: "#3a1a4a", hemiSky: 0xffc2e6, hemiGround: 0x3a1a4a, sun: 0xffd0ec,
    accent: "#f472b6", lights: ["#f472b6", "#fb7185", "#fde047", "#67e8f9", "#c084fc"],
    walls: ["#2a1840", "#341a4a", "#2a1a3a", "#3a1a40", "#221a44", "#30204a"],
    windowTint: 0xffc8ec, roofTint: 0xe0a0c8, groundTint: 0xf0b0d8, waterTint: 0x90d8f0,
    tile: 0x2a1830, edge: 0x140a1a, bg: "#150a22", cell: "#3a1a48", frame: "#f472b6",
  },
  la: {
    name: "L.A.", blurb: "Violet haze, neon boulevards",
    skyTop: "#070312", skyHorizon: "#5b2a8a", fog: "#1f1038", hemiSky: 0xc9a8ff, hemiGround: 0x1b1530, sun: 0xff9ad0,
    accent: "#a855f7", lights: ["#a855f7", "#ec4899", "#facc15", "#22d3ee", "#4ade80"],
    walls: ["#1b1236", "#221640", "#1a1a3a", "#2a1246", "#18143a", "#201a44"],
    windowTint: 0xcdb6ff, roofTint: 0xa890d0, groundTint: 0xc0a8e8, waterTint: 0xa080e0,
    tile: 0x1b1530, edge: 0x0d0a18, bg: "#08041a", cell: "#2a1a4a", frame: "#a855f7",
  },
  london: {
    name: "London", blurb: "Grey fog, red and brass",
    skyTop: "#161c2a", skyHorizon: "#6a7a96", fog: "#3a4458", hemiSky: 0xdbe4f5, hemiGround: 0x3a4458, sun: 0xe8eeff,
    accent: "#f87171", lights: ["#f87171", "#fbbf24", "#93c5fd", "#e5e7eb", "#fb923c"],
    walls: ["#2a3040", "#323a4c", "#2e3446", "#3a4256", "#283042", "#34384a"],
    windowTint: 0xd0daee, roofTint: 0xb0bcd4, groundTint: 0xb8c4d8, waterTint: 0x8aa0c0,
    tile: 0x232a38, edge: 0x121620, bg: "#10151f", cell: "#2e3850", frame: "#f87171",
  },
  paris: {
    name: "Paris", blurb: "Rose-gold dusk",
    skyTop: "#1b2a4a", skyHorizon: "#e89a6a", fog: "#5a4a5a", hemiSky: 0xffe0c0, hemiGround: 0x3a3a4a, sun: 0xffc890,
    accent: "#fb7185", lights: ["#fbbf24", "#fb7185", "#4ade80", "#60a5fa", "#f9a8d4"],
    walls: ["#3a3040", "#443848", "#3a3446", "#4a3a44", "#342e44", "#40344a"],
    windowTint: 0xffe2c0, roofTint: 0xd8b8a0, groundTint: 0xe0c8b0, waterTint: 0xa0b8d8,
    tile: 0x2a2a30, edge: 0x141418, bg: "#171726", cell: "#3a3248", frame: "#fb7185",
  },
  snow: {
    name: "Snowdrop", blurb: "Icy blue alpine white",
    skyTop: "#3a5a80", skyHorizon: "#cfe4f5", fog: "#bcd4e6", hemiSky: 0xffffff, hemiGround: 0x9bb4c8, sun: 0xffffff,
    accent: "#7dd3fc", lights: ["#bae6fd", "#ffffff", "#7dd3fc", "#fca5a5", "#fde68a"],
    walls: ["#4a6a90", "#56789c", "#5a7aa0", "#4a7090", "#607a9a", "#52709a"],
    windowTint: 0xe8f4ff, roofTint: 0xf0f8ff, groundTint: 0xe8f2fa, waterTint: 0xb8e0f4,
    tile: 0x2f3e50, edge: 0x18202c, bg: "#22344a", cell: "#3a5270", frame: "#7dd3fc",
  },
  park: {
    name: "Parkside", blurb: "Daylight green classic",
    skyTop: "#1a3a22", skyHorizon: "#8fc98a", fog: "#6fa070", hemiSky: 0xffffff, hemiGround: 0x4a7a4a, sun: 0xfff6d0,
    accent: "#facc15", lights: ["#fef08a", "#86efac", "#fca5a5", "#93c5fd", "#fdba74"],
    walls: ["#2a4a30", "#325a38", "#2e5236", "#3a5a40", "#284a38", "#34603e"],
    windowTint: 0xfff2c8, roofTint: 0xc8e0b0, groundTint: 0xc8e8b8, waterTint: 0x90d0e0,
    tile: 0x2b3a2b, edge: 0x141c14, bg: "#14281a", cell: "#2e4a30", frame: "#facc15",
  },
};

export const isWorld = (t: BoardTheme): boolean => !!WORLDS[t];
export const worldOf = (t: BoardTheme): WorldTheme => WORLDS[t] ?? WORLDS.neon!;
