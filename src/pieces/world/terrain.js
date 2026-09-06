import * as THREE from 'three';
import { fbm, ridged, vnoise } from './noise.js';
import { patchAtmosphere, noiseTexture, skyUniforms } from './sky.js';

export const CHUNK = 320;          // chunk length (z)
export const CHUNK_W = 2600;       // total terrain width
export const NUM_CHUNKS = 11;
export const WATER_Y = 0;

// ---------------------------------------------------------------- zones
export const ZONES = {
  plains: { amp: 36, base: 16, ridged: 0.0, urban: 0, trees: 1.0, spires: 0.35, towers: 0.0, arches: 0.4, macro: 28 },
  city:   { amp: 6,  base: 18, ridged: 0.0, urban: 1, trees: 0.12, spires: 0.0, towers: 1.0, arches: 1.0, macro: 5 },
  canyon: { amp: 130, base: 30, ridged: 1.0, urban: 0, trees: 0.2, spires: 1.0, towers: 0.0, arches: 0.15, macro: 40 },
  ocean:  { amp: 50, base: -36, ridged: 0.0, urban: 0, trees: 0.35, spires: 0.5, towers: 0.0, arches: 0.0, macro: 34 },
};
const KEYS = Object.keys(ZONES.plains);

/** Default zone timeline: a long plains opening (~13 s at 215 u/s), then city, canyon, ocean, and round again. */
export const DEFAULT_SCHEDULE = [
  { start: 0, name: 'plains' }, { start: 2800, name: 'city' }, { start: 5400, name: 'canyon' },
  { start: 7600, name: 'ocean' }, { start: 9600, name: 'plains' }, { start: 11400, name: 'city' },
];

export class ZoneSchedule {
  /**
   * @param {object} [opts]
   * @param {{start:number,name:string}[]} [opts.list]  zone starts in travel distance (units)
   * @param {number} [opts.offset]  shifts every start (positive = zones arrive later)
   * @param {number} [opts.blend]   cross-fade length between zones
   */
  constructor(opts = {}) {
    const src = (opts.list ?? DEFAULT_SCHEDULE).map((z) => ({ start: z.start + (opts.offset ?? 0), name: z.name }))
      .filter((z) => ZONES[z.name]).sort((a, b) => a.start - b.start);
    // absolute distance (positive, along travel) where each zone starts; the first zone extends backwards forever
    if (!src.length) src.push({ start: 0, name: 'plains' });
    src[0] = { start: -1e9, name: src[0].name };
    this.list = src;
    this.blend = opts.blend ?? 420;
  }
  /** Force `name` to begin just beyond the horizon. */
  spawn(name, dist, ahead = CHUNK * (NUM_CHUNKS - 1)) {
    if (!ZONES[name]) return;
    const start = dist + ahead;
    this.list = this.list.filter((z) => z.start < start - this.blend);
    this.list.push({ start, name });
  }
  nameAt(d) {
    let n = 'plains';
    for (const z of this.list) if (d >= z.start) n = z.name;
    return n;
  }
  /** Blended zone params at absolute distance d. */
  paramsAt(d, out = {}) {
    let cur = this.list[0], next = null;
    for (let i = 0; i < this.list.length; i++) {
      if (d >= this.list[i].start) cur = this.list[i]; else { next = this.list[i]; break; }
    }
    const prev = this.list[this.list.indexOf(cur) - 1];
    const A = ZONES[cur.name];
    for (const k of KEYS) out[k] = A[k];
    if (prev) {
      const t = smooth((d - cur.start) / this.blend);
      const P = ZONES[prev.name];
      for (const k of KEYS) out[k] = P[k] + (A[k] - P[k]) * t;
    }
    out.name = cur.name;
    out.next = next?.name;
    return out;
  }
}
const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- height field
/** River centre-line x for travel distance d. */
export function riverX(d) {
  return 160 * Math.sin(d * 0.0021) + 70 * Math.sin(d * 0.0067 + 1.3) + 22 * Math.sin(d * 0.017);
}
const RIVER_W = 58;

