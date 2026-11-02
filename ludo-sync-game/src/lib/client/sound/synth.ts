/**
 * The building blocks every sound is made from. Each takes a `Bus` (an audio context, where to send the sound and an optional reverb send)
 * and a start time, so the same code plays live and renders offline for testing. Nothing here touches the page.
 */
export interface Bus { ctx: BaseAudioContext; out: AudioNode; wet: AudioNode | null }

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();
export const noiseBuffer = (ctx: BaseAudioContext): AudioBuffer => {
  let b = noiseBuffers.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = b.getChannelData(0);
    // pink-ish noise (a gentle low-pass of white) sounds more natural than raw white for impacts and swishes
    let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = last * 0.55 + w * 0.45; d[i] = last * 1.8; }
    noiseBuffers.set(ctx, b);
  }
  return b;
};

/** A reverb tail made of decaying noise: a small room that makes everything sound finished rather than dry. */
export const makeImpulse = (ctx: BaseAudioContext, seconds = 1.3, decay = 3.2): AudioBuffer => {
  const len = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) { const t = i / len; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (t < 0.01 ? t / 0.01 : 1); }
  }
  return buf;
};

export const shift = (f: number, semitones: number) => f * Math.pow(2, semitones / 12);
const jitter = (cents = 6) => (Math.random() * 2 - 1) * cents;

interface Place { pan?: number; wet?: number }
/** Connects a node to the bus: optionally panned left or right, and optionally a share sent to the reverb. */
const route = (b: Bus, node: AudioNode, p: Place) => {
  let tail: AudioNode = node;
  if (p.pan && "createStereoPanner" in b.ctx) { const pn = b.ctx.createStereoPanner(); pn.pan.value = Math.max(-1, Math.min(1, p.pan)); tail.connect(pn); tail = pn; }
  tail.connect(b.out);
  if (p.wet && b.wet) { const s = b.ctx.createGain(); s.gain.value = p.wet; tail.connect(s); s.connect(b.wet); }
};

export interface ToneOpts extends Place {
  f: number; t: number; dur: number; type?: OscillatorType; gain?: number; slideTo?: number; attack?: number; lp?: number; detune?: number;
  /** Pitch wobble: rate in Hz, depth in cents. */
  vibrato?: { rate: number; depth: number };
  /** Hold the level for this long before it dies away, for pads and brass. */
  hold?: number;
}

/** A single note with a proper envelope, an optional filter and optional vibrato. */
export const tone = (b: Bus, o: ToneOpts) => {
  const ctx = b.ctx, osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.f, o.t);
  if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.slideTo), o.t + o.dur);
  osc.detune.value = (o.detune ?? 0) + jitter(4);
  const peak = Math.max(0.0002, o.gain ?? 0.2), atk = o.attack ?? Math.min(0.012, o.dur / 4), hold = o.hold ?? 0;
  g.gain.setValueAtTime(0.0001, o.t);
  g.gain.exponentialRampToValueAtTime(peak, o.t + atk);
  if (hold > 0) g.gain.setValueAtTime(peak, o.t + atk + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, o.t + atk + hold + Math.max(0.01, o.dur - atk - hold));
  let node: AudioNode = osc;
  if (o.lp) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = o.lp; osc.connect(f); node = f; }
  if (o.vibrato) {
    const lfo = ctx.createOscillator(), depth = ctx.createGain();
    lfo.frequency.value = o.vibrato.rate; depth.gain.value = o.vibrato.depth;
    lfo.connect(depth).connect(osc.detune);
    lfo.start(o.t); lfo.stop(o.t + o.dur + 0.05);
  }
  node.connect(g);
  route(b, g, o);
  osc.start(o.t);
  osc.stop(o.t + o.dur + 0.05);
};

