import { getSettings } from "./settings";
import { HORNS, barSeconds, engineVoice, musicBar, type Mood } from "./soundDesign";
import type { VehicleId } from "./pieces";

export type Sfx = "click" | "dice" | "hop" | "enter" | "capture" | "home" | "bonus" | "penalty" | "turn" | "start" | "win" | "pop" | "error" | "squeal" | "crash";

type Wave = OscillatorType;

/**
 * Every sound is synthesised from oscillators and noise, so the game needs no audio files:
 * nothing to download, nothing to cache, and it sounds the same offline.
 */
class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private musicBus: GainNode | null = null;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private musicMood: Mood | null = null;
  private nextBarAt = 0;
  private bar = 0;
  private rain: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

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
        this.musicBus = this.ctx.createGain();
        this.musicBus.gain.value = 0;
        this.musicBus.connect(this.ctx.destination);
      }
      if (this.ctx.state === "suspended") void this.ctx.resume().then(() => this.syncMusic());
      else this.syncMusic();
    } catch { /* audio unavailable */ }
  }

  suspend() { if (this.ctx?.state === "running") void this.ctx.suspend(); }

  private noiseBuffer(): AudioBuffer {
    const ctx = this.ctx!;
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.noise;
  }

  /** A vehicle's engine for the length of one hop: a pitch that rises, pulsing at the engine's own rate, through a filter that keeps heavy ones dark. */
  drive(vehicle: VehicleId, dur = 0.3) {
    const s = getSettings();
    if (!s.sound || !s.engineSounds || !this.ctx || !this.master || this.ctx.state !== "running") return;
    this.master.gain.value = s.volume;
    const v = engineVoice(vehicle);
    const ctx = this.ctx, t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = v.wave;
    osc.frequency.setValueAtTime(v.base, t);
    osc.frequency.exponentialRampToValueAtTime(v.base * v.rev, t + dur);
    filter.type = "lowpass";
    filter.frequency.value = v.cutoff;
    g.gain.setValueAtTime(0.0001, t);
    const pulse = dur / v.chug;
    for (let i = 0; i < v.chug; i++) {
      g.gain.exponentialRampToValueAtTime(v.gain, t + i * pulse + pulse * 0.2);
      g.gain.exponentialRampToValueAtTime(v.gain * 0.35, t + i * pulse + pulse * 0.85);
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);
    osc.connect(filter).connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.1);
  }

  /** The vehicle's own horn: two pitches at once. */
  horn(vehicle: VehicleId, long = false) {
    const s = getSettings();
    if (!s.sound || !s.engineSounds || !this.ctx || !this.master || this.ctx.state !== "running") return;
    this.master.gain.value = s.volume;
    const t = this.ctx.currentTime, d = long ? 0.55 : 0.22;
    for (const f of HORNS[vehicle]) this.tone(f, t, d, "square", 0.1);
  }

  // ---- music and ambience -----------------------------------------------------------------------------------

  private scheduleBar(mood: Mood, at: number) {
    const ctx = this.ctx!, bus = this.musicBus!;
    for (const n of musicBar(mood, this.bar, 11)) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = n.voice === "lead" ? "triangle" : "sine";
      osc.frequency.value = n.freq;
      const t0 = at + n.at;
      const attack = n.voice === "pad" ? 0.6 : n.voice === "bass" ? 0.08 : 0.03;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(n.gain, t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.dur);
      osc.connect(g).connect(bus);
      osc.start(t0);
      osc.stop(t0 + n.dur + 0.05);
    }
    this.bar += 1;
  }

  /** Start, stop or retune the music to match the settings; safe to call as often as you like. */
  syncMusic() {
    const s = getSettings();
    const want = s.sound && s.music;
    if (!this.ctx || !this.musicBus || this.ctx.state !== "running") return;
    this.applyRain();
    this.musicBus.gain.setTargetAtTime(want ? s.musicVolume * 0.9 : 0, this.ctx.currentTime, 0.4);
    if (!want) {
      if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; this.musicMood = null; }
      return;
    }
    if (this.musicMood !== s.mood) { this.musicMood = s.mood; this.nextBarAt = this.ctx.currentTime + 0.2; }
    if (this.musicTimer) return;
    this.musicTimer = setInterval(() => {
      const c = this.ctx;
      if (!c || c.state !== "running" || !this.musicMood) return;
      if (this.nextBarAt < c.currentTime) this.nextBarAt = c.currentTime + 0.1;
      while (this.nextBarAt < c.currentTime + 2) {
        this.scheduleBar(this.musicMood, this.nextBarAt);
        this.nextBarAt += barSeconds(this.musicMood);
      }
    }, 400);
  }

  /** Lets the music dip for a moment so a big sound is heard. */
  duck(seconds = 1.2) {
    const s = getSettings();
    if (!this.ctx || !this.musicBus || !s.music) return;
    const g = this.musicBus.gain, t = this.ctx.currentTime, level = s.musicVolume * 0.9;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(level * 0.35, t, 0.1);
    g.setTargetAtTime(level, t + seconds, 0.6);
  }

  private rainWanted = false;
  /** Soft rain behind everything. Remembered, so it starts once sound is allowed to play. */
  setRain(on: boolean) { this.rainWanted = on; this.applyRain(); }

  private applyRain() {
    const s = getSettings();
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const wanted = this.rainWanted && s.sound;
    if (!wanted) {
      if (this.rain) { const r = this.rain; r.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.3); setTimeout(() => { try { r.src.stop(); } catch { /* already stopped */ } }, 1200); this.rain = null; }
      return;
    }
    if (this.rain) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass"; filter.frequency.value = 3200; filter.Q.value = 0.5;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(0.05 * s.volume, ctx.currentTime, 0.8);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
    this.rain = { src, gain };
  }

  stopAmbience() {
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; this.musicMood = null; }
    if (this.musicBus && this.ctx) this.musicBus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
    this.rainWanted = false;
    this.applyRain();
  }

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
      case "squeal": this.tone(1400, t, 0.35, "sawtooth", 0.09, 700); this.burst(t, 0.35, 0.25, 4200); break;
      case "crash": this.burst(t, 0.3, 0.8, 500); this.tone(110, t, 0.25, "square", 0.25, 40); break;
    }
  }
}

export const sound = new SoundEngine();
