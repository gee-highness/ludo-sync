import type { VehicleId } from "./pieces";

/** The voice of each vehicle: a pitch, a timbre, and how it revs. Pure data, so it is the same on every device and easy to test. */
export interface EngineVoice {
  /** Base pitch in Hz. */
  base: number;
  wave: "sine" | "triangle" | "sawtooth" | "square";
  /** Pitch rise over one hop, as a ratio. */
  rev: number;
  /** How many pulses per hop (the put-put of a tuk-tuk, the tick of a bicycle). */
  chug: number;
  /** 0 to 1. */
  gain: number;
  /** Low-pass cutoff, so heavy vehicles sound heavy. */
  cutoff: number;
}

export const ENGINES: Record<VehicleId, EngineVoice> = {
  none: { base: 300, wave: "sine", rev: 1.7, chug: 1, gain: 0.3, cutoff: 4000 },
  car: { base: 95, wave: "sawtooth", rev: 1.35, chug: 2, gain: 0.22, cutoff: 900 },
  sports: { base: 140, wave: "sawtooth", rev: 1.7, chug: 3, gain: 0.22, cutoff: 1600 },
  taxi: { base: 90, wave: "sawtooth", rev: 1.3, chug: 2, gain: 0.22, cutoff: 800 },
  suv: { base: 75, wave: "sawtooth", rev: 1.3, chug: 2, gain: 0.25, cutoff: 700 },
  van: { base: 70, wave: "sawtooth", rev: 1.25, chug: 2, gain: 0.25, cutoff: 650 },
  truck: { base: 48, wave: "sawtooth", rev: 1.2, chug: 3, gain: 0.3, cutoff: 480 },
  bus: { base: 55, wave: "sawtooth", rev: 1.2, chug: 2, gain: 0.3, cutoff: 520 },
  motorbike: { base: 160, wave: "square", rev: 1.6, chug: 4, gain: 0.14, cutoff: 1800 },
  scooter: { base: 210, wave: "square", rev: 1.4, chug: 3, gain: 0.12, cutoff: 2200 },
  bicycle: { base: 1200, wave: "triangle", rev: 1.05, chug: 4, gain: 0.1, cutoff: 6000 },
  tuktuk: { base: 110, wave: "square", rev: 1.25, chug: 5, gain: 0.16, cutoff: 1000 },
};

export const engineVoice = (vehicle: VehicleId): EngineVoice => ENGINES[vehicle];

/** The horn of each vehicle, as two pitches that sound together. */
export const HORNS: Record<VehicleId, readonly [number, number]> = {
  none: [440, 554], car: [420, 520], sports: [520, 660], taxi: [400, 500], suv: [350, 440], van: [330, 415], truck: [220, 277],
  bus: [250, 311], motorbike: [700, 880], scooter: [820, 1000], bicycle: [1760, 2200], tuktuk: [600, 740],
};

// ---- music -------------------------------------------------------------------------------------------------------

export const MOODS = ["relaxed", "sunny", "night"] as const;
export type Mood = (typeof MOODS)[number];

export const MOOD_LABEL: Record<Mood, string> = { relaxed: "Relaxed", sunny: "Sunny", night: "Night drive" };

export interface MusicNote {
  /** Seconds from the start of the bar. */
  at: number;
  /** Hz. */
  freq: number;
  dur: number;
  gain: number;
  voice: "pad" | "lead" | "bass";
}

interface MoodSpec { root: number; tempo: number; scale: readonly number[]; chords: readonly (readonly number[])[]; leadChance: number }

const MOOD_SPEC: Record<Mood, MoodSpec> = {
  // semitones above the root; chords are triads built on pentatonic-friendly degrees
  relaxed: { root: 220, tempo: 68, scale: [0, 2, 4, 7, 9], chords: [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]], leadChance: 0.55 },
  sunny: { root: 261.63, tempo: 92, scale: [0, 2, 4, 7, 9], chords: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]], leadChance: 0.75 },
  night: { root: 196, tempo: 60, scale: [0, 3, 5, 7, 10], chords: [[0, 3, 7], [8, 12, 15], [5, 8, 12], [10, 14, 17]], leadChance: 0.4 },
};

const rng = (seed: number) => () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const hz = (root: number, semis: number) => root * Math.pow(2, semis / 12);

export const barSeconds = (mood: Mood) => (60 / MOOD_SPEC[mood].tempo) * 4;

/** One bar of music: a soft pad chord, a slow bass note and a few pentatonic lead notes. Deterministic for a given mood, bar number and seed. */
export const musicBar = (mood: Mood, bar: number, seed = 1): MusicNote[] => {
  const spec = MOOD_SPEC[mood];
  const beat = 60 / spec.tempo;
  const r = rng(seed * 7919 + bar * 104729 + MOODS.indexOf(mood) * 31);
  const chord = spec.chords[bar % spec.chords.length];
  const notes: MusicNote[] = [];
  for (const semis of chord) notes.push({ at: 0, freq: hz(spec.root, semis), dur: beat * 4.1, gain: 0.05, voice: "pad" });
  notes.push({ at: 0, freq: hz(spec.root / 2, chord[0]), dur: beat * 2, gain: 0.09, voice: "bass" });
  notes.push({ at: beat * 2, freq: hz(spec.root / 2, chord[0] + (r() < 0.5 ? 0 : 7)), dur: beat * 1.8, gain: 0.07, voice: "bass" });
  for (let step = 0; step < 8; step++) {
    if (r() > spec.leadChance * (step % 2 === 0 ? 1 : 0.55)) continue;
    const degree = spec.scale[Math.floor(r() * spec.scale.length)] + (r() < 0.3 ? 12 : 0);
    notes.push({ at: step * (beat / 2), freq: hz(spec.root, degree), dur: beat * (0.8 + r() * 0.8), gain: 0.05 + r() * 0.025, voice: "lead" });
  }
  return notes;
};