export interface BellOpts extends Place { f: number; t: number; dur?: number; gain?: number; ratio?: number; index?: number }
/** A struck bell or glass tone made by frequency modulation: bright at first, then mellowing as it rings. */
export const bell = (b: Bus, o: BellOpts) => {
  const ctx = b.ctx, dur = o.dur ?? 0.7, car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
  car.type = "sine"; mod.type = "sine";
  car.frequency.value = o.f; mod.frequency.value = o.f * (o.ratio ?? 3.5);
  mg.gain.setValueAtTime(o.f * (o.index ?? 2.4), o.t);
  mg.gain.exponentialRampToValueAtTime(Math.max(0.01, o.f * 0.05), o.t + dur * 0.7);
  mod.connect(mg).connect(car.frequency);
  const peak = Math.max(0.0002, o.gain ?? 0.2);
  g.gain.setValueAtTime(0.0001, o.t);
  g.gain.exponentialRampToValueAtTime(peak, o.t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, o.t + dur);
  car.connect(g);
  route(b, g, { pan: o.pan, wet: o.wet ?? 0.25 });
  car.start(o.t); mod.start(o.t); car.stop(o.t + dur + 0.05); mod.stop(o.t + dur + 0.05);
};

export interface NoiseOpts extends Place { t: number; dur: number; gain?: number; type?: BiquadFilterType; f?: number; q?: number; sweepTo?: number; attack?: number }
/** Filtered noise: the body of swishes, clicks, paper, wind and cymbals. `sweepTo` glides the filter for whooshes. */
export const noise = (b: Bus, o: NoiseOpts) => {
  const ctx = b.ctx, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noiseBuffer(ctx);
  f.type = o.type ?? "bandpass"; f.Q.value = o.q ?? 0.8;
  f.frequency.setValueAtTime(o.f ?? 2000, o.t);
  if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.sweepTo), o.t + o.dur);
  const atk = o.attack ?? Math.min(0.006, o.dur / 3), peak = Math.max(0.0002, o.gain ?? 0.3);
  g.gain.setValueAtTime(0.0001, o.t);
  g.gain.exponentialRampToValueAtTime(peak, o.t + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, o.t + o.dur);
  src.connect(f).connect(g);
  route(b, g, o);
  src.start(o.t, Math.random() * 1.2);
  src.stop(o.t + o.dur + 0.03);
};

/** A low body for impacts: a sine that drops quickly in pitch. */
export const thump = (b: Bus, o: Place & { t: number; f0?: number; f1?: number; dur?: number; gain?: number }) =>
  tone(b, { f: o.f0 ?? 160, slideTo: o.f1 ?? 45, t: o.t, dur: o.dur ?? 0.16, gain: o.gain ?? 0.4, type: "sine", attack: 0.003, pan: o.pan, wet: o.wet });

/** Brass-like stab: detuned saws through a filter that opens as it sounds. */
export const brass = (b: Bus, o: Place & { f: number; t: number; dur: number; gain?: number }) => {
  for (const d of [-7, 0, 7]) tone(b, { f: o.f, t: o.t, dur: o.dur, gain: (o.gain ?? 0.12) / 2, type: "sawtooth", detune: d, lp: Math.min(5000, o.f * 6), attack: 0.03, hold: o.dur * 0.35, pan: o.pan, wet: o.wet ?? 0.3 });
};

/** A shower of high bell tones, for rewards. */
export const sparkle = (b: Bus, t: number, base = 1800, count = 6, spread = 0.07, gain = 0.07, pan = 0) => {
  for (let i = 0; i < count; i++) bell(b, { f: base * (1 + Math.floor(Math.random() * 5) * 0.25) * (1 + i * 0.03), t: t + i * spread + Math.random() * 0.02, dur: 0.35, gain: gain * (1 - i / (count * 1.3)), ratio: 2.76, index: 1.2, pan: pan + (Math.random() - 0.5) * 0.6, wet: 0.4 });
};

/** Major, minor and friends as semitone offsets, for arpeggios and chords. */
export const CHORDS = { major: [0, 4, 7, 12], minor: [0, 3, 7, 12], maj7: [0, 4, 7, 11, 14], sus: [0, 5, 7, 12], dim: [0, 3, 6, 9] } as const;
