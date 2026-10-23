import { getSettings } from "./settings";

export type Sfx = "click" | "dice" | "hop" | "enter" | "capture" | "home" | "bonus" | "penalty" | "turn" | "start" | "win" | "pop" | "error";

type Wave = OscillatorType;

/**
 * Every sound is synthesised from oscillators and noise, so the game needs no audio files:
 * nothing to download, nothing to cache, and it sounds the same offline.
 */
class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  /** Call from a user gesture; browsers keep audio suspended until then. */
  unlock() {
    if (typeof window === "undefined") return;
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
    } catch { /* audio unavailable */ }
  }

  suspend() { if (this.ctx?.state === "running") void this.ctx.suspend(); }

  private tone(freq: number, at: number, dur: number, type: Wave, gain: number, slideTo?: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.012, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g).connect(this.master!);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  private burst(at: number, dur: number, gain: number, cutoff: number) {
    const ctx = this.ctx!;
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(filter).connect(g).connect(this.master!);
    src.start(at, Math.random() * 0.5);
    src.stop(at + dur + 0.02);
  }

  play(sfx: Sfx) {
    const s = getSettings();
    if (!s.sound || !this.ctx || !this.master || this.ctx.state !== "running") return;
    this.master.gain.value = s.volume;
    const t = this.ctx.currentTime;
    switch (sfx) {
      case "click": this.tone(880, t, 0.05, "triangle", 0.25); break;
      case "pop": this.tone(520, t, 0.09, "sine", 0.3, 880); break;
      case "dice":
        for (let i = 0; i < 7; i++) this.burst(t + i * 0.07 + Math.random() * 0.02, 0.05, 0.5, 1800 + Math.random() * 2400);
        break;
      case "hop": this.tone(300, t, 0.09, "sine", 0.3, 520); break;
      case "enter": this.tone(392, t, 0.09, "triangle", 0.3); this.tone(587, t + 0.08, 0.14, "triangle", 0.3); break;
      case "capture":
        this.tone(700, t, 0.28, "sawtooth", 0.28, 70);
        this.burst(t, 0.25, 0.7, 1200);
        break;
      case "home": [523, 659, 784, 1047].forEach((f, i) => this.tone(f, t + i * 0.07, 0.16, "triangle", 0.3)); break;
      case "bonus": this.tone(660, t, 0.09, "square", 0.14); this.tone(990, t + 0.09, 0.14, "square", 0.14); break;
      case "penalty": this.tone(260, t, 0.35, "sawtooth", 0.22, 90); break;
      case "turn": this.tone(740, t, 0.1, "sine", 0.25); this.tone(988, t + 0.1, 0.16, "sine", 0.25); break;
      case "start": [392, 494, 587, 784].forEach((f, i) => this.tone(f, t + i * 0.09, 0.18, "triangle", 0.3)); break;
      case "win":
        [523, 523, 523, 659, 784, 659, 784, 1047].forEach((f, i) => this.tone(f, t + i * 0.13, 0.22, "triangle", 0.32));
        break;
      case "error": this.tone(180, t, 0.12, "square", 0.18); break;
    }
  }
}

export const sound = new SoundEngine();