/** Terrain height at world x and travel distance d. p = zone params. */
export function heightAt(x, d, p) {
  const f = 0.0028;
  const n = fbm(x * f, d * f, 5);
  const r = p.ridged > 0.001 ? ridged(x * f * 0.9 + 3.3, d * f * 0.9, 5) : 0;
  let h = p.base + p.amp * (n * (1 - p.ridged) + r * p.ridged) + p.macro * fbm(x * 0.0007 + 9, d * 0.0007, 3);
  // gentle valley along the flight path so the river reads and the middle stays flyable
  const cx = Math.abs(x) / 900;
  h += 30 * cx * cx * (1 - p.urban);
  // urban plateau: flatten & terrace
  if (p.urban > 0) {
    const plateau = 18 + 3 * vnoise(x * 0.01, d * 0.01);
    h = h + (plateau - h) * p.urban;
  }
  // river channel (widens into a broad canal through the city so the towers frame the rail)
  const rw = RIVER_W * (1 + 0.9 * p.urban);
  const dx = Math.abs(x - riverX(d));
  const mask = 1 - smooth((dx - rw * 0.3) / (rw * 1.7));
  const bed = -18 + 6 * vnoise(x * 0.02, d * 0.02);
  h = h + (bed - h) * mask;
  // shallow bank shelf so the shoreline reads; in the city it becomes a stepped embankment
  const bank = smooth((dx - rw) / 70) * (1 - smooth((dx - rw) / 150));
  h -= bank * 4 * (1 - p.urban);
  if (p.urban > 0.001) {
    const quay = smooth((dx - rw * 1.05) / 12) * p.urban;
    h = h + (Math.max(h, 12) - h) * quay;   // quay wall rises straight out of the water
  }
  return h;
}

/** Half-width of the clear flight corridor around the rail (props stay outside it). */
export const CORRIDOR = 215;

// ---------------------------------------------------------------- colours (linear)
const C = (hex) => new THREE.Color(hex).convertSRGBToLinear();
const COL = {
  grassA: C(0x46a03a), grassB: C(0x93cf52), grassC: C(0x2a7a48), grassDry: C(0xc2c964), grassMeadow: C(0x6fbf3e),
  dirt: C(0x8a6c4c), rock: C(0x6f6a72), rockB: C(0x9a9088), cliff: C(0x4c4a56),
  sand: C(0xe2d3a4), snow: C(0xf2f6fc), bed: C(0x3f7f66), deep: C(0x1c4a52),
  urban: C(0x8d97a6), urbanB: C(0xb7c1cf), road: C(0x3a414d), roadLine: C(0xd8d2a0), plaza: C(0x6f8fa8), quay: C(0xa9b3bd), quayDark: C(0x5d6873),
  canyonRock: C(0xb5714a), canyonRockB: C(0xe0a76e), canyonDark: C(0x7a4630),
};
const tmp = new THREE.Color(), tmp2 = new THREE.Color();

