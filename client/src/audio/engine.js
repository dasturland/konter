// Web Audio engine: master chain, generated bunker reverb, ambient hum, positional routing.
// No audio files are used anywhere: every sound is synthesized from oscillators and noise.

const REVERB_SECONDS = 1.6;
const NOISE_SECONDS = 2;

/** Builds a decaying stereo noise impulse response that sounds like a concrete bunker. */
export function buildImpulse(ctx, seconds = REVERB_SECONDS, decay = 3.2) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let seed = 12345 + ch * 777;
    for (let i = 0; i < length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const n = (seed / 0xffffffff) * 2 - 1;
      data[i] = n * Math.pow(1 - i / length, decay);
    }
  }
  return buffer;
}

export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.master = null;
    this.dry = null;
    this.reverbSend = null;
    this.noiseBuffer = null;
    this.ambient = null;
    this.muted = settings.get('muted');
    this.volume = settings.get('volume');
    settings.onChange(() => {
      this.volume = settings.get('volume');
      this.muted = settings.get('muted');
      this.applyGain();
    });
  }

  get ready() {
    return this.ctx !== null;
  }

  /** Creates the context. Must be called from a user gesture the first time. */
  unlock() {
    if (!this.ctx) {
      const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!Ctor) return false;
      this.ctx = new Ctor({ latencyHint: 'interactive' });
      this.build();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return true;
  }

  build() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.dry = ctx.createGain();
    this.dry.connect(this.master);
    const convolver = ctx.createConvolver();
    convolver.buffer = buildImpulse(ctx);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.55;
    const wet = ctx.createGain();
    wet.gain.value = 0.7;
    this.reverbSend.connect(convolver);
    convolver.connect(wet);
    wet.connect(this.master);

    const len = Math.floor(ctx.sampleRate * NOISE_SECONDS);
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.applyGain();
    this.startAmbient();
  }

  applyGain() {
    if (!this.master) return;
    const target = this.muted ? 0 : this.volume;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.04);
  }

  toggleMute() {
    this.settings.set({ muted: !this.muted });
    return this.muted;
  }

  /** Low machinery hum with slow breathing, played quietly under everything. */
  startAmbient() {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0.05;
    out.connect(this.master);
    const nodes = [];
    for (const [f, g] of [[50, 0.8], [100.3, 0.35], [151, 0.12]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const gain = ctx.createGain();
      gain.gain.value = g;
      o.connect(gain);
      gain.connect(out);
      o.start();
      nodes.push(o);
    }
    const hiss = ctx.createBufferSource();
    hiss.buffer = this.noiseBuffer;
    hiss.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    const hissGain = ctx.createGain();
    hissGain.gain.value = 0.35;
    hiss.connect(lp);
    lp.connect(hissGain);
    hissGain.connect(out);
    hiss.start();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 120;
    lfo.connect(lfoGain);
    lfoGain.connect(lp.frequency);
    lfo.start();
    this.ambient = { out, nodes: [...nodes, hiss, lfo] };
  }

  setAmbientLevel(level) {
    if (this.ambient) this.ambient.out.gain.setTargetAtTime(level, this.ctx.currentTime, 0.5);
  }

  /** Updates the listener position and facing direction (yaw around the y axis). */
  setListener(x, y, z, yaw) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setValueAtTime(x, t);
      l.positionY.setValueAtTime(y, t);
      l.positionZ.setValueAtTime(z, t);
      l.forwardX.setValueAtTime(fx, t);
      l.forwardY.setValueAtTime(0, t);
      l.forwardZ.setValueAtTime(fz, t);
      l.upX.setValueAtTime(0, t);
      l.upY.setValueAtTime(1, t);
      l.upZ.setValueAtTime(0, t);
    } else if (l.setPosition) {
      l.setPosition(x, y, z);
      l.setOrientation(fx, 0, fz, 0, 1, 0);
    }
  }

  /**
   * Returns the node a sound should connect to.
   * @param {{pos?:number[], occluded?:boolean, reverb?:number}} opts world position makes the sound 3D.
   * Occluded sounds get a lowpass filter, as if heard through a wall.
   */
  route({ pos = null, occluded = false, reverb = 0.25 } = {}) {
    const ctx = this.ctx;
    const input = ctx.createGain();
    let tail = input;
    if (occluded) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 650;
      lp.Q.value = 0.5;
      tail.connect(lp);
      tail = lp;
    }
    if (pos) {
      const panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 4;
      panner.maxDistance = 120;
      panner.rolloffFactor = 1.3;
      if (panner.positionX) {
        panner.positionX.value = pos[0];
        panner.positionY.value = pos[1];
        panner.positionZ.value = pos[2];
      } else {
        panner.setPosition(pos[0], pos[1], pos[2]);
      }
      tail.connect(panner);
      tail = panner;
    }
    tail.connect(this.dry);
    if (reverb > 0) {
      const send = ctx.createGain();
      send.gain.value = reverb;
      tail.connect(send);
      send.connect(this.reverbSend);
    }
    return input;
  }

  /** Short oscillator note. */
  tone(out, { type = 'sine', freq, endFreq = null, start = 0, dur = 0.2, gain = 0.3, attack = 0.004, curve = 'exp' }) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + start;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (endFreq !== null) {
      if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + dur);
      else o.frequency.linearRampToValueAtTime(endFreq, t0 + dur);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(out);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  /** Filtered noise burst. */
  noise(out, { filter = 'lowpass', freq = 1000, endFreq = null, q = 0.8, start = 0, dur = 0.2, gain = 0.3, attack = 0.002 }) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + start;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t0);
    if (endFreq !== null) f.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(out);
    src.start(t0, Math.random() * (NOISE_SECONDS - 0.5));
    src.stop(t0 + dur + 0.05);
  }
}
