/**
 * AudioBus: lazily-created WebAudio context with master/music/sfx gains.
 * Pieces synthesize sounds procedurally (no asset downloads). Safe to call
 * before user gesture — playback simply starts once the context resumes.
 */
export class AudioBus {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.music = null;
    this.sfx = null;
    this.muted = new URLSearchParams(location.search).has('mute');
    const resume = () => { this.ensure(); this.ctx?.resume(); };
    addEventListener('pointerdown', resume, { once: false });
    addEventListener('keydown', resume, { once: false });
  }

  ensure() {
    if (this.ctx || this.muted) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(this.ctx.destination);
    this.music = this.ctx.createGain(); this.music.gain.value = 0.5; this.music.connect(this.master);
    this.sfx = this.ctx.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
    return this.ctx;
  }

  get now() { return this.ctx?.currentTime ?? 0; }

  /** Quick synth blip: type, freq sweep, duration. Returns nothing; fire-and-forget. */
  tone({ type = 'square', f0 = 440, f1 = f0, dur = 0.1, gain = 0.2, bus = 'sfx', attack = 0.005 } = {}) {
    if (!this.ensure()) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this[bus]);
    o.start(t); o.stop(t + dur + 0.02);
  }

  /** Filtered noise burst (explosions, thrusters). */
  noise({ dur = 0.4, gain = 0.3, cutoff = 800, q = 0.7, bus = 'sfx' } = {}) {
    if (!this.ensure()) return;
    const c = this.ctx, t = c.currentTime;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = c.createBufferSource(); src.buffer = buf;
    const flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = cutoff; flt.Q.value = q;
    const g = c.createGain(); g.gain.value = gain;
    src.connect(flt).connect(g).connect(this[bus]);
    src.start(t);
  }

  update(dt) {}
}
