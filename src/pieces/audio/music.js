/**
 * Songs + sequencer. Songs are pattern data (beats, midi, duration, velocity)
 * per instrument track; the sequencer streams them into the synth with a
 * lookahead so timing is sample-accurate in real mode and deterministic in
 * silent mode.
 */
import { midiHz } from './synth.js';

// ---- helpers to write music compactly --------------------------------------------------
const N = (beat, midi, dur = 1, vel = 1) => [beat, midi, dur, vel];
const CH = { Dm: [62, 65, 69], Bb: [58, 62, 65], F: [65, 69, 72], C: [60, 64, 67], Gm: [55, 58, 62], A: [57, 61, 64],
  Em: [64, 67, 71], Am: [57, 60, 64], B: [59, 63, 66], D: [62, 66, 69], G: [55, 59, 62], Cm: [60, 63, 67] };

/** Chord progression -> pad track (one held triad per bar) */
function pads(prog, beatsPerBar, oct = 0, vel = 1) {
  const out = [];
  prog.forEach((c, bar) => CH[c].forEach((m, i) => out.push(N(bar * beatsPerBar, m + oct, beatsPerBar - 0.05, vel * (i === 0 ? 1 : 0.8)))));
  return out;
}
/** Chord progression -> root bass line with a rhythmic pattern (offsets within the bar) */
function bassLine(prog, beatsPerBar, pattern, oct = -12) {
  const out = [];
  prog.forEach((c, bar) => pattern.forEach(([off, dur, jump = 0, vel = 1]) => out.push(N(bar * beatsPerBar + off, CH[c][0] + oct + jump, dur, vel))));
  return out;
}
/** Chord progression -> 16th arpeggio (up-down) */
function arps(prog, beatsPerBar, oct = 12, shape = [0, 1, 2, 1, 0, 2, 1, 2]) {
  const out = [];
  prog.forEach((c, bar) => {
    const tones = CH[c];
    for (let s = 0; s < beatsPerBar * 4; s++) {
      const deg = shape[s % shape.length];
      out.push(N(bar * beatsPerBar + s * 0.25, tones[deg] + oct + (s % 8 >= 4 ? 12 : 0) * 0, 0.22, s % 4 === 0 ? 1 : 0.6));
    }
  });
  return out;
}
function repeatPattern(pattern, bars, beatsPerBar) {
  const out = [];
  for (let b = 0; b < bars; b++) for (const [off, m, d, v] of pattern) out.push(N(b * beatsPerBar + off, m, d, v));
  return out;
}

// ---- MAIN THEME: "Corneria Dawn" — heroic fanfare, 132 bpm, D minor ------------------------
const MAIN_PROG = ['Dm', 'Dm', 'Bb', 'Bb', 'F', 'C', 'Gm', 'A', 'Dm', 'F', 'Bb', 'Gm', 'F', 'C', 'Bb', 'A'];
const MAIN_MELODY = [
  N(0, 62, 1.5), N(1.5, 69, .5), N(2, 74, 1), N(3, 72, 1),
  N(4, 69, 2), N(6, 65, 1), N(7, 67, 1),
  N(8, 70, 1.5), N(9.5, 65, .5), N(10, 70, 1), N(11, 74, 1),
  N(12, 72, 1.5), N(13.5, 70, .5), N(14, 69, 2),
  N(16, 77, 1), N(17, 76, .5), N(17.5, 77, .5), N(18, 72, 2),
  N(20, 76, 1), N(21, 74, 1), N(22, 72, 1), N(23, 67, 1),
  N(24, 70, 1.5), N(25.5, 67, .5), N(26, 74, 2),
  N(28, 76, 1), N(29, 73, 1), N(30, 69, 1.75),
  // second statement: up, with harmony (added below as MAIN_HARMONY)
  N(32, 74, 1), N(33, 77, 1), N(34, 81, 1.5), N(35.5, 79, .5),
  N(36, 77, 2), N(38, 76, 1), N(39, 72, 1),
  N(40, 74, 1), N(41, 77, 1), N(42, 82, 1.5), N(43.5, 81, .5),
  N(44, 79, 2), N(46, 74, 1), N(47, 70, 1),
  N(48, 81, 1.5), N(49.5, 79, .5), N(50, 77, 1), N(51, 72, 1),
  N(52, 76, 1), N(53, 79, 1), N(54, 84, 2),
  N(56, 82, 1), N(57, 81, 1), N(58, 79, 1), N(59, 77, 1),
  N(60, 76, 1.5), N(61.5, 73, .5), N(62, 69, 1.75),
];
const MAIN_HARMONY = MAIN_MELODY.filter((n) => n[0] >= 32).map(([b, m, d, v]) => N(b, m - (m % 12 === 4 || m % 12 === 1 ? 4 : 3), d, 0.7));
const MAIN_TIMP = repeatPattern([[0, 50, .5, 1], [2.5, 50, .5, .7], [3, 50, .5, .85]], 16, 4)
  .concat([N(31, 50, .5, .5), N(31.25, 50, .5, .6), N(31.5, 50, .5, .8), N(31.75, 50, .5, 1), N(63, 50, .5, .5), N(63.25, 50, .5, .6), N(63.5, 50, .5, .8), N(63.75, 50, .5, 1)]);