export function createTerrainMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.0 });
  // detail: break up vertex-colour gradients with world-space noise, add grazing-angle sky tint
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNoise = { value: noiseTexture() };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uNoise;')
      .replace('#include <color_fragment>', /* glsl */ `
        #include <color_fragment>
        {
          vec2 wp = vWorldPos.xz;
          float nA = texture2D(uNoise, wp * 0.0022).r;
          float nB = texture2D(uNoise, wp * 0.011 + 3.1).g;
          float nC = texture2D(uNoise, wp * 0.06).r;
          float nD = texture2D(uNoise, wp * 0.21 + 7.7).g;   // grass tuft micro-detail
          float v = (nA - 0.5) * 0.40 + (nB - 0.5) * 0.30 + (nC - 0.5) * 0.18 + (nD - 0.5) * 0.10;
          // dirt/dry patches only on greenish surfaces
          float grassy = smoothstep(0.05, 0.25, diffuseColor.g - diffuseColor.r);
          diffuseColor.rgb *= 1.0 + v * mix(0.45, 1.0, grassy);
          // sun-bleached straw patches and darker moss hollows
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.30, 1.10, 0.66), grassy * smoothstep(0.56, 0.72, nA * 0.6 + nB * 0.4) * 0.55);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.72, 0.9, 0.75), grassy * smoothstep(0.30, 0.18, nA * 0.5 + nB * 0.5) * 0.5);
          // small clover/flower speckle in the meadows
          float fl = smoothstep(0.86, 0.9, texture2D(uNoise, wp * 0.5).r) * grassy * smoothstep(0.5, 0.65, nB);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.85, 0.35), fl * 0.6);
        }`)
      .replace('#include <normal_fragment_maps>', /* glsl */ `
        #include <normal_fragment_maps>
        {
          // procedural bump from world-space noise so raking sun picks up ground texture
          vec2 wp = vWorldPos.xz;
          float e = 0.35;
          float h0 = texture2D(uNoise, wp * 0.045).r * 0.6 + texture2D(uNoise, wp * 0.17 + 2.3).g * 0.4;
          float hx = texture2D(uNoise, (wp + vec2(e, 0.0)) * 0.045).r * 0.6 + texture2D(uNoise, (wp + vec2(e, 0.0)) * 0.17 + 2.3).g * 0.4;
          float hz = texture2D(uNoise, (wp + vec2(0.0, e)) * 0.045).r * 0.6 + texture2D(uNoise, (wp + vec2(0.0, e)) * 0.17 + 2.3).g * 0.4;
          float dist = length(vViewPosition);
          float k = 1.4 * (1.0 - smoothstep(150.0, 900.0, dist));
          vec3 pw = vec3(-(hx - h0), 0.0, -(hz - h0)) * k;
          normal = normalize(normal + mat3(viewMatrix) * pw);
        }`)
      .replace('#include <lights_fragment_begin>', /* glsl */ `
        #include <lights_fragment_begin>
        {
          // Wrap / sky-bounce lighting: the low sun would otherwise leave every back-slope
          // as a hard black terminator. Soft ground-bounce (warm) below, sky (cool) above.
          vec3 sunV = normalize(mat3(viewMatrix) * uSunDir);          // sun in view space (normal is view space)
          float upV = dot(normal, mat3(viewMatrix) * vec3(0.0, 1.0, 0.0));
          float ndl = dot(normal, sunV);
          float wrap = smoothstep(-0.9, 0.5, ndl) * (1.0 - smoothstep(0.0, 0.6, ndl));
          reflectedLight.indirectDiffuse += diffuseColor.rgb * (vec3(0.72, 0.66, 0.50) * 0.34 * wrap + vec3(0.40, 0.55, 0.85) * 0.12 * (0.5 + 0.5 * upV));
          // faint sheen on grass at grazing angles (dew / blade specular) so hills have volume
          vec3 Vv = normalize(vViewPosition);
          vec3 Hh = normalize(Vv + sunV);
          float sheen = pow(max(dot(normal, Hh), 0.0), 18.0) * pow(1.0 - max(dot(normal, Vv), 0.0), 2.0);
          reflectedLight.directSpecular += vec3(1.0, 0.92, 0.7) * sheen * 0.18;
        }`)
      .replace('#include <dithering_fragment>', /* glsl */ `
        #include <dithering_fragment>
        {
          float rim = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewPosition)), 0.0), 3.0);
          gl_FragColor.rgb += vec3(0.50, 0.66, 0.92) * rim * 0.05;
        }`);
  };
  return patchAtmosphere(mat, skyUniforms());
}

// ---------------------------------------------------------------- chunk
export class TerrainChunk {
  constructor(material, segX = 104, segZ = 16) {
    this.segX = segX; this.segZ = segZ;
    const g = new THREE.PlaneGeometry(CHUNK_W, CHUNK, segX, segZ);
    g.rotateX(-Math.PI / 2); // spans x in [-W/2,W/2], z in [-L/2, L/2]; rows run -z -> +z
    const n = g.attributes.position.count;
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.geometry = g;
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.frustumCulled = false;
    this.index = -1;
  }

