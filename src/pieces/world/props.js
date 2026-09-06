import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { vnoise } from './noise.js';
import { CHUNK, heightAt, riverX } from './terrain.js';
import { patchAtmosphere, skyUniforms } from './sky.js';

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/** InstancedMesh pool with a free-list; chunks claim & release instances. */
class Pool {
  constructor(geometry, material, capacity, { shadow = true } = {}) {
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = shadow; this.mesh.receiveShadow = shadow;
    this.free = [];
    for (let i = capacity - 1; i >= 0; i--) { this.free.push(i); this.mesh.setMatrixAt(i, ZERO); }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.color = new THREE.Color();
  }
  claim(x, y, z, ry, sx, sy, sz, tint, rx = 0, rz = 0) {
    if (!this.free.length) return -1;
    const i = this.free.pop();
    _e.set(rx, ry, rz); _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    this.mesh.setMatrixAt(i, _m);
    if (tint) this.mesh.setColorAt(i, tint);
    this.dirty = true;
    return i;
  }
  release(i) { this.mesh.setMatrixAt(i, ZERO); this.free.push(i); this.dirty = true; }
  flush() {
    if (!this.dirty) return;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.dirty = false;
  }
}

// ---------------------------------------------------------------- textures
function windowTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#0a0d14'; g.fillRect(0, 0, 128, 256);
  for (let y = 6; y < 250; y += 12) for (let x = 6; x < 124; x += 10) {
    const on = Math.random() < 0.55;
    g.fillStyle = on ? (Math.random() < 0.7 ? '#ffe2b0' : '#a8d8ff') : '#1a2230';
    g.fillRect(x, y, 6, 7);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function facadeTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#c9d3de'; g.fillRect(0, 0, 128, 256);
  // panel lines
  g.fillStyle = '#aab6c4';
  for (let y = 0; y < 256; y += 12) g.fillRect(0, y, 128, 2);
  for (let x = 0; x < 128; x += 10) g.fillRect(x, 0, 2, 256);
  // dark window glass
  for (let y = 6; y < 250; y += 12) for (let x = 6; x < 124; x += 10) { g.fillStyle = '#35465c'; g.fillRect(x, y, 6, 7); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------- geometries
function towerGeometry() {
  // body 1x1x1 (unit), stacked setbacks + spire; scaled per-instance
  const parts = [];
  const body = new THREE.BoxGeometry(1, 1, 1); body.translate(0, 0.5, 0); parts.push(body);
  const top = new THREE.BoxGeometry(0.7, 0.18, 0.7); top.translate(0, 1.09, 0); parts.push(top);
  const cap = new THREE.BoxGeometry(0.42, 0.10, 0.42); cap.translate(0, 1.23, 0); parts.push(cap);
  const ant = new THREE.CylinderGeometry(0.03, 0.05, 0.35, 6); ant.translate(0, 1.45, 0); parts.push(ant);
  const g = mergeGeometries(parts, false);
  // scale UVs so windows tile ~ per 4 units later via material repeat — keep as is
  return g;
}
function spireGeometry(rng) {
  // tapered, twisted rock needle with strata vertex colours (flat-shaded)
  const g = new THREE.ConeGeometry(1, 1, 14, 12, false);
  g.translate(0, 0.5, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const r = Math.hypot(x, z);
    const n = 1 + 0.32 * vnoise(a * 1.7 + 3, y * 4.0) + 0.16 * vnoise(a * 4.0, y * 9.0 + 7) + 0.10 * vnoise(a * 9.0, y * 20.0);
    const twist = 0.2 * vnoise(y * 3.0, 1.3) + y * 0.12;
    // step the silhouette into strata ledges
    const ledge = 1 + 0.05 * (Math.floor(y * 9) % 2);
    pos.setXYZ(i, Math.cos(a + twist) * r * n * ledge, y * (1 + 0.1 * vnoise(a, 2)), Math.sin(a + twist) * r * n * ledge);
  }
  const nonIndexed = g.toNonIndexed();
  nonIndexed.computeVertexNormals();
  const p2 = nonIndexed.attributes.position, cnt = p2.count;
  const col = new Float32Array(cnt * 3);
  const A = new THREE.Color(0xdea274).convertSRGBToLinear(), B = new THREE.Color(0xa56a48).convertSRGBToLinear(), T = new THREE.Color(0xf0d2ac).convertSRGBToLinear();
  const c = new THREE.Color();
  for (let i = 0; i < cnt; i++) {
    const y = p2.getY(i);
    const band = 0.5 + 0.5 * Math.sin(y * 34 + 1.5 * vnoise(y * 5, 0.3));
    c.copy(A).lerp(B, band * 0.75).lerp(T, Math.max(0, (y - 0.7) / 0.3) * 0.5);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  nonIndexed.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return nonIndexed;
}
function treeGeometry() {
  const trunk = new THREE.CylinderGeometry(0.08, 0.14, 0.5, 5); trunk.translate(0, 0.25, 0);
  const c1 = new THREE.ConeGeometry(0.55, 0.9, 7); c1.translate(0, 0.85, 0);
  const c2 = new THREE.ConeGeometry(0.38, 0.7, 7); c2.translate(0, 1.35, 0);
  const g = mergeGeometries([trunk, c1, c2], false);
  // vertex colours: trunk brown, foliage green gradient
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const brown = new THREE.Color(0x5a3b26).convertSRGBToLinear(), gA = new THREE.Color(0x246b36).convertSRGBToLinear(), gB = new THREE.Color(0x63b64a).convertSRGBToLinear();
  const t = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const y = g.attributes.position.getY(i);
    if (y < 0.51 && i < trunk.attributes.position.count) t.copy(brown); else t.copy(gA).lerp(gB, Math.min(1, (y - 0.4) / 1.3));
    col[i * 3] = t.r; col[i * 3 + 1] = t.g; col[i * 3 + 2] = t.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function archGeometry() {
  const arc = new THREE.TorusGeometry(1, 0.075, 10, 40, Math.PI);
  const pillarL = new THREE.CylinderGeometry(0.09, 0.12, 0.6, 10); pillarL.translate(-1, -0.3, 0);
  const pillarR = pillarL.clone(); pillarR.translate(2, 0, 0);
  const beam = new THREE.BoxGeometry(2.3, 0.05, 0.25); beam.translate(0, 0.02, 0);
  return mergeGeometries([arc, pillarL, pillarR, beam], false);
}
function blockGeometry() {
  const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0);
  return g;
}

// ---------------------------------------------------------------- props manager
export class Props {
  constructor(rng) {
    this.rng = rng;
    const win = windowTexture(), fac = facadeTexture();
    this.towerMat = new THREE.MeshStandardMaterial({
      map: fac, emissiveMap: win, emissive: new THREE.Color(0xffc98a), emissiveIntensity: 0.55,
      roughness: 0.28, metalness: 0.6, color: 0xe6eef8, envMapIntensity: 1.2,
    });
    // window texture repeats by tower height: handled via per-instance uv is complex — use a mid repeat
    fac.repeat.set(2, 6); win.repeat.set(2, 6);
    this.blockMat = new THREE.MeshStandardMaterial({ map: fac, roughness: 0.5, metalness: 0.4, color: 0xc4d0de });
    this.spireMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.0, flatShading: true });
    this.treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    this.archMat = new THREE.MeshStandardMaterial({ color: 0xeef3f8, roughness: 0.22, metalness: 0.85, emissive: 0x2a6ed8, emissiveIntensity: 0.35 });
    this.beaconMat = new THREE.MeshStandardMaterial({ color: 0xff6a3a, emissive: 0xff3a1a, emissiveIntensity: 5.0, roughness: 0.4 });
    const shared = skyUniforms();
    for (const m of [this.towerMat, this.blockMat, this.spireMat, this.treeMat, this.archMat]) patchAtmosphere(m, shared);

    this.towers = new Pool(towerGeometry(), this.towerMat, 220);
    this.blocks = new Pool(blockGeometry(), this.blockMat, 400);
    this.spires = new Pool(spireGeometry(rng), this.spireMat, 160);
    this.trees = new Pool(treeGeometry(), this.treeMat, 900, { shadow: true });
    this.trees.mesh.receiveShadow = false;
    this.arches = new Pool(archGeometry(), this.archMat, 24);
    this.beacons = new Pool(new THREE.SphereGeometry(1, 8, 6), this.beaconMat, 220, { shadow: false });
    this.pools = [this.towers, this.blocks, this.spires, this.trees, this.arches, this.beacons];
    this.group = new THREE.Group();
    for (const p of this.pools) this.group.add(p.mesh);
    this.chunkClaims = new Map(); // chunkIndex -> [{pool, id}]
    this.tint = new THREE.Color();
  }

  release(chunkIndex) {
    const arr = this.chunkClaims.get(chunkIndex);
    if (!arr) return;
    for (const { pool, id } of arr) pool.release(id);
    this.chunkClaims.delete(chunkIndex);
  }

  /** Populate props for chunk i (travel range [i*L,(i+1)*L]). world z = -d. */
  populate(i, schedule) {
    const rng = this.rng, claims = [];
    const d0 = i * CHUNK;
    const p = schedule.paramsAt(d0 + CHUNK / 2);
    const claim = (pool, ...a) => { const id = pool.claim(...a); if (id >= 0) claims.push({ pool, id }); };
    const H = (x, d) => heightAt(x, d, schedule.paramsAt(d));

    // trees
    const nTrees = Math.floor(75 * p.trees);
    for (let k = 0; k < nTrees; k++) {
      const x = rng.range(-1100, 1100), d = d0 + rng.range(0, CHUNK);
      if (Math.abs(x - riverX(d)) < 75) continue;
      const h = H(x, d);
      if (h < 4 || h > 90) continue;
      const slope = Math.abs(H(x + 3, d) - h) + Math.abs(H(x, d + 3) - h);
      if (slope > 2.6) continue;
      const s = rng.range(7, 13);
      this.tint.setHSL(0.3 + rng.range(-0.03, 0.03), 0.5, 0.5);
      claim(this.trees, x, h - 0.5, -d, rng.range(0, 6.28), s, s * rng.range(0.9, 1.3), s, this.tint);
    }
    // rock spires
    const nSp = Math.floor(9 * p.spires);
    for (let k = 0; k < nSp; k++) {
      const x = rng.range(-1000, 1000), d = d0 + rng.range(0, CHUNK);
      if (Math.abs(x - riverX(d)) < 110) continue;
      const h = H(x, d);
      if (h < 2) continue;
      const r = rng.range(12, 34), hh = rng.range(50, 170) * (p.ridged > 0.5 ? 1.3 : 1);
      this.tint.setHSL(0.07 + rng.range(-0.02, 0.02), 0.2, rng.range(0.8, 0.96));
      claim(this.spires, x, h - 6, -d, rng.range(0, 6.28), r, hh, r * rng.range(0.7, 1.2), this.tint, rng.range(-0.06, 0.06), rng.range(-0.06, 0.06));
    }
    // city: towers on a grid with jitter, low blocks between
    if (p.towers > 0.05) {
      for (let gz = 20; gz < CHUNK; gz += 60) for (let gx = -900; gx <= 900; gx += 60) {
        if (rng.next() > p.towers * 0.9) continue;
        const d = d0 + gz + rng.range(-8, 8), x = gx + rng.range(-8, 8);
        const dr = Math.abs(x - riverX(d));
        if (dr < 120) continue;
        const h = H(x, d);
        if (h < 6) continue;
        const near = Math.abs(x) < 380 ? 1 : 0.55; // taller downtown core
        if (rng.next() < 0.45) {
          const w = rng.range(18, 30), ht = rng.range(60, 230) * near;
          const pick = rng.next();
          if (pick < 0.6) this.tint.setHSL(0.58 + rng.range(-0.04, 0.04), 0.18, rng.range(0.8, 0.97));
          else if (pick < 0.85) this.tint.setHSL(0.52, 0.45, rng.range(0.55, 0.7)); // teal glass
          else this.tint.setHSL(0.08, 0.35, 0.72); // warm sandstone
          claim(this.towers, x, h - 1, -d, Math.round(rng.range(0, 3)) * Math.PI / 2, w, ht, w, this.tint);
          if (ht > 120) claim(this.beacons, x, h - 1 + ht * 1.63, -d, 0, 2.2, 2.2, 2.2, null);
        } else {
          const w = rng.range(22, 42), ht = rng.range(10, 40);
          this.tint.setHSL(0.6, 0.15, rng.range(0.6, 0.85));
          claim(this.blocks, x, h - 1, -d, 0, w, ht, w * rng.range(0.6, 1.1), this.tint);
        }
      }
    }
    // arches over the river
    if (i % 2 === 0 && rng.next() < p.arches) {
      const d = d0 + CHUNK / 2;
      const xr = riverX(d);
      const dir = Math.atan2(riverX(d + 10) - riverX(d - 10), 20);
      const R = rng.range(70, 110);
      this.tint.setHSL(0.58, 0.2, 0.92);
      claim(this.arches, xr, -6, -d, dir, R, R, R, this.tint);
    }
    this.chunkClaims.set(i, claims);
  }

  flush() { for (const p of this.pools) p.flush(); }
}