const MAIN_SNARE = repeatPattern([[1, 0, .1, .8], [3, 0, .1, 1], [3.75, 0, .1, .4]], 16, 4);
const MAIN_HAT = repeatPattern([[0, 0, .05, .5], [.5, 0, .05, .3], [1, 0, .05, .5], [1.5, 0, .05, .3], [2, 0, .05, .5], [2.5, 0, .05, .3], [3, 0, .05, .5], [3.5, 0, .05, .3]], 16, 4);
const MAIN_CRASH = [N(0, 0, 2, 1), N(32, 0, 2, 1)];

export const SONGS = {
  main: {
    title: 'CORNERIA DAWN', subtitle: 'MAIN THEME', bpm: 132, beatsPerBar: 4, loopBeats: 64, hue: 0.55,
    tracks: [
      { inst: 'brass', name: 'BRASS', notes: MAIN_MELODY, vib: 9, pan: 0.1 },
      { inst: 'brass', name: 'BRASS II', notes: MAIN_HARMONY, vib: 6, pan: -0.25 },
      { inst: 'strings', name: 'STRINGS', notes: pads(MAIN_PROG, 4, 0, 1) },
      { inst: 'stringsHi', name: 'VIOLINS', notes: pads(MAIN_PROG, 4, 12, 0.9), pan: 0.35 },
      { inst: 'brassLow', name: 'HORNS', notes: bassLine(MAIN_PROG, 4, [[0, 1.9, 0, .9], [2, 1.9, 0, .8]], -12), pan: -0.15 },
      { inst: 'bass', name: 'BASS', notes: bassLine(MAIN_PROG, 4, [[0, .9], [1.5, .4, 0, .7], [2, .9], [3.5, .4, 12, .7]], -24) },
      { inst: 'pluck', name: 'HARP', notes: arps(MAIN_PROG, 4, 12), pan: 0.45, gate: (beat) => (beat % 64) >= 16 && (beat % 64) < 32 || (beat % 64) >= 48 },
      { inst: 'timpani', name: 'TIMPANI', notes: MAIN_TIMP },
      { drum: 'snare', name: 'SNARE', notes: MAIN_SNARE },
      { drum: 'hat', name: 'HATS', notes: MAIN_HAT },
      { drum: 'crash', name: 'CRASH', notes: MAIN_CRASH },
    ],
  },
  battle: {
    title: 'RED ALERT', subtitle: 'BATTLE LOOP', bpm: 156, beatsPerBar: 4, loopBeats: 32, hue: 0.02,
    tracks: (() => {
      const prog = ['Em', 'Em', 'C', 'C', 'Am', 'Am', 'B', 'B'];
      const stabs = [];
      prog.forEach((c, bar) => {
        const t = CH[c];
        [[1.5, .3], [2.5, .3], [3.5, .5]].forEach(([off, d], i) => t.forEach((m) => stabs.push(N(bar * 4 + off, m + 12, d, i === 2 ? 1 : .8))));
      });
      const lead = [
        N(0, 76, .5), N(.5, 79, .5), N(1, 83, 1), N(2, 79, .5), N(2.5, 76, 1.5),
        N(4, 74, .5), N(4.5, 76, .5), N(5, 79, 1.5), N(6.5, 78, .5), N(7, 76, 1),
        N(8, 79, .5), N(8.5, 83, .5), N(9, 84, 1), N(10, 83, .5), N(10.5, 79, 1.5),
        N(12, 81, .5), N(12.5, 79, .5), N(13, 76, 1), N(14, 74, .5), N(14.5, 76, 1.5),
        N(16, 76, .5), N(16.5, 81, .5), N(17, 84, 1), N(18, 81, .5), N(18.5, 76, 1.5),
        N(20, 72, .5), N(20.5, 74, .5), N(21, 76, 1.5), N(22.5, 74, .5), N(23, 72, 1),
        N(24, 83, .5), N(24.5, 87, .5), N(25, 90, 1.5), N(26.5, 87, .5), N(27, 83, 1),
        N(28, 78, .5), N(28.5, 83, .5), N(29, 87, .75), N(29.75, 83, .25), N(30, 78, 2),
      ];
      const ost = [];
      prog.forEach((c, bar) => { const t = CH[c]; for (let s = 0; s < 16; s++) ost.push(N(bar * 4 + s * .25, t[[0, 1, 2, 1][s % 4]] + (s % 8 >= 4 ? 12 : 0), .2, s % 4 === 0 ? 1 : .55)); });
      return [
        { inst: 'lead', name: 'LEAD', notes: lead, pan: 0.1, vib: 10 },
        { inst: 'brass', name: 'BRASS', notes: stabs, pan: -0.2 },
        { inst: 'ostinato', name: 'STRINGS', notes: ost, pan: 0.35 },
        { inst: 'strings', name: 'PAD', notes: pads(prog, 4, -12, 0.8) },
        { inst: 'bass', name: 'BASS', notes: bassLine(prog, 4, [[0, .4], [.5, .4, 0, .7], [1, .4], [1.5, .4, 12, .8], [2, .4], [2.5, .4, 0, .7], [3, .4], [3.5, .4, 7, .8]], -24) },
        { inst: 'timpani', name: 'TIMPANI', notes: repeatPattern([[0, 40, .4, 1], [1, 40, .4, .8], [2, 40, .4, 1], [3, 40, .4, .8], [3.5, 40, .4, .6]], 8, 4) },
        { drum: 'snare', name: 'SNARE', notes: repeatPattern([[1, 0, .1, 1], [3, 0, .1, 1], [3.5, 0, .1, .5], [3.75, 0, .1, .6]], 8, 4) },
        { drum: 'hat', name: 'HATS', notes: repeatPattern(Array.from({ length: 8 }, (_, i) => [i * .5, 0, .05, i % 2 ? .35 : .6]), 8, 4) },
        { drum: 'crash', name: 'CRASH', notes: [N(0, 0, 2, 1), N(16, 0, 2, .8)] },
      ];
    })(),
  },
};

