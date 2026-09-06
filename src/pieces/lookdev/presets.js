/**
 * Look presets. Every colour is a hex int (converted to linear THREE.Color by
 * resolvePreset). Vectors are [x,y,z]. Anything numeric/colour is blendable,
 * so applyLook can cross-fade between presets.
 *
 * Palette philosophy (Star Fox / Nintendo first-party): saturated but
 * controlled — one dominant hue per preset, a complementary accent, warm key
 * light against cool fill so white hulls read as white and blues stay blue.
 */
export const PRESETS = {
  // Deep space above Corneria at dawn. Teal/magenta nebula, warm-white sun.
  space: {
    label: 'ORBIT · DAWN',
    exposure: 1.0,
    envIntensity: 0.55,
    bloom: { strength: 0.5, radius: 0.5, threshold: 0.9 },
    sun: { dir: [0.46, 0.13, -0.88], color: 0xfff1d6, intensity: 2.6, size: 0.035, glow: 1.0 },
    hemi: { sky: 0x4a6ac0, ground: 0x3a2a48, intensity: 0.6 },
    fill: { dir: [-0.45, 0.5, 0.74], color: 0xfff1e4, intensity: 1.35 },
    rim: { dir: [0.1, -0.85, 0.5], color: 0x4f9dff, intensity: 1.1 },
    fog: { color: 0x0a0d24, density: 0 },
    sky: {
      zenith: 0x02040e, horizon: 0x0c1430, ground: 0x04030a, haze: 5.5,
      stars: 1.0, nebula: 0.85, nebulaA: 0x1e2e8a, nebulaB: 0xb0326e, milky: 0.55, clouds: 0.0,
    },
    grade: { contrast: 1.06, saturation: 1.12, lift: 0x030410, gain: 0xfff8f0, gamma: 1.0, vignette: 0.32, grain: 0.02 },
    planet: {
      ocean: 0x1c5fb8, oceanDeep: 0x0a2a72, land: 0x3f8c3a, landHigh: 0xa89566, ice: 0xe8f2ff, iceLat: 0.8,
      atmo: 0x5aa2ff, atmoWarm: 0xffa050, night: 0xffc070, cloud: 0xffffff, atmoK: 1.0,
    },
  },

  // Corneria daytime: clear cyan sky, white haze, golden sun.
  corneria: {
    label: 'CORNERIA · DAY',
    exposure: 0.95,
    envIntensity: 0.4,
    bloom: { strength: 0.4, radius: 0.5, threshold: 0.92 },
    sun: { dir: [0.44, 0.3, -0.85], color: 0xfff4e0, intensity: 2.8, size: 0.03, glow: 0.5 },
    hemi: { sky: 0xb0cce8, ground: 0x4c6a5a, intensity: 0.6 },
    fill: { dir: [-0.6, 0.25, 0.75], color: 0x9ec8ff, intensity: 0.6 },
    rim: { dir: [0.1, -0.85, 0.5], color: 0x6fc0ff, intensity: 0.9 },
    fog: { color: 0x8fc3ff, density: 0.00022 },
    sky: {
      zenith: 0x0a2fa0, horizon: 0xa6d0ff, ground: 0x5f7a98, haze: 5.2,
      stars: 0.0, nebula: 0.0, nebulaA: 0x1e2e8a, nebulaB: 0xb0326e, milky: 0.0, clouds: 0.85,
    },
    grade: { contrast: 1.12, saturation: 1.16, lift: 0x000205, gain: 0xffffff, gamma: 1.0, vignette: 0.22, grain: 0.012 },
    planet: {
      ocean: 0x2a7fd6, oceanDeep: 0x0f3f96, land: 0x4c9a3c, landHigh: 0xb8a070, ice: 0xf4f9ff, iceLat: 0.78,
      atmo: 0x7ab8ff, atmoWarm: 0xffc880, night: 0xffd090, cloud: 0xffffff, atmoK: 1.1,
    },
  },

  // Sunset over the sea: tangerine horizon, violet zenith, long shadows.
  sunset: {
    label: 'SECTOR · SUNSET',
    exposure: 1.0,
    envIntensity: 0.6,
    bloom: { strength: 0.6, radius: 0.6, threshold: 0.85 },
    sun: { dir: [0.5, 0.09, -0.86], color: 0xffb060, intensity: 2.6, size: 0.045, glow: 1.1 },
    hemi: { sky: 0x5a4ea8, ground: 0x2a1c30, intensity: 0.7 },
    fill: { dir: [-0.7, 0.3, 0.65], color: 0x5a78ff, intensity: 1.1 },
    rim: { dir: [0.2, -0.85, 0.45], color: 0x3a6cff, intensity: 1.2 },
    fog: { color: 0xa85a48, density: 0.00018 },
    sky: {
      zenith: 0x0c0a2c, horizon: 0xff7a30, ground: 0x1a0c1c, haze: 6.5,
      stars: 0.45, nebula: 0.25, nebulaA: 0x2a1a6a, nebulaB: 0x8a2a6e, milky: 0.0, clouds: 0.5,
    },
    grade: { contrast: 1.1, saturation: 1.12, lift: 0x04030c, gain: 0xfff2e6, gamma: 1.0, vignette: 0.35, grain: 0.02 },
    planet: {
      ocean: 0x1c4a9a, oceanDeep: 0x081a50, land: 0x4a6a2c, landHigh: 0xa88a58, ice: 0xffe8d8, iceLat: 0.8,
      atmo: 0xd08a78, atmoWarm: 0xff6a30, night: 0xffb060, cloud: 0xffd8c0, atmoK: 1.35,
    },
  },

  // Venom: toxic acid-green sky, sickly yellow sun, red-purple nebula bands.
  venom: {
    label: 'VENOM · STORM',
    exposure: 0.95,
    envIntensity: 0.55,
    bloom: { strength: 0.55, radius: 0.6, threshold: 0.88 },
    sun: { dir: [-0.4, 0.2, -0.9], color: 0xf0ffb0, intensity: 2.6, size: 0.04, glow: 0.9 },
    hemi: { sky: 0x5a8a4a, ground: 0x2a1a30, intensity: 0.7 },
    fill: { dir: [0.7, 0.3, 0.7], color: 0xc060ff, intensity: 1.1 },
    rim: { dir: [-0.2, -0.85, 0.45], color: 0xff5a30, intensity: 1.0 },
    fog: { color: 0x4a6a2a, density: 0.00025 },
    sky: {
      zenith: 0x06060e, horizon: 0x6fa02e, ground: 0x120810, haze: 6.5,
      stars: 0.55, nebula: 0.9, nebulaA: 0x5a1a3a, nebulaB: 0x7a30d0, milky: 0.3, clouds: 0.6,
    },
    grade: { contrast: 1.1, saturation: 1.1, lift: 0x030503, gain: 0xf8ffee, gamma: 1.0, vignette: 0.4, grain: 0.03 },
    planet: {
      ocean: 0x5a3a12, oceanDeep: 0x1a1006, land: 0x6a7a22, landHigh: 0xb0a060, ice: 0xd8e0b0, iceLat: 0.9,
      atmo: 0x9ad848, atmoWarm: 0xff7030, night: 0xff5030, cloud: 0xd0e0a0, atmoK: 1.25,
    },
  },
};

