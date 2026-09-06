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
    sun: { dir: [0.62, 0.11, -0.78], color: 0xfff1d6, intensity: 2.6, size: 0.035, glow: 1.2 },
    hemi: { sky: 0x4a6ac0, ground: 0x3a2a48, intensity: 0.6 },
    fill: { dir: [-0.45, 0.5, 0.74], color: 0xfff1e4, intensity: 1.35 },
    fog: { color: 0x0a0d24, density: 0 },
    sky: {
      zenith: 0x02040e, horizon: 0x0c1430, ground: 0x04030a, haze: 5.5,
      stars: 1.0, nebula: 0.85, nebulaA: 0x1e2e8a, nebulaB: 0xb0326e, milky: 0.55,
    },
    grade: { contrast: 1.06, saturation: 1.12, lift: 0x030410, gain: 0xfff8f0, gamma: 1.0, vignette: 0.32, grain: 0.02 },
    planet: {
      ocean: 0x1c5fb8, oceanDeep: 0x0a2a72, land: 0x3f8c3a, landHigh: 0xa89566, ice: 0xe8f2ff, iceLat: 0.8,
      atmo: 0x5aa2ff, atmoWarm: 0xffa050, night: 0xffc070, cloud: 0xffffff,
    },
  },

  // Corneria daytime: clear cyan sky, white haze, golden sun.
  corneria: {
    label: 'CORNERIA · DAY',
    exposure: 0.95,
    envIntensity: 0.6,
    bloom: { strength: 0.4, radius: 0.5, threshold: 0.92 },
    sun: { dir: [0.55, 0.34, -0.76], color: 0xfff4e0, intensity: 2.6, size: 0.03, glow: 0.6 },
    hemi: { sky: 0x7fb6ff, ground: 0x4c6a5a, intensity: 0.7 },
    fill: { dir: [-0.6, 0.25, 0.75], color: 0x9ec8ff, intensity: 0.6 },
    fog: { color: 0x8fc3ff, density: 0.0008 },
    sky: {
      zenith: 0x1250c8, horizon: 0x78b6ff, ground: 0x6f8aa8, haze: 2.3,
      stars: 0.0, nebula: 0.0, nebulaA: 0x1e2e8a, nebulaB: 0xb0326e, milky: 0.0,
    },
    grade: { contrast: 1.04, saturation: 1.08, lift: 0x000205, gain: 0xffffff, gamma: 1.0, vignette: 0.22, grain: 0.012 },
    planet: {
      ocean: 0x2a7fd6, oceanDeep: 0x0f3f96, land: 0x4c9a3c, landHigh: 0xb8a070, ice: 0xf4f9ff, iceLat: 0.78,
      atmo: 0x7ab8ff, atmoWarm: 0xffc880, night: 0xffd090, cloud: 0xffffff,
    },
  },

  // Sunset over the sea: tangerine horizon, violet zenith, long shadows.
  sunset: {
    label: 'SECTOR · SUNSET',
    exposure: 1.0,
    envIntensity: 0.6,
    bloom: { strength: 0.6, radius: 0.6, threshold: 0.85 },
    sun: { dir: [0.64, 0.07, -0.77], color: 0xffb060, intensity: 2.4, size: 0.045, glow: 1.4 },
    hemi: { sky: 0x7a4ea0, ground: 0x3a1c28, intensity: 0.65 },
    fill: { dir: [-0.7, 0.3, 0.65], color: 0x4a5cff, intensity: 0.9 },
    fog: { color: 0xd8704a, density: 0.0012 },
    sky: {
      zenith: 0x1a1240, horizon: 0xff8a3a, ground: 0x2a1220, haze: 3.0,
      stars: 0.25, nebula: 0.15, nebulaA: 0x3a1e6a, nebulaB: 0xb0326e, milky: 0.0,
    },
    grade: { contrast: 1.08, saturation: 1.15, lift: 0x06020a, gain: 0xffefe0, gamma: 1.0, vignette: 0.35, grain: 0.02 },
    planet: {
      ocean: 0x2f5fa8, oceanDeep: 0x0c2460, land: 0x6a7a34, landHigh: 0xc09a60, ice: 0xffe8d8, iceLat: 0.8,
      atmo: 0xff9a60, atmoWarm: 0xff5a30, night: 0xffb060, cloud: 0xffe0c8,
    },
  },

  // Venom: toxic acid-green sky, sickly yellow sun, red-purple nebula bands.
  venom: {
    label: 'VENOM · STORM',
    exposure: 0.95,
    envIntensity: 0.55,
    bloom: { strength: 0.55, radius: 0.6, threshold: 0.88 },
    sun: { dir: [-0.45, 0.22, -0.86], color: 0xe8ff9a, intensity: 2.4, size: 0.04, glow: 1.1 },
    hemi: { sky: 0x6a9a3a, ground: 0x2a1a30, intensity: 0.65 },
    fill: { dir: [0.7, 0.3, 0.7], color: 0xb050ff, intensity: 0.85 },
    fog: { color: 0x5a7a2a, density: 0.0015 },
    sky: {
      zenith: 0x0a0e1a, horizon: 0x7fb03a, ground: 0x1a0a14, haze: 4.2,
      stars: 0.5, nebula: 0.9, nebulaA: 0x5a1a3a, nebulaB: 0x7a30d0, milky: 0.3,
    },
    grade: { contrast: 1.1, saturation: 1.1, lift: 0x040604, gain: 0xf8ffee, gamma: 1.0, vignette: 0.4, grain: 0.03 },
    planet: {
      ocean: 0x6a4a1a, oceanDeep: 0x2a1a08, land: 0x7a8a2a, landHigh: 0xc0b070, ice: 0xd8e0b0, iceLat: 0.9,
      atmo: 0xa0e050, atmoWarm: 0xff8040, night: 0xff5030, cloud: 0xd8e8b0,
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