  /** Build for chunk index i: covers travel distance [i*L, (i+1)*L]. Placed at z = -(i*L + L/2). */
  build(i, schedule, rng) {
    this.index = i;
    const d0 = i * CHUNK;
    const pos = this.geometry.attributes.position;
    const col = this.geometry.attributes.color;
    const nor = this.geometry.attributes.normal;
    const p = {};
    const e = 2.0;
    const sx = this.segX + 1, sz = this.segZ + 1;
    for (let row = 0; row < sz; row++) {
      // rows go from -z (row 0, far edge, d = d0+L) to +z (near edge, d = d0); keeps winding up-facing
      const lz = -CHUNK / 2 + (row / this.segZ) * CHUNK;
      const d = d0 + (CHUNK / 2 - lz);
      schedule.paramsAt(d, p);
      const rx = riverX(d);
      for (let cx = 0; cx < sx; cx++) {
        const vi = row * sx + cx;
        // denser sampling near the flight corridor: remap x with a mild S-curve
        const u = cx / this.segX * 2 - 1;
        const x = (CHUNK_W / 2) * (u * 0.55 + u * u * u * 0.45);
        const h = heightAt(x, d, p);
        const hx = heightAt(x + e, d, p), hz = heightAt(x, d + e, p);
        pos.setXYZ(vi, x, h, lz);
        const nx = -(hx - h) / e, nz = (hz - h) / e;
        const inv = 1 / Math.hypot(nx, 1, nz);
        nor.setXYZ(vi, nx * inv, inv, nz * inv);
        const slope = 1 - inv; // 0 flat .. 1 vertical

        // ---- colour
        const nv = fbm(x * 0.012 + 40, d * 0.012, 3);
        const nv2 = vnoise(x * 0.004 + 7, d * 0.004);
        tmp.copy(COL.grassA).lerp(COL.grassB, 0.5 + 0.5 * nv);
        tmp.lerp(COL.grassMeadow, smooth((vnoise(x * 0.0025 + 21, d * 0.0025) + 0.1) / 0.5) * 0.5);
        tmp.lerp(COL.grassDry, smooth((nv2 - 0.25) / 0.5) * 0.55);
        tmp.lerp(COL.grassC, smooth((h - 45) / 60) * 0.6);
        // valley floors slightly cooler / lusher than the sunlit crests
        tmp.lerp(COL.grassC, smooth((14 - h) / 10) * 0.25);
        // canyon uses warm banded rock
        if (p.ridged > 0.01) {
          const band = 0.5 + 0.5 * Math.sin(h * 0.35 + 2.0 * vnoise(x * 0.01, d * 0.01));
          tmp2.copy(COL.canyonRock).lerp(COL.canyonRockB, band);
          tmp2.lerp(COL.canyonDark, smooth((slope - 0.5) / 0.3) * 0.6);
          tmp.lerp(tmp2, p.ridged * (0.4 + 0.6 * smooth((h - 15) / 50)));
        }
        // dirt then rock then cliff as slope steepens
        tmp.lerp(COL.dirt, smooth((slope - 0.14) / 0.14) * (1 - smooth((slope - 0.35) / 0.2)) * 0.7);
        const rockT = smooth((slope - 0.28) / 0.28);
        tmp2.copy(COL.rock).lerp(COL.rockB, 0.5 + 0.5 * vnoise(x * 0.03, d * 0.03));
        tmp.lerp(tmp2, rockT * (1 - p.ridged * 0.7));
        tmp.lerp(COL.cliff, smooth((slope - 0.62) / 0.25) * 0.7);
        // snow at altitude
        tmp.lerp(COL.snow, smooth((h - 105 - 25 * nv) / 30) * (1 - rockT * 0.6));
        // urban paving with road grid + plazas
        if (p.urban > 0.01) {
          const gx = Math.abs(((x + 60) % 120) - 60), gd = Math.abs(((d + 60) % 120) - 60);
          const grid = Math.max(1 - smooth((gx - 7) / 3), 1 - smooth((gd - 7) / 3));
          const line = Math.max(1 - smooth((gx - 0.8) / 0.8), 1 - smooth((gd - 0.8) / 0.8)) * grid;
          tmp2.copy(COL.urban).lerp(COL.urbanB, 0.5 + 0.5 * vnoise(x * 0.05, d * 0.05));
          tmp2.lerp(COL.plaza, smooth((vnoise(x * 0.008 + 3, d * 0.008) - 0.35) / 0.2) * 0.6);
          tmp2.lerp(COL.road, grid);
          tmp2.lerp(COL.roadLine, line * 0.6);
          const dxr = Math.abs(x - rx);
          const rwu = 58 * (1 + 0.9 * p.urban);
          tmp.lerp(tmp2, p.urban * smooth((dxr - rwu * 1.15) / 30));
          // concrete quay wall + promenade lip along the canal (no sand / dirt in the city)
          const wall = smooth((dxr - rwu * 0.85) / 12) * (1 - smooth((dxr - rwu * 1.15) / 30));
          tmp2.copy(COL.quay).lerp(COL.quayDark, smooth((slope - 0.3) / 0.3) * 0.7);
          tmp.lerp(tmp2, p.urban * wall);
        }
        // shore sand + river bed
        tmp.lerp(COL.sand, smooth((6 - h) / 5) * (1 - smooth((-2 - h) / 6)));
        tmp.lerp(COL.bed, smooth((-1 - h) / 6));
        tmp.lerp(COL.deep, smooth((-10 - h) / 10));
        col.setXYZ(vi, tmp.r, tmp.g, tmp.b);
      }
    }
    pos.needsUpdate = true; col.needsUpdate = true; nor.needsUpdate = true;
    this.geometry.computeBoundingSphere();
    this.mesh.position.set(0, 0, -(d0 + CHUNK / 2));
  }
}