// ---- drums rendered through the synth's noise renderer ------------------------------------
function drum(synth, kind, t, vel) {
  if (kind === 'snare') {
    synth.noise({ t, dur: 0.16, lo: 900, hi: 6500, lo1: 400, hi1: 3000, gain: 0.32 * vel, out: 'music' });
    synth.note({ inst: { harm: [1], a: 0.002, d: 0.08, s: 0, r: 0.05, gain: 0.35, sweep: 1.5 }, f0: 190, t, dur: 0.06, vel, out: 'music' });
    synth.hit('snare', vel, t);
  } else if (kind === 'hat') {
    synth.noise({ t, dur: 0.045, lo: 6000, hi: 14000, gain: 0.12 * vel, out: 'music', a: 0.001 });
  } else if (kind === 'crash') {
    synth.noise({ t, dur: 1.8, lo: 3000, hi: 12000, lo1: 1500, hi1: 6000, gain: 0.28 * vel, out: 'music', a: 0.01 });
    synth.hit('crash', vel, t);
  }
}

// ---- sequencer ------------------------------------------------------------------------------
export function createSequencer(synth) {
  let song = null, songName = null;
  let startT = 0, scheduledBeat = 0;
  const LOOKAHEAD = 0.25;
  let fadeGain = 1;
  const nowBeat = () => (song ? ((synth.now() - startT) * song.bpm) / 60 : 0);

  function play(name) {
    const s = SONGS[name];
    if (!s) return;
    song = s; songName = name;
    startT = synth.now() + 0.05; scheduledBeat = 0;
    synth.setMusicGain(0.6);
  }
  function stop() { song = null; songName = null; }

  function update() {
    if (!song) return;
    const spb = 60 / song.bpm;
    const horizonBeat = ((synth.now() + LOOKAHEAD) - startT) / spb;
    // schedule in small slices so we never miss anything
    while (scheduledBeat < horizonBeat) {
      const b0 = scheduledBeat, b1 = scheduledBeat + 0.25;
      const loopIdx = Math.floor(b0 / song.loopBeats);
      const lb0 = b0 - loopIdx * song.loopBeats, lb1 = b1 - loopIdx * song.loopBeats;
      for (const tr of song.tracks) {
        for (const [beat, midi, dur, vel] of tr.notes) {
          if (beat >= lb0 && beat < lb1) {
            const absBeat = loopIdx * song.loopBeats + beat;
            if (tr.gate && !tr.gate(absBeat)) continue;
            const t = startT + absBeat * spb;
            if (tr.drum) drum(synth, tr.drum, t, vel);
            else {
              synth.note({ inst: tr.inst, midi, t, dur: dur * spb, vel, pan: tr.pan ?? 0, vib: tr.vib ?? 0, out: 'music' });
              if (tr.inst === 'timpani') synth.hit('timpani', vel, t);
              if (tr.inst === 'brass' || tr.inst === 'lead') synth.hit('brass', vel, t);
            }
          }
        }
      }
      scheduledBeat = b1;
    }
  }

  return {
    play, stop, update,
    get song() { return song; }, get name() { return songName; },
    get beat() { return nowBeat(); },
    get bar() { return song ? Math.floor(nowBeat() / song.beatsPerBar) : 0; },
    get beatInBar() { return song ? nowBeat() % song.beatsPerBar : 0; },
    /** 0..1 phase within the current beat (for visual pulse) */
    get pulse() { return song ? 1 - (nowBeat() % 1) : 0; },
    /** which tracks have a note sounding right now (for the UI activity lights) */
    activity() {
      if (!song) return [];
      const b = nowBeat() % song.loopBeats;
      return song.tracks.map((tr) => ({ name: tr.name, on: tr.notes.some(([beat, , dur]) => b >= beat && b < beat + Math.max(dur, 0.12) && (!tr.gate || tr.gate(nowBeat()))) }));
    },
  };
}

export { midiHz };
