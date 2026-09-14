import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { vnoise } from './noise.js';
import { CHUNK, CORRIDOR, heightAt, riverX } from './terrain.js';
import { patchAtmosphere, skyUniforms, noiseTexture } from './sky.js';

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/** InstancedMesh pool with a free-list; chunks claim & release instances. Optional per-instance extras (seed + accent colour). */
class Pool {
  constructor(geometry, material, capacity, { shadow = true, extras = false } = {}) {
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = shadow; this.mesh.receiveShadow = shadow;
    this.free = [];
    for (let i = capacity - 1; i >= 0; i--) { this.free.push(i); this.mesh.setMatrixAt(i, ZERO); }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.hi = 0;                 // high-water mark: mesh.count is clamped to live range in flush()
    this.mesh.count = 0;         // nothing live yet -> zero instanced triangles drawn/counted
    if (extras) {
      this.seed = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
      this.accent = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
      geometry.setAttribute('aSeed', this.seed);
      geometry.setAttribute('aAccent', this.accent);
    }
  }
  claim(x, y, z, ry, sx, sy, sz, tint, rx = 0, rz = 0) {
    if (!this.free.length) return -1;
    const i = this.free.pop();
    if (i + 1 > this.hi) this.hi = i + 1;
    _e.set(rx, ry, rz); _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    this.mesh.setMatrixAt(i, _m);
    if (tint) this.mesh.setColorAt(i, tint);
    this.dirty = true;
    return i;
  }
  setExtras(i, seed, accent) {
    if (!this.seed) return;
    this.seed.setX(i, seed);
    this.accent.setXYZ(i, accent.r, accent.g, accent.b);
    this.dirty = true;
  }
  release(i) { this.mesh.setMatrixAt(i, ZERO); this.free.push(i); this.dirty = true; }
  flush() {
    // shrink the drawn range to the highest live slot (dead capacity would still be
    // rasterised as degenerate tris and counted by renderer.info on every pass)
    this.mesh.count = this.hi;
    if (!this.dirty) return;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    if (this.seed) { this.seed.needsUpdate = true; this.accent.needsUpdate = true; }
    this.dirty = false;
  }
}

// ---------------------------------------------------------------- building material
/**
 * Procedural facade on a MeshStandardMaterial: per-instance seed & accent colour
 * drive a window grid (lit / dark / reflective glass), horizontal accent bands,
 * vertical fins, a dark podium and a roof plate — every tower reads differently
 * even though the geometry is instanced.
 */
