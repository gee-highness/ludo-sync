import { describe, expect, it } from "vitest";
import { VEHICLES } from "./pieces";
import { ENGINES, HORNS, MOODS, barSeconds, engineVoice, musicBar } from "./soundDesign";

describe("vehicle voices", () => {
  it("every vehicle has an engine and a horn in a sensible range", () => {
    for (const v of VEHICLES) {
      const e = engineVoice(v);
      expect(ENGINES[v]).toBe(e);
      expect(e.base).toBeGreaterThan(30);
      expect(e.base).toBeLessThan(3000);
      expect(e.gain).toBeGreaterThan(0);
      expect(e.gain).toBeLessThanOrEqual(0.4);
      expect(e.chug).toBeGreaterThanOrEqual(1);
      expect(HORNS[v][0]).toBeLessThan(HORNS[v][1]);
    }
  });
  it("heavy vehicles sound lower than light ones", () => {
    expect(ENGINES.truck.base).toBeLessThan(ENGINES.car.base);
    expect(ENGINES.car.base).toBeLessThan(ENGINES.motorbike.base);
    expect(ENGINES.bus.cutoff).toBeLessThan(ENGINES.sports.cutoff);
  });
});

describe("music", () => {
  it("is deterministic for a mood, bar and seed, and differs between bars", () => {
    for (const m of MOODS) {
      expect(musicBar(m, 3, 5)).toEqual(musicBar(m, 3, 5));
      expect(JSON.stringify(musicBar(m, 0, 5))).not.toBe(JSON.stringify(musicBar(m, 1, 5)));
    }
  });
  it("keeps every note inside the bar and inside a gentle range", () => {
    for (const m of MOODS) for (let bar = 0; bar < 16; bar++) {
      const notes = musicBar(m, bar, 2);
      expect(notes.some(n => n.voice === "pad")).toBe(true);
      expect(notes.some(n => n.voice === "bass")).toBe(true);
      for (const n of notes) {
        expect(n.at).toBeGreaterThanOrEqual(0);
        expect(n.at).toBeLessThan(barSeconds(m));
        expect(n.freq).toBeGreaterThan(50);
        expect(n.freq).toBeLessThan(1600);
        expect(n.gain).toBeGreaterThan(0);
        expect(n.gain).toBeLessThan(0.15);
      }
    }
  });
  it("moods differ in tempo", () => {
    expect(barSeconds("sunny")).toBeLessThan(barSeconds("relaxed"));
    expect(barSeconds("relaxed")).toBeLessThan(barSeconds("night"));
  });
});
