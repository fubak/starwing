import * as THREE from 'three';
import { fbm, ridged, vnoise } from './noise.js';

export const CHUNK = 320;          // chunk length (z) and width segment size
export const CHUNK_W = 2400;       // total terrain width
export const NUM_CHUNKS = 11;
export const WATER_Y = 0;

// ---------------------------------------------------------------- zones
export const ZONES = {
  plains: { amp: 34, base: 14, ridged: 0.0, urban: 0, trees: 1.0, spires: 0.35, towers: 0.0, arches: 0.35, macro: 26 },
  city:   { amp: 7,  base: 16, ridged: 0.0, urban: 1, trees: 0.15, spires: 0.0, towers: 1.0, arches: 1.0, macro: 6 },
  canyon: { amp: 120, base: 34, ridged: 1.0, urban: 0, trees: 0.25, spires: 1.0, towers: 0.0, arches: 0.15, macro: 40 },
  ocean:  { amp: 46, base: -34, ridged: 0.0, urban: 0, trees: 0.3, spires: 0.45, towers: 0.0, arches: 0.0, macro: 30 },
};
const KEYS = Object.keys(ZONES.plains);

export class ZoneSchedule {
  constructor() {
    // absolute distance (positive, along travel) where each zone starts
    this.list = [{ start: -1e9, name: 'plains' }, { start: 1500, name: 'city' }, { start: 3600, name: 'canyon' }, { start: 5600, name: 'ocean' }, { start: 7400, name: 'plains' }];
    this.blend = 420;
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
    // blend in from previous zone across `blend` after start
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
  return 150 * Math.sin(d * 0.0021) + 70 * Math.sin(d * 0.0067 + 1.3) + 25 * Math.sin(d * 0.017);
}
const RIVER_W = 55;

/**
 * Terrain height at world x and travel distance d (>= 0, increasing forward).
 * p = zone params (from ZoneSchedule.paramsAt).
 */
export function heightAt(x, d, p) {
  const f = 0.0028;
  const n = fbm(x * f, d * f, 5);
  const r = p.ridged > 0 ? ridged(x * f * 0.9 + 3.3, d * f * 0.9, 5) : 0;
  let h = p.base + p.amp * (n * (1 - p.ridged) + r * p.ridged) + p.macro * fbm(x * 0.0007 + 9, d * 0.0007, 3);
  // urban plateau: flatten & terrace
  if (p.urban > 0) {
    const plateau = 16 + 3 * vnoise(x * 0.01, d * 0.01);
    h = h + (plateau - h) * p.urban;
  }
  // river channel
  const dx = Math.abs(x - riverX(d));
  const mask = 1 - smooth((dx - RIVER_W * 0.3) / (RIVER_W * 1.6));
  const bed = -16 + 6 * vnoise(x * 0.02, d * 0.02);
  h = h + (bed - h) * mask;
  // shallow bank shelf so the shoreline reads
  const bank = smooth((dx - RIVER_W) / 70) * (1 - smooth((dx - RIVER_W) / 140));
  h -= bank * 4;
  return h;
}

// ---------------------------------------------------------------- colours (linear)
const C = (hex) => new THREE.Color(hex).convertSRGBToLinear();
const COL = {
  grassA: C(0x4d9a34), grassB: C(0x8cc44a), grassC: C(0x2f7a3e),
  rock: C(0x7a6a5c), rockB: C(0x9a8574), cliff: C(0x5b4f49),
  sand: C(0xd6c59a), snow: C(0xf0f4fa), bed: C(0x3d6f5a), deep: C(0x1d3f44),
  urban: C(0x707c8c), urbanB: C(0x9aa4b2), road: C(0x3f4652),
  canyonRock: C(0xa86f4e), canyonRockB: C(0xd9a070),
};
const tmp = new THREE.Color();

export function createTerrainMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.0 });
  // add sun-facing warmth + fresnel-ish rim through onBeforeCompile so terrain isn't flat
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
       // subtle atmospheric tint on grazing surfaces
       float rim = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewPosition)), 0.0), 3.0);
       gl_FragColor.rgb += vec3(0.55, 0.68, 0.9) * rim * 0.06;`
    );
  };
  return mat;
}

// ---------------------------------------------------------------- chunk
export class TerrainChunk {
  constructor(material, segX = 75, segZ = 10) {
    this.segX = segX; this.segZ = segZ;
    const g = new THREE.PlaneGeometry(CHUNK_W, CHUNK, segX, segZ);
    g.rotateX(-Math.PI / 2); // now spans x in [-W/2,W/2], z in [-L/2, L/2]
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
      // PlaneGeometry rows go from +z (row 0) to -z; local z = L/2 - row*L/segZ ; travel d = d0 + (L/2 - z)
      const lz = CHUNK / 2 - (row / this.segZ) * CHUNK;
      const d = d0 + (CHUNK / 2 - lz);
      schedule.paramsAt(d, p);
      const rx = riverX(d);
      for (let cx = 0; cx < sx; cx++) {
        const vi = row * sx + cx;
        const x = -CHUNK_W / 2 + (cx / this.segX) * CHUNK_W;
        const h = heightAt(x, d, p);
        const hx = heightAt(x + e, d, p), hz = heightAt(x, d + e, p);
        pos.setXYZ(vi, x, h, lz);
        // normal: forward (travel) is -z, so dh/dd maps to +z slope sign flip
        const nx = -(hx - h) / e, nz = (hz - h) / e;
        const inv = 1 / Math.hypot(nx, 1, nz);
        nor.setXYZ(vi, nx * inv, inv, nz * inv);
        const slope = 1 - inv; // 0 flat .. 1 vertical

        // ---- colour
        const nv = fbm(x * 0.012 + 40, d * 0.012, 3);
        tmp.copy(COL.grassA).lerp(COL.grassB, 0.5 + 0.5 * nv);
        tmp.lerp(COL.grassC, smooth((h - 40) / 60) * 0.6);
        // canyon uses warm rock
        if (p.ridged > 0.01) {
          const c2 = COL.canyonRock.clone().lerp(COL.canyonRockB, 0.5 + 0.5 * vnoise(h * 0.08, x * 0.01));
          tmp.lerp(c2, p.ridged * (0.35 + 0.65 * smooth((h - 20) / 50)));
        }
        // rock on slopes
        const rockT = smooth((slope - 0.25) / 0.3);
        tmp.lerp(COL.rock.clone().lerp(COL.rockB, 0.5 + 0.5 * vnoise(x * 0.03, d * 0.03)), rockT);
        tmp.lerp(COL.cliff, smooth((slope - 0.6) / 0.25) * 0.7);
        // snow at altitude
        tmp.lerp(COL.snow, smooth((h - 95 - 25 * nv) / 30) * (1 - rockT * 0.6));
        // urban paving with road grid
        if (p.urban > 0.01) {
          const grid = Math.max(
            1 - smooth((Math.abs(((x + 60) % 120) - 60) - 6) / 4),
            1 - smooth((Math.abs(((d + 60) % 120) - 60) - 6) / 4));
          const pav = COL.urban.clone().lerp(COL.urbanB, 0.5 + 0.5 * vnoise(x * 0.05, d * 0.05));
          pav.lerp(COL.road, grid);
          const dxr = Math.abs(x - rx);
          tmp.lerp(pav, p.urban * smooth((dxr - 95) / 40));
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