function createBuildingMaterial(shared) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.15, envMapIntensity: 1.0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNoise = { value: noiseTexture() };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', /* glsl */ `#include <common>
        attribute float aSeed; attribute vec3 aAccent;
        varying vec3 vLocal; varying vec3 vScale; varying vec3 vObjN; varying float vSeed; varying vec3 vAccent;`)
      .replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
        vScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vLocal = position * vScale;
        vObjN = normal; vSeed = aSeed; vAccent = aAccent;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', /* glsl */ `#include <common>
        uniform sampler2D uNoise;
        varying vec3 vLocal; varying vec3 vScale; varying vec3 vObjN; varying float vSeed; varying vec3 vAccent;
        float gWin = 0.0; float gRoof = 0.0; vec3 gGlow = vec3(0.0);
        float bhash(vec2 p){ p = fract(p * vec2(0.1031, 0.1030) + vSeed * 0.37); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }`)
      .replace('#include <color_fragment>', /* glsl */ `
        #include <color_fragment>
        {
          vec3 n = normalize(vObjN);
          float side = 1.0 - smoothstep(0.35, 0.6, abs(n.y));
          gRoof = step(0.6, n.y);
          // facade coordinates (metres): planar faces use the tangent axis, curved use arc length
          vec2 fc;
          bool planar = abs(abs(n.x) - 1.0) < 0.02 || abs(abs(n.z) - 1.0) < 0.02;
          if (planar) fc = abs(n.x) > 0.5 ? vec2(vLocal.z, vLocal.y) : vec2(vLocal.x, vLocal.y);
          else fc = vec2(atan(vLocal.z, vLocal.x) * length(vLocal.xz), vLocal.y);
          float s1 = fract(vSeed * 7.13), s2 = fract(vSeed * 3.71), s3 = fract(vSeed * 11.9);
          vec2 cellSize = vec2(1.6 + 1.4 * s1, 3.2 + 0.6 * s2);
          vec2 cf = fc / cellSize;
          vec2 cell = floor(cf), f = fract(cf);
          // window rectangle inside the cell; style: punched windows vs ribbon glass vs curtain wall
          float style = s3;
          float wx = style < 0.25 ? 0.66 : (style < 0.55 ? 0.90 : 0.96);
          float wy = style < 0.25 ? 0.60 : (style < 0.55 ? 0.58 : 0.80);
          // anti-aliased window edges (fwidth) so distant facades don't sparkle
          vec2 aa = fwidth(cf) * 0.75 + 1e-4;
          float win = (1.0 - smoothstep(wx * 0.5 - aa.x, wx * 0.5 + aa.x, abs(f.x - 0.5))) * (1.0 - smoothstep(wy * 0.5 - aa.y, wy * 0.5 + aa.y, abs(f.y - 0.55)));
          // far away the grid dissolves into a mean glass coverage (no moire)
          float lod = smoothstep(0.35, 0.9, max(aa.x, aa.y) * 2.0);
          win = mix(win, wx * wy, lod);
          // podium (ground floors) and roof plate are not glazed
          float podium = 1.0 - smoothstep(4.0, 7.0, vLocal.y);
          float crown = smoothstep(vScale.y - 2.5, vScale.y - 1.0, vLocal.y);
          win *= side * (1.0 - podium) * (1.0 - crown);
          // accent bands: every k floors, plus a crown band; vertical fins on some
          float bandEvery = (5.0 + floor(s1 * 5.0)) * cellSize.y;
          float band = step(fract(vLocal.y / bandEvery), 0.14 / (bandEvery / cellSize.y)) * step(0.5, s2) * side;
          band = max(band, crown * side * step(0.35, s3));
          float fin = step(0.9, fract(cf.x * 0.5)) * step(0.55, s1) * side * (1.0 - win);
          vec3 facade = diffuseColor.rgb;
          // weathering & panel variation
          float pn = texture2D(uNoise, fc * 0.02 + vSeed).r;
          facade *= 0.92 + 0.16 * pn;
          facade *= mix(1.0, 0.55, podium * side);
          facade = mix(facade, facade * 0.9 + vAccent * 0.25, fin);
          facade = mix(facade, vAccent, band);
          // glass: tinted dark blue-green, lit windows glow warm/cool
          vec3 glass = mix(vec3(0.07, 0.12, 0.17), vec3(0.12, 0.22, 0.27), s2);
          // curtain-wall towers: glass carries a faint tint of the facade colour (bronze / teal / clear)
          glass = mix(glass, glass * (0.6 + 0.8 * facade), 0.35);
          // spandrel strip between floors reads slightly lighter (floor slab)
          float slab = 1.0 - smoothstep(0.03, 0.08, abs(f.y - 0.06));
          glass = mix(glass, glass * 1.6 + 0.04, slab * step(0.55, style) * (1.0 - lod));
          float lit = step(0.94 - 0.05 * s3, bhash(cell + 17.0)) * (1.0 - lod);   // daytime: only a few windows lit
          // lit windows fade with distance so the skyline doesn't sparkle into noise
          lit *= 1.0 - smoothstep(500.0, 1500.0, length(vViewPosition));
          float warm = step(0.35, bhash(cell + 91.0));
          vec3 glow = mix(vec3(0.55, 0.85, 1.0), vec3(1.0, 0.78, 0.45), warm);
          gGlow = glow * lit * win * (0.55 + 0.45 * bhash(cell + 5.0));
          diffuseColor.rgb = mix(facade, glass, win);
          // roof: darker plate with a light rim and a helipad/vents pattern
          vec2 rc = vLocal.xz;
          float rim = 1.0 - step(0.9, max(abs(rc.x) / (vScale.x * 0.5), abs(rc.y) / (vScale.z * 0.5)));
          vec3 roofCol = mix(vec3(0.45, 0.48, 0.52), vec3(0.62, 0.66, 0.72), texture2D(uNoise, rc * 0.03 + vSeed).g);
          float pad = smoothstep(0.42, 0.38, length(rc) / min(vScale.x, vScale.z)) * (1.0 - smoothstep(0.30, 0.34, length(rc) / min(vScale.x, vScale.z)));
          roofCol = mix(roofCol, vAccent, pad * step(0.6, s1));
          roofCol = mix(diffuseColor.rgb * 0.8, roofCol, rim);
          diffuseColor.rgb = mix(diffuseColor.rgb, roofCol, gRoof);
          gWin = win;
        }`)
      .replace('#include <roughnessmap_fragment>', /* glsl */ `
        #include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.18, gWin);
        roughnessFactor = mix(roughnessFactor, 0.85, gRoof);`)
      .replace('#include <metalnessmap_fragment>', /* glsl */ `
        #include <metalnessmap_fragment>
        metalnessFactor = mix(metalnessFactor, 0.7, gWin);`)
      .replace('#include <emissivemap_fragment>', /* glsl */ `
        #include <emissivemap_fragment>
        totalEmissiveRadiance += gGlow * 0.7;
        {
          // glass mirrors the sky: fresnel-weighted analytic sky reflection so the skyline reads glassy
          vec3 wN = inverseTransformDirection(normal, viewMatrix);
          vec3 wV = normalize(vWorldPos - cameraPosition);
          vec3 wR = reflect(wV, wN);
          float fr = 0.18 + 0.82 * pow(1.0 - max(dot(-wV, wN), 0.0), 4.0);
          totalEmissiveRadiance += skyColor(normalize(wR)) * gWin * fr * 0.45;
        }`);
  };
  patchAtmosphere(mat, shared);
  mat.customProgramCacheKey = () => 'building-atmos';
  return mat;
}

// ---------------------------------------------------------------- geometries
// All building geometries occupy the unit footprint [-0.5,0.5]^2 and height [0,1]; scaled per instance.
function bx(w, h, d, x, y, z) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y + h / 2, z); return g; }
function buildingGeometries() {
  const list = [];
  // 0 slab tower with setback crown + mast
  list.push(mergeGeometries([bx(1, 1, 1, 0, 0, 0), bx(0.72, 0.08, 0.72, 0, 1, 0), bx(0.4, 0.06, 0.4, 0, 1.08, 0), (() => { const c = new THREE.CylinderGeometry(0.02, 0.04, 0.3, 6); c.translate(0, 1.28, 0); return c; })()], false));
  // 1 stepped ziggurat: three tiers
  list.push(mergeGeometries([bx(1, 0.42, 1, 0, 0, 0), bx(0.76, 0.34, 0.76, 0.06, 0.42, -0.04), bx(0.5, 0.3, 0.5, 0.1, 0.76, -0.08), bx(0.22, 0.06, 0.22, 0.1, 1.06, -0.08)], false));
  // 2 twin towers with skybridge
  list.push(mergeGeometries([bx(0.42, 1, 0.5, -0.29, 0, 0), bx(0.42, 0.82, 0.5, 0.29, 0, 0), bx(0.3, 0.07, 0.3, 0, 0.6, 0), bx(0.3, 0.05, 0.36, -0.29, 1, 0)], false));
  // 3 drum (cylindrical) tower with flared cap
  list.push(mergeGeometries([(() => { const c = new THREE.CylinderGeometry(0.5, 0.5, 1, 16, 1); c.translate(0, 0.5, 0); return c; })(), (() => { const c = new THREE.CylinderGeometry(0.56, 0.5, 0.06, 16, 1); c.translate(0, 1.03, 0); return c; })(), (() => { const c = new THREE.CylinderGeometry(0.3, 0.42, 0.06, 16, 1); c.translate(0, 1.09, 0); return c; })()], false));
  // 4 podium + slender tower (offset)
  list.push(mergeGeometries([bx(1, 0.14, 1, 0, 0, 0), bx(0.46, 1, 0.56, 0.12, 0.14, -0.1), bx(0.3, 0.05, 0.3, 0.12, 1.14, -0.1)], false));
  // 5 wide slab with fins (short-wide massing)
  list.push(mergeGeometries([bx(1, 1, 0.55, 0, 0, 0), bx(0.06, 1.05, 0.62, -0.47, 0, 0), bx(0.06, 1.05, 0.62, 0.47, 0, 0), bx(0.06, 1.05, 0.62, 0, 0, 0)], false));
  for (const g of list) g.computeVertexNormals();
  return list;
}
function blockGeometry() {
  const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0);
  return g;
}
function spireGeometry(rng) {
  // tapered, twisted rock needle with strata vertex colours (flat-shaded)
  const g = new THREE.ConeGeometry(1, 1, 12, 7, false);
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
  const A = new THREE.Color(0xc98a5c), B = new THREE.Color(0x8c5236), T = new THREE.Color(0xf0d2ac);
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
function boulderGeometry() {
  const g = new THREE.IcosahedronGeometry(0.5, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = 1 + 0.28 * vnoise(x * 4 + 1, z * 4 + y * 3);
    pos.setXYZ(i, x * n, y * n * 0.7 + 0.25, z * n);
  }
  const ni = g; ni.computeVertexNormals();
  const cnt = ni.attributes.position.count, col = new Float32Array(cnt * 3);
  const A = new THREE.Color(0x8d8a90), B = new THREE.Color(0x5e5a63), c = new THREE.Color();
  for (let i = 0; i < cnt; i++) { c.copy(A).lerp(B, 0.5 + 0.5 * Math.sin(i * 1.7)); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  ni.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return ni;
}
/** Paint vertex colours: trunk brown below yT, foliage gradient gA->gB above. */
function paintTree(g, trunkCount, gA, gB, tipT = 1.3) {
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const brown = new THREE.Color(0x4e3322);
  const A = new THREE.Color(gA), B = new THREE.Color(gB);
  const t = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const y = g.attributes.position.getY(i);
    if (i < trunkCount) t.copy(brown); else t.copy(A).lerp(B, Math.min(1, Math.max(0, (y - 0.4) / tipT)));
    col[i * 3] = t.r; col[i * 3 + 1] = t.g; col[i * 3 + 2] = t.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function pineGeometry() {
  const trunk = new THREE.CylinderGeometry(0.08, 0.14, 0.5, 5); trunk.translate(0, 0.25, 0);
  const c1 = new THREE.ConeGeometry(0.58, 0.8, 7); c1.translate(0, 0.78, 0);
  const c2 = new THREE.ConeGeometry(0.42, 0.7, 7); c2.translate(0, 1.22, 0);
  const c3 = new THREE.ConeGeometry(0.26, 0.6, 7); c3.translate(0, 1.62, 0);
  const g = mergeGeometries([trunk, c1, c2, c3], false);
  return paintTree(g, trunk.attributes.position.count, 0x1f6a3a, 0x6cc24e);
}
function broadleafGeometry() {
  const trunk = new THREE.CylinderGeometry(0.07, 0.13, 0.7, 5).toNonIndexed(); trunk.translate(0, 0.35, 0);
  const blobs = [[0, 1.05, 0, 0.55], [0.3, 0.9, 0.1, 0.36], [-0.3, 0.95, -0.1, 0.38], [0.05, 1.3, -0.25, 0.3], [-0.05, 1.25, 0.28, 0.3]];
  const parts = [trunk];
  for (const [x, y, z, r] of blobs) { const b = new THREE.IcosahedronGeometry(r, 0); b.translate(x, y, z); parts.push(b); }   // det 0: 20 tri blobs read chunky-Stylised at range
  const g = mergeGeometries(parts, false);
  return paintTree(g, trunk.attributes.position.count, 0x3d7d2a, 0xa8d24a, 1.0);
}
function cypressGeometry() {
  const trunk = new THREE.CylinderGeometry(0.05, 0.09, 0.35, 5); trunk.translate(0, 0.17, 0);
  const body = new THREE.CylinderGeometry(0.02, 0.28, 1.5, 7); body.translate(0, 1.05, 0);
  const g = mergeGeometries([trunk, body], false);
  return paintTree(g, trunk.attributes.position.count, 0x1d5c3d, 0x4f9a55, 1.4);
}
function archGeometry() {
  const arc = new THREE.TorusGeometry(1, 0.05, 8, 40, Math.PI);
  // pylons: the ring stands on two flared piers rising out of the water
  const pillarL = new THREE.CylinderGeometry(0.07, 0.12, 0.6, 10); pillarL.translate(-1, -0.28, 0);
  const pillarR = pillarL.clone(); pillarR.translate(2, 0, 0);
  const footL = new THREE.CylinderGeometry(0.16, 0.2, 0.06, 12); footL.translate(-1, 0.0, 0);
  const footR = footL.clone(); footR.translate(2, 0, 0);
  return mergeGeometries([arc, pillarL, pillarR, footL, footR], false);
}

// ---------------------------------------------------------------- props manager
export class Props {
  constructor(rng) {
    this.rng = rng;
    const shared = skyUniforms();
    this.buildingMat = createBuildingMaterial(shared);
    this.spireMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.0, flatShading: true });
    this.rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.0, flatShading: true });
    this.treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true });
    this.archMat = new THREE.MeshStandardMaterial({ color: 0xe8eef6, roughness: 0.3, metalness: 0.7, emissive: 0x2a6ed8, emissiveIntensity: 0.0 });
    // gate rings: segmented hull plating with glowing blue light-strips every few degrees
    this.archMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vArcP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvArcP = position;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vArcP;')
        .replace('#include <emissivemap_fragment>', /* glsl */ `
          #include <emissivemap_fragment>
          {
            float ang = atan(vArcP.y, vArcP.x);
            float seg = fract(ang * 9.0 / 3.14159);
            float strip = smoothstep(0.45, 0.48, seg) * (1.0 - smoothstep(0.52, 0.55, seg));
            float onArc = step(0.02, vArcP.y);
            float ring = 1.0 - smoothstep(0.02, 0.04, abs(fract(vArcP.y * 4.0) - 0.5) - 0.02);
            diffuseColor.rgb *= 1.0 - 0.35 * smoothstep(0.96, 0.99, seg) * onArc;
            totalEmissiveRadiance += vec3(0.25, 0.6, 1.0) * strip * onArc * 1.3;
            totalEmissiveRadiance += vec3(1.0, 0.45, 0.15) * (1.0 - onArc) * ring * 1.2;
          }`);
    };
    this.beaconMat = new THREE.MeshStandardMaterial({ color: 0xff6a3a, emissive: 0xff3a1a, emissiveIntensity: 5.0, roughness: 0.4 });
    for (const m of [this.spireMat, this.rockMat, this.treeMat, this.archMat]) patchAtmosphere(m, shared);
    this.archMat.customProgramCacheKey = () => 'arch-atmos';

    this.buildings = buildingGeometries().map((g, k) => new Pool(g, this.buildingMat, k === 5 ? 120 : 90, { extras: true }));
    this.blocks = new Pool(blockGeometry(), this.buildingMat, 420, { extras: true });
    this.spires = new Pool(spireGeometry(rng), this.spireMat, 160);
    this.rocks = new Pool(boulderGeometry(), this.rockMat, 500);
    this.pines = new Pool(pineGeometry(), this.treeMat, 700);
    this.broad = new Pool(broadleafGeometry(), this.treeMat, 500);
    this.cypress = new Pool(cypressGeometry(), this.treeMat, 300);
    // trees neither cast nor receive shadows: thousands of instanced tris per shadow pass
    // are invisible from the rail altitude anyway (sun is low, canopies are rounded)
    for (const p of [this.pines, this.broad, this.cypress]) { p.mesh.receiveShadow = false; p.mesh.castShadow = false; }
    this.arches = new Pool(archGeometry(), this.archMat, 24);
    this.beacons = new Pool(new THREE.SphereGeometry(1, 8, 6), this.beaconMat, 220, { shadow: false });
    this.pools = [...this.buildings, this.blocks, this.spires, this.rocks, this.pines, this.broad, this.cypress, this.arches, this.beacons];
    this.group = new THREE.Group();
    for (const p of this.pools) this.group.add(p.mesh);
    this.chunkClaims = new Map(); // chunkIndex -> [{pool, id}]
    this.tint = new THREE.Color();
    this.accent = new THREE.Color();
  }

  release(chunkIndex) {
    const arr = this.chunkClaims.get(chunkIndex);
    if (!arr) return;
    for (const { pool, id } of arr) pool.release(id);
    this.chunkClaims.delete(chunkIndex);
    this._claimsDirty = true;
  }

  /**
   * Begin populating props for chunk i (travel range [i*L,(i+1)*L]).
   * world z = -d. Returns a state for populateNext(), which does one small
   * slice per call — populate() used to run several hundred heightAt noise
   * evals on a single frame (a periodic mid-play hitch).
   */
  beginPopulate(i, schedule) {
    const d0 = i * CHUNK;
    return { i, schedule, claims: [], d0, p: schedule.paramsAt(d0 + CHUNK / 2), ph: 0, c: 0, k: 0, gz: 20 };
  }

  /** One slice of populate(); rng consumption order matches the old monolithic call. Returns true when done. */
  populateNext(st) {
    const rng = this.rng, claims = st.claims, schedule = st.schedule, d0 = st.d0, p = st.p, i = st.i;
    const claim = (pool, ...a) => { const id = pool.claim(...a); if (id >= 0) claims.push({ pool, id }); return id; };
    const H = (x, d) => heightAt(x, d, schedule.paramsAt(d));

    // trees: clustered copses (cluster centres + scatter) mixing three species by altitude
    if (st.ph === 0) {
      const nClusters = Math.floor(9 * p.trees);
      const c = st.c++;
      if (c < nClusters) {
        const cx = rng.range(-1100, 1100), cd = d0 + rng.range(0, CHUNK), cr = rng.range(25, 90);
        const species = rng.next();
        const n = Math.floor(rng.range(5, 14));
        for (let k = 0; k < n; k++) {
          const ang = rng.range(0, 6.28), rad = Math.sqrt(rng.next()) * cr;
          const x = cx + Math.cos(ang) * rad, d = cd + Math.sin(ang) * rad;
          if (Math.abs(x - riverX(d)) < 90) continue;
          const h = H(x, d);
          if (h < 4 || h > 95) continue;
          const slope = Math.abs(H(x + 3, d) - h) + Math.abs(H(x, d + 3) - h);
          if (slope > 2.6) continue;
          const s = rng.range(7, 12);
          let pool;
          if (h > 55 || species < 0.45) { pool = this.pines; this.tint.setHSL(0.33 + rng.range(-0.05, 0.03), 0.55, rng.range(0.42, 0.55)); }
          else if (species < 0.8) { pool = this.broad; this.tint.setHSL(0.24 + rng.range(-0.04, 0.06), 0.6, rng.range(0.45, 0.6)); }
          else { pool = this.cypress; this.tint.setHSL(0.38 + rng.range(-0.03, 0.03), 0.45, rng.range(0.4, 0.5)); }
          claim(pool, x, h - 0.5, -d, rng.range(0, 6.28), s, s * rng.range(0.9, 1.35), s, this.tint);
        }
        return false;
      }
      st.ph = 1;
    }
    // boulders on slopes and shorelines (8 per slice)
    if (st.ph === 1) {
      const nRocks = Math.floor(22 * (0.4 + p.spires) * (1 - p.urban));
      const end = Math.min(st.k + 8, nRocks);
      for (; st.k < end; st.k++) {
        const x = rng.range(-1000, 1000), d = d0 + rng.range(0, CHUNK);
        const h = H(x, d);
        if (h < -2 || h > 130) continue;
        const s = rng.range(4, 14);
        this.tint.setHSL(p.ridged > 0.5 ? 0.07 : 0.6, p.ridged > 0.5 ? 0.35 : 0.06, rng.range(0.5, 0.75));
        claim(this.rocks, x, h - s * 0.15, -d, rng.range(0, 6.28), s, s * rng.range(0.6, 1.0), s * rng.range(0.7, 1.3), this.tint);
      }
      if (st.k < nRocks) return false;
      st.ph = 2; st.k = 0;
    }
    // rock spires (3 per slice)
    if (st.ph === 2) {
      const nSp = Math.floor(9 * p.spires);
      const end = Math.min(st.k + 3, nSp);
      for (; st.k < end; st.k++) {
        const x = rng.range(-1000, 1000), d = d0 + rng.range(0, CHUNK);
        const r = rng.range(12, 34), hh = rng.range(50, 170) * (p.ridged > 0.5 ? 1.3 : 1);
        if (Math.abs(x - riverX(d)) < CORRIDOR * 0.8 + r) continue;   // never inside the flight corridor
        const h = H(x, d);
        if (h < 2) continue;
        this.tint.setHSL(0.07 + rng.range(-0.02, 0.02), 0.2, rng.range(0.8, 0.96));
        claim(this.spires, x, h - 6, -d, rng.range(0, 6.28), r, hh, r * rng.range(0.7, 1.2), this.tint, rng.range(-0.06, 0.06), rng.range(-0.06, 0.06));
      }
      if (st.k < nSp) return false;
      st.ph = 3;
    }
    // city: massed blocks on a street grid — one latitude row per slice
    if (st.ph === 3) {
      if (p.towers > 0.05 && st.gz < CHUNK) {
        const gz = st.gz;
        for (let gx = -900; gx <= 900; gx += 60) {
        if (rng.next() > p.towers * 0.92) continue;
        const d = d0 + gz + rng.range(-6, 6), x = gx + rng.range(-6, 6);
        // the rail follows the river: keep every lot (plus its widest footprint) outside the corridor
        const dr = Math.min(Math.abs(x - riverX(d)), Math.abs(x - riverX(d + 40)), Math.abs(x - riverX(d - 40)));
        if (dr < CORRIDOR) continue;
        const h = H(x, d);
        if (h < 6) continue;
        const frontRow = dr < CORRIDOR + 90;    // first row along the canal: denser, taller — a real canyon wall
        const core = 1 - Math.min(1, Math.abs(x) / 700);        // 1 downtown .. 0 edge
        const seed = rng.next() * 100;
        // palette: Corneria whites/greys, sandstone, teal glass, with accent stripes in blue / orange / red
        const pick = rng.next();
        if (pick < 0.5) this.tint.setHSL(0.58 + rng.range(-0.05, 0.05), 0.12, rng.range(0.72, 0.92));      // cool white / grey
        else if (pick < 0.68) this.tint.setHSL(0.09, 0.32, rng.range(0.55, 0.72));                        // warm sandstone
        else if (pick < 0.84) this.tint.setHSL(0.52, 0.4, rng.range(0.35, 0.55));                          // teal glass tower
        else this.tint.setHSL(0.62, 0.25, rng.range(0.28, 0.42));                                          // dark slate
        const ap = rng.next();
        if (ap < 0.45) this.accent.setHSL(0.6, 0.85, 0.55);        // Corneria blue
        else if (ap < 0.7) this.accent.setHSL(0.07, 0.95, 0.55);   // orange
        else if (ap < 0.85) this.accent.setHSL(0.0, 0.8, 0.5);     // red
        else this.accent.setHSL(0.48, 0.7, 0.6);                   // teal
        const tall = rng.next() < 0.3 + 0.35 * core + (frontRow ? 0.3 : 0);
        if (tall) {
          const type = Math.floor(rng.next() * this.buildings.length);
          const pool = this.buildings[type];
          const w = rng.range(20, 34) * (type === 5 ? 1.5 : 1);
          const ht = rng.range(50, 110) + core * rng.range(40, 150) + (frontRow ? 30 : 0);
          const id = claim(pool, x, h - 3, -d, Math.round(rng.range(0, 3)) * Math.PI / 2, w, ht, w * rng.range(0.8, 1.2), this.tint);
          if (id >= 0) pool.setExtras(id, seed, this.accent);
          if (ht > 130 && type !== 3) claim(this.beacons, x, h - 1 + ht * (type === 0 ? 1.4 : 1.1), -d, 0, 2.2, 2.2, 2.2, null);
        } else {
          // low-rise: 1-3 massed blocks on the lot
          const nb = 1 + Math.floor(rng.next() * 3);
          for (let b = 0; b < nb; b++) {
            const w = rng.range(14, 30), ht = rng.range(8, 30);
            const id = claim(this.blocks, x + rng.range(-14, 14), h - 3, -d + rng.range(-14, 14), Math.round(rng.range(0, 1)) * Math.PI / 2, w, ht, w * rng.range(0.6, 1.4), this.tint);
            if (id >= 0) this.blocks.setExtras(id, seed + b * 3.3, this.accent);
          }
        }
        }
        st.gz += 60;
        return false;
      }
      st.ph = 4;
    }
    // ring gates over the river (spaced out: they are a landmark, not a fence) + commit
    if (st.ph === 4) {
      if (i % 3 === 0 && rng.next() < p.arches * 0.8) {
        const d = d0 + CHUNK / 2;
        const xr = riverX(d);
        const dir = Math.atan2(riverX(d + 10) - riverX(d - 10), 20);
        // ring gates are wide enough that the whole rail envelope (x +-110, y 10..130) passes through the opening
        const R = rng.range(150, 185);
        this.tint.setHSL(0.58, 0.2, 0.92);
        claim(this.arches, xr, -4, -d, dir, R, R, R, this.tint);
      }
      this.chunkClaims.set(i, claims);
      this._claimsDirty = true;
      st.ph = 5;
      return true;
    }
    return true;
  }

  /** Synchronous populate (compat path): run all slices at once. */
  populate(i, schedule) { const st = this.beginPopulate(i, schedule); while (!this.populateNext(st)); }

  flush() {
    // recompute the high-water mark per pool from live claims so released tail slots drop out
    if (this._claimsDirty) {
      this._claimsDirty = false;
      const hi = new Map();
      for (const arr of this.chunkClaims.values()) for (const { pool, id } of arr) { const m = hi.get(pool) ?? 0; if (id + 1 > m) hi.set(pool, id + 1); }
      for (const p of this.pools) p.hi = hi.get(p) ?? 0;
    }
    for (const p of this.pools) { p.mesh.count = p.hi; if (p.dirty) { p.mesh.instanceMatrix.needsUpdate = true; if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true; if (p.seed) { p.seed.needsUpdate = true; p.accent.needsUpdate = true; } p.dirty = false; } }
  }
}
