/**
 * STARWING procedural synth engine.
 *
 * Every sound is described by a small "voice descriptor" (pitch, envelope,
 * harmonic recipe). In real mode the descriptor is rendered with WebAudio
 * nodes; in every mode it is also kept in a ledger so the visualiser can
 * synthesise a spectrum + waveform from the same data. That means the piece
 * shows exactly what it plays, even in the muted headless harness.
 */

export const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Harmonic recipes (relative amplitudes of partials 1..N) --------------------
const H = {
  saw: [1, 0.5, 0.33, 0.25, 0.2, 0.16, 0.14, 0.12, 0.1, 0.08],
  square: [1, 0, 0.33, 0, 0.2, 0, 0.14, 0, 0.11, 0],
  tri: [1, 0, 0.11, 0, 0.04, 0, 0.02, 0, 0.01, 0],
  sine: [1],
  brass: [0.8, 1, 0.8, 0.7, 0.55, 0.4, 0.3, 0.22, 0.15, 0.1],
  strings: [1, 0.55, 0.4, 0.3, 0.22, 0.15, 0.1, 0.07],
  pluck: [1, 0.6, 0.25, 0.12, 0.05],
  bass: [1, 0.7, 0.3, 0.15, 0.08],
};

// Instrument definitions: how to render a note ------------------------------
const INSTRUMENTS = {
  brass: { harm: H.brass, a: 0.045, d: 0.25, s: 0.75, r: 0.18, gain: 0.16, band: [400, 3400] },
  brassLow: { harm: H.brass, a: 0.06, d: 0.3, s: 0.8, r: 0.22, gain: 0.18, band: [200, 1800] },
  strings: { harm: H.strings, a: 0.35, d: 0.6, s: 0.85, r: 0.6, gain: 0.05, band: [250, 2600] },
  stringsHi: { harm: H.strings, a: 0.4, d: 0.6, s: 0.8, r: 0.7, gain: 0.03, band: [400, 4000] },
  ostinato: { harm: H.strings, a: 0.012, d: 0.12, s: 0.3, r: 0.08, gain: 0.07, band: [300, 3200] },
  pluck: { harm: H.pluck, a: 0.004, d: 0.22, s: 0.0, r: 0.1, gain: 0.09, band: [500, 5000] },
  bass: { harm: H.bass, a: 0.01, d: 0.2, s: 0.7, r: 0.12, gain: 0.22, band: [40, 700] },
  timpani: { harm: H.sine, a: 0.003, d: 0.55, s: 0.0, r: 0.3, gain: 0.55, sweep: 1.6, noise: [60, 260, 0.15, 0.08] },
  lead: { harm: H.square, a: 0.02, d: 0.2, s: 0.7, r: 0.15, gain: 0.08, band: [300, 3000] },
};

// -----------------------------------------------------------------------------

