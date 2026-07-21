"use client";

/**
 * Procedural WebAudio engine — no audio files.
 * Ported from the 2D concept (pad chords, wind, per-zone lowpass, sfx) and
 * expanded with wing whooshes, dragon-fire roar and thunder.
 */
type Sfx = "chime" | "open" | "rumble" | "tick" | "collect";

// Open-fifth drones (root, fifth, octave, twelfth) — modal, never clashing
const PAD_CHORDS: [number, number, number, number][] = [
  [110, 164.81, 220, 329.63], // A
  [98, 146.83, 196, 293.66],  // G
  [130.81, 196, 261.63, 392], // C
  [87.31, 130.81, 174.61, 261.63], // F
];

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private filt: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private fireGain: GainNode | null = null;
  private padGain: GainNode | null = null;
  private padOscs: OscillatorNode[] = [];
  private padTimer: number | null = null;
  private muted = false;

  ensure(muted: boolean) {
    this.muted = muted;
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      const master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);

      // ── modal pad: not a constant drone — it swells in now and then like a
      // distant score, then fades to true silence ──
      const pad = ctx.createGain();
      pad.gain.value = 0;
      const filt = ctx.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.value = 620;
      pad.connect(filt);
      filt.connect(master);
      const voiceTypes: OscillatorType[] = ["triangle", "sine", "sine", "sine"];
      const voiceGains = [0.35, 0.3, 0.18, 0.08];
      const detunes = [-3, 2, -2, 3]; // cents — a little warmth between voices
      this.padOscs = voiceTypes.map((t, i) => {
        const o = ctx.createOscillator();
        o.type = t;
        o.frequency.value = PAD_CHORDS[0][i];
        o.detune.value = detunes[i];
        const og = ctx.createGain();
        og.gain.value = voiceGains[i];
        o.connect(og);
        og.connect(pad);
        o.start();
        return o;
      });
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07;
      const lfoG = ctx.createGain();
      lfoG.gain.value = 180;
      lfo.connect(lfoG);
      lfoG.connect(filt.frequency);
      lfo.start();
      this.padGain = pad;
      this.schedulePadSwell(2.5); // one gentle swell as the journey opens

      // ── wind (looped noise through bandpass) ──
      const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const nd = nb.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      const ws = ctx.createBufferSource();
      ws.buffer = nb;
      ws.loop = true;
      const wf = ctx.createBiquadFilter();
      wf.type = "bandpass";
      wf.frequency.value = 480;
      wf.Q.value = 0.6;
      const windGain = ctx.createGain();
      windGain.gain.value = 0;
      ws.connect(wf);
      wf.connect(windGain);
      windGain.connect(master);
      ws.start();

      // ── dragon-fire roar (gated noise through lowpass) ──
      const fs = ctx.createBufferSource();
      fs.buffer = nb;
      fs.loop = true;
      fs.playbackRate.value = 0.6;
      const ff = ctx.createBiquadFilter();
      ff.type = "lowpass";
      ff.frequency.value = 900;
      const fireGain = ctx.createGain();
      fireGain.gain.value = 0;
      fs.connect(ff);
      ff.connect(fireGain);
      fireGain.connect(master);
      fs.start();

      this.ctx = ctx;
      this.master = master;
      this.filt = filt;
      this.windGain = windGain;
      this.fireGain = fireGain;
    } catch {
      /* audio unavailable — stay silent */
    }
  }

  /** Swell the pad in after `delay`s, hold, fade to silence, then reschedule. */
  private schedulePadSwell(delay: number) {
    if (this.padTimer !== null) window.clearTimeout(this.padTimer);
    this.padTimer = window.setTimeout(() => {
      const ctx = this.ctx;
      const pad = this.padGain;
      if (!ctx || !pad) return;
      // retune to a fresh chord while silent
      const chord = PAD_CHORDS[Math.floor(Math.random() * PAD_CHORDS.length)];
      this.padOscs.forEach((o, i) => o.frequency.setValueAtTime(chord[i], ctx.currentTime));
      const t = ctx.currentTime;
      const hold = 6 + Math.random() * 6;
      pad.gain.setTargetAtTime(0.04, t, 3);            // slow breath in
      pad.gain.setTargetAtTime(0, t + hold, 4.5);      // slower breath out
      // next swell after a long quiet gap
      this.schedulePadSwell(hold + 18 + Math.random() * 26);
    }, delay * 1000);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (!muted) this.ensure(false);
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  /** Lower the procedural soundscape while a voice line speaks. */
  duck(on: boolean) {
    if (!this.ctx || !this.master) return;
    const target = this.muted ? 0 : on ? 0.13 : 0.5;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.25);
  }

  /** Per-frame wind loudness from flight speed (0..1) + mordor moan. */
  wind(speed01: number, mordor: boolean) {
    if (!this.ctx || !this.windGain) return;
    const target = this.muted ? 0 : Math.min(speed01 * 0.09, 0.09) + (mordor && !this.muted ? 0.025 : 0);
    this.windGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.4);
  }

  fire(on: boolean) {
    if (!this.ctx || !this.fireGain) return;
    this.fireGain.gain.setTargetAtTime(on && !this.muted ? 0.14 : 0, this.ctx.currentTime, on ? 0.08 : 0.25);
  }

  /** Zone ambience — lowpass color per land, as in the concept. */
  setZone(zone: string) {
    if (!this.ctx || !this.filt) return;
    const f: Record<string, number> = { clear: 620, shire: 720, elf: 950, dwarf: 520, gondor: 880, mordor: 300 };
    this.filt.frequency.linearRampToValueAtTime(f[zone] ?? 620, this.ctx.currentTime + 1.8);
  }

  /** Wing-beat whoosh, intensity 0..1. */
  whoosh(intensity: number) {
    if (!this.ctx || !this.master || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    const len = Math.floor(ctx.sampleRate * 0.4);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(220, t);
    f.frequency.exponentialRampToValueAtTime(90, t + 0.35);
    f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.05 * intensity, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
  }

  /** The Windlord's cry — swept piercing call with a breathy tail. */
  screech() {
    if (!this.ctx || !this.master || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(2300, t);
    o.frequency.exponentialRampToValueAtTime(1500, t + 0.16);
    o.frequency.exponentialRampToValueAtTime(720, t + 0.55);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(2100, t);
    bp.frequency.exponentialRampToValueAtTime(900, t + 0.55);
    bp.Q.value = 3.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.62);
    o.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.7);
    // breathy rasp under the call
    const len = Math.floor(ctx.sampleRate * 0.35);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2400;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.06, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
    src.connect(hp);
    hp.connect(ng);
    ng.connect(this.master);
    src.start(t + 0.02);
  }

  thunder() {
    if (!this.ctx || !this.master || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 1.6);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const k = i / len;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - k, 2.2) * (0.4 + 0.6 * Math.random());
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(240, t);
    f.frequency.exponentialRampToValueAtTime(70, t + 1.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.55);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
    this.sfx("rumble");
  }

  /** Decode a fetched clip on the (gesture-unlocked) context. Null = no audio. */
  async decodeClip(data: ArrayBuffer): Promise<AudioBuffer | null> {
    this.ensure(this.muted);
    if (!this.ctx) return null;
    return this.ctx.decodeAudioData(data);
  }

  /**
   * Play a decoded voice clip. WebAudio, not an <audio> element: HTMLMedia
   * playback started outside a user gesture is blocked on iOS, while the
   * context here was unlocked by the book-cover tap. Connects straight to the
   * destination so duck() lowering the master bus doesn't duck the voice too.
   * Returns a stop function, or null if audio is unavailable.
   */
  playClip(buffer: AudioBuffer, volume: number, onEnded: () => void): (() => void) | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = volume;
    src.connect(g);
    g.connect(ctx.destination);
    src.onended = onEnded;
    src.start();
    return () => {
      src.onended = null;
      try {
        src.stop();
      } catch {
        /* already ended */
      }
    };
  }

  sfx(kind: Sfx) {
    if (this.muted) return;
    this.ensure(false);
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(this.master);
    if (kind === "chime") {
      o.type = "sine";
      o.frequency.setValueAtTime(660, t);
      o.frequency.exponentialRampToValueAtTime(990, t + 0.18);
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    } else if (kind === "open") {
      o.type = "triangle";
      o.frequency.setValueAtTime(196, t);
      o.frequency.exponentialRampToValueAtTime(392, t + 0.3);
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    } else if (kind === "rumble") {
      o.type = "sine";
      o.frequency.setValueAtTime(58, t);
      o.frequency.exponentialRampToValueAtTime(34, t + 1.2);
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
    } else if (kind === "collect") {
      o.type = "sine";
      o.frequency.setValueAtTime(520, t);
      o.frequency.exponentialRampToValueAtTime(1240, t + 0.22);
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    } else {
      o.type = "sine";
      o.frequency.setValueAtTime(440, t);
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    }
    o.start(t);
    o.stop(t + 1.6);
  }
}

export const audio = new AudioEngine();
