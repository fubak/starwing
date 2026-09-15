/**
 * SFX bank. Each entry is a function (synth, t, p) that schedules a sound at
 * time t and returns nothing. Returns metadata for the soundboard.
 */
const A = (harm, a, d, s, r, gain, extra = {}) => ({ harm, a, d, s, r, gain, ...extra });
const SQ = [1, 0, 0.33, 0, 0.2, 0, 0.14];
const SAW = [1, 0.5, 0.33, 0.25, 0.2, 0.16];
const SIN = [1];
const TRI = [1, 0, 0.11, 0, 0.04];

export const SFX = {
  laser: {
    label: 'TWIN LASER', key: 'fire', color: '#4cf0ff', duck: 0.12,
    play(s, t) {
      for (let i = 0; i < 2; i++) {
        const tt = t + i * 0.045, pan = i ? 0.45 : -0.45;
        s.note({ inst: A(SQ, 0.002, 0.08, 0, 0.05, 0.22, { band: [4000, 6000] }), f0: 1900, f1: 520, t: tt, dur: 0.09, pan, out: 'sfx', unison: 1 });
        s.note({ inst: A(SAW, 0.002, 0.1, 0, 0.06, 0.12), f0: 950, f1: 260, t: tt, dur: 0.11, pan, out: 'sfx', unison: 2, detune: 12 });
        s.noise({ t: tt, dur: 0.05, lo: 2500, hi: 9000, gain: 0.1, pan, out: 'sfx' });
      }
      s.hit('laser', 0.6, t);
    },
  },
  charge: {
    label: 'CHARGE SHOT', key: 'charge', color: '#8cf7ff', duck: 0.2,
    play(s, t) {
      // rising whine while the ball builds — the launch is 'charged', played
      // separately so the release lands when the player actually lets go
      s.note({ inst: A(SIN, 0.05, 0.9, 1, 0.25, 0.22), f0: 180, f1: 1400, t, dur: 0.9, out: 'sfx', unison: 1 });
      s.note({ inst: A(SAW, 0.1, 0.9, 1, 0.25, 0.1, { band: [400, 5000] }), f0: 90, f1: 700, t, dur: 0.9, out: 'sfx', unison: 3, detune: 20, vib: 40 });
      s.noise({ t, dur: 1.1, lo: 300, hi: 1200, lo1: 3000, hi1: 9000, gain: 0.12, out: 'sfx', a: 0.3 });
    },
  },
  charged: {
    label: 'CHARGE RELEASE', key: 'charged', color: '#b8faff', duck: 0.35,
    play(s, t) {
      // homing bolt launch: hot chirp + air burst + sub punch so it reads
      // heavier than the twin-laser 'laser'
      s.note({ inst: A(SQ, 0.003, 0.25, 0, 0.12, 0.3, { band: [3000, 800] }), f0: 1400, f1: 120, t, dur: 0.28, out: 'sfx', unison: 2, detune: 15 });
      s.noise({ t, dur: 0.3, lo: 200, hi: 6000, lo1: 80, hi1: 900, gain: 0.3, out: 'sfx' });
      s.note({ inst: A(SIN, 0.002, 0.22, 0, 0.1, 0.45, { sweep: 2.2 }), f0: 160, f1: 55, t, dur: 0.2, out: 'sfx', unison: 1 });
      s.hit('laser', 1, t);
    },
  },
  lockon: {
    label: 'LOCK-ON', key: 'lock', color: '#ff5a5a', duck: 0.05,
    play(s, t) {
      [0, 0.09, 0.18].forEach((d, i) => s.note({ inst: A(SQ, 0.003, 0.06, 0.4, 0.04, 0.12, { band: [2500, 4000] }), f0: i === 2 ? 1760 : 1320, t: t + d, dur: 0.06, out: 'sfx', unison: 1, pan: i === 2 ? 0 : (i ? 0.3 : -0.3) }));
      s.hit('ui', 0.5, t + 0.18);
    },
  },
  boost: {
    label: 'BOOST', key: 'boost', color: '#ffb347', duck: 0.35,
    play(s, t) {
      s.noise({ t, dur: 0.9, lo: 150, hi: 900, lo1: 900, hi1: 7000, gain: 0.34, out: 'sfx', a: 0.08 });
      s.note({ inst: A(SAW, 0.06, 0.6, 0.6, 0.35, 0.14, { band: [200, 2500] }), f0: 70, f1: 330, t, dur: 0.75, out: 'sfx', unison: 4, detune: 18 });
      s.note({ inst: A(SIN, 0.02, 0.4, 0.5, 0.3, 0.3), f0: 45, f1: 110, t, dur: 0.7, out: 'sfx', unison: 1 });
      s.hit('boost', 1, t);
    },
  },
  brake: {
    label: 'BRAKE', key: 'brake', color: '#ffd166', duck: 0.25,
    play(s, t) {
      s.noise({ t, dur: 0.8, lo: 1200, hi: 8000, lo1: 100, hi1: 600, gain: 0.3, out: 'sfx', a: 0.02 });
      s.note({ inst: A(SAW, 0.02, 0.5, 0.5, 0.3, 0.12, { band: [2000, 300] }), f0: 380, f1: 55, t, dur: 0.7, out: 'sfx', unison: 4, detune: 25 });
      s.hit('boost', 0.6, t);
    },
  },
  roll: {
    label: 'BARREL ROLL', key: 'roll', color: '#7dff9a', duck: 0.2,
    play(s, t) {
      // whoosh that wobbles: 4 short swells
      for (let i = 0; i < 4; i++) s.noise({ t: t + i * 0.11, dur: 0.16, lo: 600 + i * 200, hi: 4000 + i * 800, lo1: 300, hi1: 1500, gain: 0.2, out: 'sfx', a: 0.04, pan: i % 2 ? 0.6 : -0.6 });
      s.note({ inst: A(TRI, 0.05, 0.4, 0.5, 0.15, 0.16), f0: 420, f1: 880, t, dur: 0.42, out: 'sfx', unison: 2, detune: 30, vib: 80 });
      s.note({ inst: A(SQ, 0.005, 0.08, 0, 0.05, 0.1, { band: [3000, 5000] }), f0: 1500, f1: 2200, t: t + 0.42, dur: 0.08, out: 'sfx', unison: 1 });
      s.hit('roll', 0.8, t);
    },
  },
  explosionS: {
    label: 'EXPLOSION S', key: 'expS', color: '#ff8a3d', duck: 0.25,
    play(s, t) {
      s.noise({ t, dur: 0.35, lo: 300, hi: 6000, lo1: 80, hi1: 700, gain: 0.4, out: 'sfx' });
      s.note({ inst: A(SIN, 0.002, 0.2, 0, 0.1, 0.5, { sweep: 2.5 }), f0: 110, f1: 50, t, dur: 0.18, out: 'sfx', unison: 1 });
      s.hit('boom', 0.5, t);
    },
  },
  explosionM: {
    label: 'EXPLOSION M', key: 'expM', color: '#ff6a2a', duck: 0.45,
    play(s, t) {
      s.noise({ t, dur: 0.8, lo: 150, hi: 7000, lo1: 40, hi1: 400, gain: 0.55, out: 'sfx' });
      s.noise({ t: t + 0.06, dur: 0.5, lo: 2000, hi: 9000, lo1: 500, hi1: 2500, gain: 0.2, out: 'sfx', pan: 0.4 });
      s.note({ inst: A(SIN, 0.002, 0.45, 0, 0.2, 0.7, { sweep: 3 }), f0: 70, f1: 35, t, dur: 0.4, out: 'sfx', unison: 1 });
      s.hit('boom', 0.8, t);
    },
  },
  explosionL: {
    label: 'EXPLOSION L', key: 'bomb', color: '#ff4d1f', duck: 0.7,
    play(s, t) {
      s.noise({ t, dur: 1.9, lo: 80, hi: 9000, lo1: 30, hi1: 250, gain: 0.7, out: 'sfx', a: 0.01 });
      s.noise({ t: t + 0.12, dur: 1.2, lo: 1500, hi: 10000, lo1: 200, hi1: 1200, gain: 0.25, out: 'sfx', pan: -0.5 });
      s.noise({ t: t + 0.25, dur: 1.4, lo: 800, hi: 6000, lo1: 100, hi1: 800, gain: 0.25, out: 'sfx', pan: 0.5 });
      s.note({ inst: A(SIN, 0.002, 0.9, 0, 0.5, 0.9, { sweep: 4 }), f0: 55, f1: 28, t, dur: 0.9, out: 'sfx', unison: 1 });
      s.note({ inst: A(SAW, 0.01, 0.6, 0, 0.3, 0.15, { band: [200, 80] }), f0: 90, f1: 30, t: t + 0.03, dur: 0.6, out: 'sfx', unison: 3, detune: 40 });
      s.hit('boom', 1.4, t);
    },
  },
  hit: {
    label: 'HIT', key: 'hit', color: '#ff9cf0', duck: 0.15,
    play(s, t) {
      s.noise({ t, dur: 0.09, lo: 1500, hi: 9000, lo1: 600, hi1: 3000, gain: 0.3, out: 'sfx' });
      s.note({ inst: A(SQ, 0.001, 0.07, 0, 0.04, 0.2, { band: [3000, 1500] }), f0: 2600, f1: 900, t, dur: 0.06, out: 'sfx', unison: 1 });
      s.note({ inst: A(SIN, 0.001, 0.09, 0, 0.05, 0.3, { sweep: 1.8 }), f0: 140, t, dur: 0.08, out: 'sfx', unison: 1 });
      s.hit('hit', 0.6, t);
    },
  },
  hurt: {
    label: 'HULL HIT', key: 'hurt', color: '#ff7a5a', duck: 0.3,
    play(s, t) {
      // the PLAYER takes damage — darker and heavier than 'hit' (which is the
      // pew-pew impact on an enemy), so damage reads even mid-dogfight
      s.noise({ t, dur: 0.16, lo: 400, hi: 4000, lo1: 100, hi1: 800, gain: 0.45, out: 'sfx' });
      s.note({ inst: A(SAW, 0.002, 0.18, 0, 0.1, 0.28, { band: [1500, 300] }), f0: 340, f1: 70, t, dur: 0.2, out: 'sfx', unison: 2, detune: 25 });
      s.note({ inst: A(SIN, 0.002, 0.3, 0, 0.15, 0.5, { sweep: 2.6 }), f0: 95, f1: 38, t, dur: 0.3, out: 'sfx', unison: 1 });
      s.hit('boom', 0.4, t);
    },
  },
  alarm: {
    label: 'ALARM', key: 'alarm', color: '#ff3355', duck: 0.2,
    play(s, t) {
      for (let i = 0; i < 4; i++) {
        s.note({ inst: A(SQ, 0.01, 0.2, 0.9, 0.05, 0.11, { band: [1500, 2500] }), f0: 660, f1: 880, t: t + i * 0.36, dur: 0.17, out: 'sfx', unison: 2, detune: 8, pan: -0.3 });
        s.note({ inst: A(SQ, 0.01, 0.2, 0.9, 0.05, 0.11, { band: [1500, 2500] }), f0: 880, f1: 660, t: t + i * 0.36 + 0.18, dur: 0.17, out: 'sfx', unison: 2, detune: 8, pan: 0.3 });
      }
      s.hit('alarm', 0.7, t);
    },
  },
  select: {
    label: 'UI SELECT', key: 'select', color: '#9ad7ff', duck: 0,
    play(s, t) {
      s.note({ inst: A(TRI, 0.002, 0.06, 0, 0.04, 0.18), f0: 1320, f1: 1480, t, dur: 0.05, out: 'sfx', unison: 1 });
      s.hit('ui', 0.3, t);
    },
  },
  confirm: {
    label: 'UI CONFIRM', key: 'confirm', color: '#c6ff8a', duck: 0.05,
    play(s, t) {
      [[0, 1046], [0.07, 1318], [0.14, 1568]].forEach(([d, f]) => s.note({ inst: A(TRI, 0.003, 0.12, 0.2, 0.08, 0.16), f0: f, t: t + d, dur: 0.1, out: 'sfx', unison: 1 }));
      s.note({ inst: A(SIN, 0.005, 0.3, 0, 0.15, 0.12), f0: 2093, t: t + 0.21, dur: 0.25, out: 'sfx', unison: 1 });
      s.hit('ui', 0.5, t + 0.2);
    },
  },
  comm: {
    label: 'COMM CHIRP', key: 'comm', color: '#ffe066', duck: 0.1,
    play(s, t) {
      // classic incoming-transmission trill
      for (let i = 0; i < 6; i++) s.note({ inst: A(SQ, 0.003, 0.03, 0.5, 0.02, 0.1, { band: [2500, 3500] }), f0: i % 2 ? 2200 : 1650, t: t + i * 0.04, dur: 0.03, out: 'sfx', unison: 1 });
      s.note({ inst: A(SIN, 0.005, 0.15, 0, 0.1, 0.12), f0: 2637, f1: 2200, t: t + 0.26, dur: 0.14, out: 'sfx', unison: 1 });
      s.hit('ui', 0.4, t);
    },
  },
  jump: {
    label: 'JUMP', key: 'jump', color: '#a8e6ff', duck: 0.05,
    play(s, t) {
      s.noise({ t, dur: 0.18, lo: 300, hi: 2400, lo1: 500, hi1: 3600, gain: 0.16, out: 'sfx', a: 0.01 });
      s.note({ inst: A(TRI, 0.005, 0.14, 0, 0.08, 0.2), f0: 300, f1: 620, t, dur: 0.16, out: 'sfx', unison: 1 });
      s.hit('ui', 0.2, t);
    },
  },
  land: {
    label: 'LAND', key: 'land', color: '#c8b890', duck: 0.05,
    play(s, t) {
      s.noise({ t, dur: 0.14, lo: 120, hi: 900, lo1: 60, hi1: 300, gain: 0.26, out: 'sfx' });
      s.note({ inst: A(SIN, 0.002, 0.1, 0, 0.06, 0.3, { sweep: 2 }), f0: 130, f1: 55, t, dur: 0.12, out: 'sfx', unison: 1 });
    },
  },
  ring: {
    label: 'RING PICKUP', key: 'ring', color: '#ffe86a', duck: 0.08,
    play(s, t) {
      // two-tone ascending chime + shimmer tail (Star Fox supply ring)
      [[0, 1318.5], [0.07, 1975.5]].forEach(([d, f], i) => s.note({ inst: A(TRI, 0.003, 0.14, 0.2, 0.12, 0.2), f0: f, t: t + d, dur: 0.14, out: 'sfx', unison: 1, pan: i ? 0.3 : -0.3 }));
      s.noise({ t: t + 0.05, dur: 0.3, lo: 6000, hi: 14000, lo1: 3000, hi1: 8000, gain: 0.05, out: 'sfx' });
      s.hit('ui', 0.35, t);
    },
  },
  door: {
    label: 'BLAST DOOR', key: 'door', color: '#8fb0ff', duck: 0.3,
    play(s, t) {
      s.note({ inst: A(SQ, 0.002, 0.06, 0, 0.03, 0.14), f0: 1200, f1: 900, t, dur: 0.05, out: 'sfx' }); // solenoid clack
      s.noise({ t: t + 0.06, dur: 1.1, lo: 60, hi: 500, lo1: 30, hi1: 250, gain: 0.5, out: 'sfx', a: 0.05 });
      s.note({ inst: A(SAW, 0.08, 0.8, 0.7, 0.3, 0.16, { band: [300, 900] }), f0: 55, f1: 38, t: t + 0.06, dur: 1.0, out: 'sfx', unison: 2, detune: 6 });
      s.hit('boom', 0.35, t + 0.06);
    },
  },
  victory: {
    label: 'VICTORY STING', key: 'victory', color: '#8affc0', duck: 0.5,
    play(s, t) {
      // four-note fanfare pickup: rising major arpeggio, wide unison, cymbal-ish tail
      const N = [[0, 523.25], [0.12, 659.25], [0.24, 783.99], [0.36, 1046.5], [0.72, 1318.5]];
      for (const [d, f] of N) {
        const last = d > 0.7;
        s.note({ inst: A(SQ, 0.005, last ? 0.9 : 0.14, last ? 0.4 : 0, last ? 0.4 : 0.06, last ? 0.22 : 0.18, { band: [1800, 4200] }), f0: f, t: t + d, dur: last ? 1.2 : 0.14, out: 'sfx', unison: 2, detune: 10, pan: d === 0.12 ? 0.25 : -0.25 });
        s.note({ inst: A(TRI, 0.005, last ? 1.0 : 0.16, 0.4, 0.3, 0.14), f0: f / 2, t: t + d, dur: last ? 1.3 : 0.16, out: 'sfx', unison: 1 });
      }
      s.noise({ t: t + 0.7, dur: 0.9, lo: 5000, hi: 14000, lo1: 2000, hi1: 5000, gain: 0.08, out: 'sfx', a: 0.02 });
      s.hit('ui', 0.8, t + 0.36);
    },
  },
};

export const SFX_ORDER = ['laser', 'charge', 'charged', 'lockon', 'boost', 'brake', 'roll', 'explosionS', 'explosionM', 'explosionL', 'hit', 'hurt', 'alarm', 'select', 'confirm', 'comm', 'victory', 'jump', 'land', 'ring', 'door'];