export const PRESET_NAMES = Object.keys(PRESETS);

/** Deep-copy a preset converting hex ints -> THREE.Color and [x,y,z] -> Vector3. */
export function resolvePreset(THREE, p) {
  if (typeof p === 'string') p = PRESETS[p] ?? PRESETS.space;
  const walk = (v, key) => {
    if (v instanceof THREE.Color || v instanceof THREE.Vector3) return v.clone();
    if (Array.isArray(v)) return new THREE.Vector3(v[0], v[1], v[2]).normalize();
    if (typeof v === 'number') {
      // Colour-ish keys are hex ints; everything else is scalar.
      return COLOR_KEYS.has(key) ? new THREE.Color(v) : v;
    }
    if (v && typeof v === 'object') {
      const o = {};
      for (const k of Object.keys(v)) o[k] = walk(v[k], k);
      return o;
    }
    return v;
  };
  return walk(p, '');
}

const COLOR_KEYS = new Set([
  'color', 'sky', 'ground', 'zenith', 'horizon', 'nebulaA', 'nebulaB', 'lift', 'gain',
  'ocean', 'oceanDeep', 'land', 'landHigh', 'ice', 'atmo', 'atmoWarm', 'night', 'cloud',
]);

/** In-place blend: out = lerp(a, b, k) over a resolved preset tree. */
export function lerpPreset(THREE, a, b, k, out) {
  for (const key of Object.keys(b)) {
    const bv = b[key], av = a[key] ?? bv;
    if (bv instanceof THREE.Color) {
      (out[key] ??= new THREE.Color()).copy(av).lerp(bv, k);
    } else if (bv instanceof THREE.Vector3) {
      (out[key] ??= new THREE.Vector3()).copy(av).lerp(bv, k).normalize();
    } else if (typeof bv === 'number') {
      out[key] = av + (bv - av) * k;
    } else if (bv && typeof bv === 'object') {
      out[key] ??= {};
      lerpPreset(THREE, av, bv, k, out[key]);
    } else out[key] = bv;
  }
  return out;
}
