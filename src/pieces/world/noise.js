// Fast deterministic 2D value-noise + fbm (CPU) and a matching GLSL snippet.

function hash(ix, iy) {
  let h = (ix * 374761393 + iy * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return (a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy) * 2 - 1; // [-1,1]
}

export function fbm(x, y, oct = 5, lac = 2.03, gain = 0.5) {
  let s = 0, amp = 0.5, norm = 0;
  // rotate each octave a little to break up axis-aligned artefacts
  for (let i = 0; i < oct; i++) {
    s += vnoise(x, y) * amp; norm += amp;
    const nx = x * 0.8 * lac - y * 0.6 * lac + 17.3, ny = x * 0.6 * lac + y * 0.8 * lac + 31.7;
    x = nx; y = ny; amp *= gain;
  }
  return s / norm;
}

/** Ridged multifractal, [-1,1]-ish, sharp crests. */
export function ridged(x, y, oct = 5) {
  let s = 0, amp = 0.5, norm = 0;
  for (let i = 0; i < oct; i++) {
    const n = 1 - Math.abs(vnoise(x, y));
    s += n * n * amp; norm += amp;
    const nx = x * 1.6 - y * 1.2 + 5.1, ny = x * 1.2 + y * 1.6 + 9.7;
    x = nx; y = ny; amp *= 0.5;
  }
  return (s / norm) * 2 - 1;
}

export const GLSL_NOISE = /* glsl */ `
float hash21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  float a = hash21(i), b = hash21(i+vec2(1,0)), c = hash21(i+vec2(0,1)), d = hash21(i+vec2(1,1));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.5; mat2 m = mat2(1.6,1.2,-1.2,1.6);
  for(int i=0;i<5;i++){ s += a*vnoise(p); p = m*p + 7.3; a *= 0.5; }
  return s;
}
`;

// ---------------------------------------------------------------- baked textures (cheap in shaders)
function phash(ix, iy, P, seed) {
  ix = ((ix % P) + P) % P; iy = ((iy % P) + P) % P;
  return hash(ix + seed * 7919, iy + seed * 104729);
}
function pnoise(x, y, P, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = phash(ix, iy, P, seed), b = phash(ix + 1, iy, P, seed), c = phash(ix, iy + 1, P, seed), d = phash(ix + 1, iy + 1, P, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
/** Tileable fbm in [0,1]; u,v in [0,1). */
export function tileFbm(u, v, oct = 5, base = 4, seed = 0) {
  let s = 0, amp = 0.5, norm = 0, P = base;
  for (let i = 0; i < oct; i++) { s += pnoise(u * P, v * P, P, seed + i) * amp; norm += amp; amp *= 0.5; P *= 2; }
  return s / norm;
}

/** RGBA DataTexture: R = fbm A, G = fbm B (different seed), B = ridged-ish, A = 255. Tileable. */
export function makeNoiseTexture(THREE, size = 512) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, i = (y * size + x) * 4;
    data[i] = tileFbm(u, v, 5, 4, 1) * 255;
    data[i + 1] = tileFbm(u, v, 5, 6, 9) * 255;
    data[i + 2] = Math.pow(1 - Math.abs(tileFbm(u, v, 4, 3, 21) * 2 - 1), 1.5) * 255;
    data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

// Memoised: the water normal bake is a fixed ~256² CPU pass shared by every
// createWater(); building it more than once per session is pure waste.
let _waterNrm = null;
/** Tileable water normal map (RGB, tangent space, y-up encoded in G). */
export function makeWaterNormalTexture(THREE, size = 256) {
  if (_waterNrm) return _waterNrm;
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    h[y * size + x] = tileFbm(u, v, 4, 6, 33) * 0.7 + tileFbm(u, v, 3, 14, 47) * 0.3;
  }
  const data = new Uint8Array(size * size * 4);
  const at = (x, y) => h[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  const str = size * 0.25;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * str, dy = (at(x, y + 1) - at(x, y - 1)) * str;
    const l = Math.hypot(dx, dy, 1);
    const i = (y * size + x) * 4;
    data[i] = (-dx / l * 0.5 + 0.5) * 255; data[i + 1] = (-dy / l * 0.5 + 0.5) * 255; data[i + 2] = (1 / l * 0.5 + 0.5) * 255; data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true; t.needsUpdate = true;
  _waterNrm = t;
  return t;
}