export function createAudio(ctx, opts = {}) {
  const bus = ctx?.audio ?? null;
  const ac = bus?.ensure?.() ?? null;   // null in muted / headless mode
  const real = !!ac;

  // ---- clock -----------------------------------------------------------------
  // Silent mode: in a fixed-step harness the clock follows dt (deterministic); in realtime it follows the wall
  // clock so a slow renderer (SwiftShader at 2 fps) still hears/plays the music at tempo.
  let simTime = 0, wallLast = -1;
  const fixedStep = !!ctx?.engine?.fixedStep;
  const now = () => (real ? ac.currentTime : simTime);

  // ---- graph -----------------------------------------------------------------
  let sfxIn, duckGain, verb, verbSend, comp, analyser, freqData, timeData;
  const musicIn = [null, null];              // two music buses so songs can crossfade
  const busLevel = [0.6, 0.6];               // JS-side mirror of bus gain for the simulated analysis
  if (real) {
    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.18;
    analyser = ac.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.72;
    freqData = new Uint8Array(analyser.frequencyBinCount);
    timeData = new Uint8Array(1024);
    comp.connect(analyser);
    analyser.connect(bus.master);

    duckGain = ac.createGain(); duckGain.gain.value = 1;
    for (let i = 0; i < 2; i++) { musicIn[i] = ac.createGain(); musicIn[i].gain.value = 0.6; musicIn[i].connect(duckGain); }
    duckGain.connect(comp);
    sfxIn = ac.createGain(); sfxIn.gain.value = 0.9;
    sfxIn.connect(comp);

    // procedural hall reverb
    verb = ac.createConvolver();
    verb.buffer = makeImpulse(ac, 2.4, 2.6);
    verbSend = ac.createGain(); verbSend.gain.value = 0.35;
    verbSend.connect(verb);
    const verbHP = ac.createBiquadFilter(); verbHP.type = 'highpass'; verbHP.frequency.value = 180;
    verb.connect(verbHP).connect(comp);
  }

  // ---- ledger for visuals ------------------------------------------------------
  const voices = [];             // active descriptors
  const hits = [];               // recent transient events {t, kind, strength}
  const listeners = new Set();

  function ledger(v) {
    voices.push(v);
    if (voices.length > 160) voices.splice(0, voices.length - 160);
  }
  function hit(kind, strength = 1, t = now()) {
    hits.push({ t, kind, strength });
    if (hits.length > 64) hits.shift();
    for (const l of listeners) l(kind, strength, t);
  }

  // ---- low-level renderers -----------------------------------------------------
  /** Tonal note. f0 -> f1 sweep over the note length (f1 optional). */
  function note({ inst, midi, f0, f1, t = now(), dur = 0.5, vel = 1, pan = 0, out = 'music', bus = 0, detune = 7, unison = 3, vib = 0 }) {
    const I = typeof inst === 'string' ? INSTRUMENTS[inst] : inst;
    const freq = f0 ?? midiHz(midi);
    const fEnd = f1 ?? freq;
    const rel = I.r;
    const g = I.gain * vel;
    ledger({ t0: t, t1: t + dur + rel, f: freq, f1: fEnd, a: I.a, d: I.d, s: I.s, r: rel, dur, gain: g, harm: I.harm, kind: inst, out, bus });
    if (!real) return;
    const dest = out === 'music' ? musicIn[bus] : sfxIn;
    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(g, t + I.a);
    env.gain.setTargetAtTime(g * Math.max(I.s, 0.0001), t + I.a, I.d / 3);
    const relStart = Math.max(t + I.a, t + dur);
    env.gain.setTargetAtTime(0.0001, relStart, rel / 4);
    const stopAt = relStart + rel + 0.05;

    let chain = env;
    if (I.band) {
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.8;
      lp.frequency.setValueAtTime(I.band[0], t);
      lp.frequency.linearRampToValueAtTime(I.band[1], t + I.a + I.d * 0.6);
      lp.frequency.setTargetAtTime(I.band[0] * 1.5, relStart, rel / 2);
      env.connect(lp); chain = lp;
    }
    const p = ac.createStereoPanner ? ac.createStereoPanner() : null;
    if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); chain.connect(p); chain = p; }
    chain.connect(dest);
    if (out === 'music' && I !== INSTRUMENTS.timpani) chain.connect(verbSend);
    if (out === 'sfx') { const s = ac.createGain(); s.gain.value = 0.4; chain.connect(s).connect(verbSend); }

    const isSine = I.harm === H.sine;
    const n = isSine ? 1 : unison;
    const type = I.harm === H.square ? 'square' : I.harm === H.tri || I.harm === H.pluck ? 'triangle' : isSine ? 'sine' : 'sawtooth';
    const sweep = I.sweep ?? 1;
    for (let i = 0; i < n; i++) {
      const o = ac.createOscillator(); o.type = type;
      const det = n > 1 ? detune * (i - (n - 1) / 2) : 0;
      o.detune.value = det;
      o.frequency.setValueAtTime(freq * sweep, t);
      if (sweep !== 1) o.frequency.exponentialRampToValueAtTime(freq, t + 0.05);
      else if (fEnd !== freq) o.frequency.exponentialRampToValueAtTime(Math.max(1, fEnd), t + dur);
      if (vib > 0) {
        const lfo = ac.createOscillator(); lfo.frequency.value = 5.2;
        const lg = ac.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(vib, t + 0.35);
        lfo.connect(lg).connect(o.detune); lfo.start(t); lfo.stop(stopAt);
      }
      const og = ac.createGain(); og.gain.value = 1 / Math.sqrt(n);
      o.connect(og).connect(env);
      o.start(t); o.stop(stopAt);
    }
    // sub-octave body for brass / bass
    if (I === INSTRUMENTS.brassLow || I === INSTRUMENTS.bass) {
      const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = freq / 2;
      const og = ac.createGain(); og.gain.value = 0.45; o.connect(og).connect(env); o.start(t); o.stop(stopAt);
    }
    if (I.noise) noise({ t, dur: I.noise[3] + 0.1, lo: I.noise[0], hi: I.noise[1], gain: I.noise[2] * vel, out, bus, rec: false });
  }

  /** Filtered noise burst. lo/hi -> band-pass range, sweeping to lo1/hi1 if given. */
  function noise({ t = now(), dur = 0.3, lo = 200, hi = 2000, lo1, hi1, gain = 0.3, a = 0.005, out = 'sfx', bus = 0, pan = 0, rec = true, q = 0.7 }) {
    if (rec) ledger({ t0: t, t1: t + dur, a, d: dur * 0.4, s: 0.35, r: dur * 0.5, dur: dur * 0.5, gain, noise: true, lo, hi, lo1: lo1 ?? lo, hi1: hi1 ?? hi, out, bus });
    if (!real) return;
    const len = Math.max(1, Math.floor(ac.sampleRate * (dur + 0.05)));
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource(); src.buffer = buf;
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.Q.value = q;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = q;
    hp.frequency.setValueAtTime(lo, t); hp.frequency.exponentialRampToValueAtTime(Math.max(20, lo1 ?? lo), t + dur);
    lp.frequency.setValueAtTime(hi, t); lp.frequency.exponentialRampToValueAtTime(Math.max(30, hi1 ?? hi), t + dur);
    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(gain, t + a);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let chain = env;
    if (ac.createStereoPanner && pan) { const p = ac.createStereoPanner(); p.pan.value = pan; env.connect(p); chain = p; }
    chain.connect(out === 'music' ? musicIn[bus] : sfxIn);
    if (out === 'sfx' && dur > 0.15) { const s = ac.createGain(); s.gain.value = 0.3; chain.connect(s).connect(verbSend); }
    src.start(t); src.stop(t + dur + 0.05);
  }

  // ---- ducking -------------------------------------------------------------------
  let duckLevel = 1, duckTarget = 1, duckHold = 0;
  function duck(amount = 0.5, hold = 0.25) {
    duckTarget = Math.min(duckTarget, 1 - amount);
    duckHold = Math.max(duckHold, hold);
  }

  // ---- visual analysis --------------------------------------------------------------
  const BINS = 96;
  const F_LO = 40, F_HI = 12000;
  const binFreq = new Float32Array(BINS);
  for (let i = 0; i < BINS; i++) binFreq[i] = F_LO * Math.pow(F_HI / F_LO, i / (BINS - 1));
  const binOf = (f) => Math.log(f / F_LO) / Math.log(F_HI / F_LO) * (BINS - 1);
  const spectrum = new Float32Array(BINS);
  const spectrumRaw = new Float32Array(BINS);
  const WAVE_N = 256;
  const wave = new Float32Array(WAVE_N);
  let energy = 0, bassEnergy = 0, hiEnergy = 0;

  function envAt(v, t) {
    const x = t - v.t0;
    if (x < 0) return 0;
    if (x < v.a) return x / v.a;
    const relStart = Math.max(v.a, v.dur);
    if (x >= relStart) {
      const lvl = v.s + (1 - v.s) * Math.exp(-(relStart - v.a) / (v.d / 3));
      return lvl * Math.exp(-(x - relStart) / (v.r / 4));
    }
    return v.s + (1 - v.s) * Math.exp(-(x - v.a) / (v.d / 3));
  }

  function analyse(t) {
    spectrumRaw.fill(0);
    // prune ledger
    for (let i = voices.length - 1; i >= 0; i--) if (t > voices[i].t1 + 0.2) voices.splice(i, 1);
    let w0 = 0;
    for (const v of voices) {
      const e = envAt(v, t) * v.gain * (v.out === 'music' ? busLevel[v.bus] / 0.6 : 1);
      if (e < 1e-4) continue;
      if (v.noise) {
        const k = Math.min(1, (t - v.t0) / Math.max(0.01, v.dur));
        const lo = v.lo + (v.lo1 - v.lo) * k, hi = v.hi + (v.hi1 - v.hi) * k;
        const b0 = binOf(Math.max(F_LO, lo)), b1 = binOf(Math.min(F_HI, Math.max(lo * 1.2, hi)));
        const amp = e * 1.4;
        for (let b = Math.max(0, Math.floor(b0) - 2); b <= Math.min(BINS - 1, Math.ceil(b1) + 2); b++) {
          const edge = b < b0 ? Math.exp(-(b0 - b) * 0.8) : b > b1 ? Math.exp(-(b - b1) * 0.8) : 1;
          spectrumRaw[b] += amp * edge * (0.85 + 0.3 * Math.sin(b * 12.9898 + t * 37));
        }
      } else {
        const k = Math.min(1, (t - v.t0) / Math.max(0.01, v.dur));
        const f = v.f * Math.pow(v.f1 / v.f, k);
        const ph = (t - v.t0) * f * Math.PI * 2;
        for (let h = 0; h < v.harm.length; h++) {
          const fh = f * (h + 1);
          if (fh > F_HI) break;
          const amp = e * v.harm[h] * 2.2;
          const b = binOf(Math.max(F_LO, fh));
          const bi = Math.floor(b), fr = b - bi;
          if (bi >= 0 && bi < BINS) spectrumRaw[bi] += amp * (1 - fr);
          if (bi + 1 < BINS) spectrumRaw[bi + 1] += amp * fr;
          if (bi - 1 >= 0) spectrumRaw[bi - 1] += amp * 0.25;
          if (bi + 2 < BINS) spectrumRaw[bi + 2] += amp * 0.25;
          if (h < 3) w0 += amp;
        }
      }
    }
    // waveform: sum of the strongest partials, rendered as a periodic shape
    wave.fill(0);
    let count = 0;
    for (const v of voices) {
      if (v.noise || count > 14) continue;
      const e = envAt(v, t) * v.gain * (v.out === 'music' ? busLevel[v.bus] / 0.6 : 1); if (e < 2e-3) continue;
      count++;
      const cyc = 2 + (v.f < 200 ? 0 : 1);
      const phase = (t - v.t0) * v.f * 6.283;
      for (let i = 0; i < WAVE_N; i++) {
        const x = (i / WAVE_N) * cyc * 6.283 + phase;
        let s = 0;
        for (let h = 0; h < Math.min(5, v.harm.length); h++) s += v.harm[h] * Math.sin(x * (h + 1));
        wave[i] += s * e * 3;
      }
    }
    // if real audio is available, blend in the analyser so what you hear == what you see
    if (real && ac.state === 'running') {
      analyser.getByteFrequencyData(freqData);
      analyser.getByteTimeDomainData(timeData);
      const nyq = ac.sampleRate / 2;
      for (let i = 0; i < BINS; i++) {
        const f = binFreq[i];
        const idx = Math.min(freqData.length - 1, Math.round(f / nyq * freqData.length));
        const v = freqData[idx] / 255;
        spectrumRaw[i] = Math.max(spectrumRaw[i] * 0.5, v * v * 1.6);
      }
      for (let i = 0; i < WAVE_N; i++) wave[i] = wave[i] * 0.4 + (timeData[Math.floor(i / WAVE_N * timeData.length)] / 128 - 1) * 2.4;
    }
    let en = 0, be = 0, he = 0;
    for (let i = 0; i < BINS; i++) {
      const v = Math.min(1.6, spectrumRaw[i]);
      spectrum[i] = v > spectrum[i] ? spectrum[i] + (v - spectrum[i]) * 0.55 : spectrum[i] + (v - spectrum[i]) * 0.16;
      en += spectrum[i];
      if (i < BINS * 0.22) be += spectrum[i]; else if (i > BINS * 0.6) he += spectrum[i];
    }
    energy = en / BINS; bassEnergy = be / (BINS * 0.22); hiEnergy = he / (BINS * 0.4);
  }

  // ---- update (called every frame by the piece) -------------------------------------
  let musicTarget = [0.6, 0.6];
  function update(dt) {
    if (!real) {
      if (fixedStep) simTime += dt;
      else { const w = performance.now() / 1000; simTime += wallLast < 0 ? dt : Math.min(1, w - wallLast); wallLast = w; }
    }
    const t = now();
    // mirror the bus gain ramps for the simulated analysis (same 0.05s time constant as setTargetAtTime)
    for (let i = 0; i < 2; i++) busLevel[i] += (musicTarget[i] - busLevel[i]) * Math.min(1, dt / 0.08);
    // ducking envelope
    if (duckHold > 0) duckHold -= dt; else duckTarget = 1;
    duckLevel += (duckTarget - duckLevel) * (duckTarget < duckLevel ? Math.min(1, dt * 30) : Math.min(1, dt * 6));
    if (real) duckGain.gain.setTargetAtTime(duckLevel, t, 0.02);
    analyse(t);
  }

  return {
    real, ac, now, note, noise, hit, duck, update, ledger,
    voices, hits, spectrum, wave, binFreq, BINS, WAVE_N,
    get energy() { return energy; }, get bass() { return bassEnergy; }, get high() { return hiEnergy; },
    get duckLevel() { return duckLevel; },
    onHit(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    setMusicGain(v, bus = 0, tc = 0.05) { musicTarget[bus] = v; if (real) musicIn[bus].gain.setTargetAtTime(v, now(), tc); },
    resume() { if (real && ac.state !== 'running') ac.resume(); },
  };
}

function makeImpulse(ac, seconds, decay) {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const x = i / len;
      // early reflections + diffuse tail
      const early = i < ac.sampleRate * 0.08 && Math.random() < 0.004 ? 0.8 : 0;
      d[i] = ((Math.random() * 2 - 1) * Math.pow(1 - x, decay) + early) * (1 - Math.exp(-i / 200));
    }
  }
  return buf;
}
