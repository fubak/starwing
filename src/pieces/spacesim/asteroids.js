// Instanced, varied asteroid belt that wraps around the player so it never runs out.
// Round 2: custom rock shader — hard directional key with specular + sun rim, four rock
// families (iron-red, grey basalt, ice with glowing veins, charcoal with ember veins),
// per-pixel cracks / bump / dust AO and depth haze so the belt reads like Meteo.
import * as THREE from 'three';
import { NOISE_GLSL } from './glsl.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

function hashNoise(x, y, z) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}
function smoothNoise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const f = (t) => t * t * (3 - 2 * t);
  const u = f(xf), v = f(yf), w = f(zf);
  const l = (a, b, t) => a + (b - a) * t;
  const n = (dx, dy, dz) => hashNoise(xi + dx, yi + dy, zi + dz);
  return l(l(l(n(0, 0, 0), n(1, 0, 0), u), l(n(0, 1, 0), n(1, 1, 0), u), v), l(l(n(0, 0, 1), n(1, 0, 1), u), l(n(0, 1, 1), n(1, 1, 1), u), v), w);
}
function fbm(x, y, z, oct = 4) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += a * (smoothNoise3(x * f, y * f, z * f) * 2 - 1); a *= 0.5; f *= 2.1; }
  return v;
}

/** Chunky, faceted-but-smooth rock: ellipsoid + fbm + craters + a few hard shelves (flat facets) for silhouette. */
function rockGeometry(seed, detail = 3) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  const sx = 0.75 + hashNoise(seed, 1, 2) * 0.6, sy = 0.7 + hashNoise(seed, 3, 4) * 0.6, sz = 0.8 + hashNoise(seed, 5, 6) * 0.5;
  // a few random cutting planes: flattened facets give hard, readable edges like real fractured rock
  // two shallow cutting planes: a single hard shelf per rock gives silhouette interest without the
  // whole thing reading as a chopped icosphere
  const cuts = [];
  for (let i = 0; i < 2; i++) {
    const n = new THREE.Vector3(hashNoise(seed, 10 + i, 1) - 0.5, hashNoise(seed, 20 + i, 2) - 0.5, hashNoise(seed, 30 + i, 3) - 0.5).normalize();
    cuts.push({ n, d: 0.80 + hashNoise(seed, 40 + i, 4) * 0.18 });
  }
  // a handful of explicit craters with raised rims (bowl + rim profile) so the surface reads as impacted rock
  const craters = [];
  const nCr = 5 + Math.floor(hashNoise(seed, 9, 9) * 5);
  for (let i = 0; i < nCr; i++) {
    const c = new THREE.Vector3(hashNoise(seed, 50 + i, 1) - 0.5, hashNoise(seed, 60 + i, 2) - 0.5, hashNoise(seed, 70 + i, 3) - 0.5).normalize();
    craters.push({ c, r: 0.18 + hashNoise(seed, 80 + i, 4) * 0.32, depth: 0.05 + hashNoise(seed, 90 + i, 5) * 0.09 });
  }
  const dir = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i); dir.copy(v);
    const n = fbm(v.x * 1.6 + seed * 7.1, v.y * 1.6 + seed * 3.3, v.z * 1.6, 4);
    const big = fbm(v.x * 0.7 + seed, v.y * 0.7, v.z * 0.7 + seed * 2, 2);
    const mid = fbm(v.x * 3.2 + seed * 2.7, v.y * 3.2, v.z * 3.2 + seed, 3);
    let r = 1 + 0.30 * big + 0.13 * n + 0.05 * mid;
    for (const cr of craters) {
      const d = dir.angleTo(cr.c) / cr.r;
      if (d < 1.25) {
        const bowl = d < 1 ? -(1 - d * d) : 0;               // parabolic floor
        const rim = Math.exp(-((d - 1) * (d - 1)) * 18) * 0.45; // raised lip
        r += (bowl + rim) * cr.depth;
      }
    }
    v.multiplyScalar(r);
    v.x *= sx; v.y *= sy; v.z *= sz;
    for (const c of cuts) { const h = v.dot(c.n); if (h > c.d) v.addScaledVector(c.n, -(h - c.d) * 0.7); }
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  smoothNormalsByPosition(g, 0.6);
  return g;
}

/** Average normals across coincident positions, but keep hard creases (angle threshold) so facets stay crisp. */
function smoothNormalsByPosition(g, creaseCos = 0.8) {
  const pos = g.attributes.position, nor = g.attributes.normal;
  const groups = new Map();
  const key = (i) => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
  for (let i = 0; i < pos.count; i++) { const k = key(i); let a = groups.get(k); if (!a) { a = []; groups.set(k, a); } a.push(i); }
  const out = new Float32Array(pos.count * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  for (const idx of groups.values()) {
    for (const i of idx) {
      a.fromBufferAttribute(nor, i); b.copy(a);
      for (const j of idx) { if (j === i) continue; const nx = nor.getX(j), ny = nor.getY(j), nz = nor.getZ(j); if (a.x * nx + a.y * ny + a.z * nz > creaseCos) { b.x += nx; b.y += ny; b.z += nz; } }
      b.normalize(); out[i * 3] = b.x; out[i * 3 + 1] = b.y; out[i * 3 + 2] = b.z;
    }
  }
  nor.copyArray(out); nor.needsUpdate = true;
}

const ROCK_VERT = /* glsl */ `
  attribute vec4 aRock; // type, seed, emissive, spin phase
  varying vec3 vObj, vW, vN; varying vec4 vRock; varying float vScale; varying mat3 vM;
  void main() {
    vObj = position; vRock = aRock;
    mat3 im3 = mat3(instanceMatrix);
    vScale = length(im3[0]);
    vM = mat3(modelMatrix) * im3 / vScale;
    vN = normalize(vM * normal);
    vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

const ROCK_FRAG = /* glsl */ `
  ${NOISE_GLSL}
  uniform vec3 uSunDir, uSunCol, uFillDir, uFillCol, uHemiSky, uHemiGround, uHaze;
  uniform float uTime, uHazeDensity;
  varying vec3 vObj, vW, vN; varying vec4 vRock; varying float vScale; varying mat3 vM;
  // cheap variants: keep the per-pixel cost low enough for software GL too
  float fbm2(vec3 p) { return 0.5 * snoise(p) + 0.25 * snoise(p * 2.07 + vec3(3.1, 1.3, 7.7)); }
  float ridged3(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) { v += a * (1.0 - abs(snoise(p))); p = p * 2.1 + vec3(5.2, 1.3, 2.8); a *= 0.5; }
    return v;
  }
  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vW);
    float type = vRock.x, seed = vRock.y;
    vec3 p = vObj + seed * 7.31;
    float det = mix(2.2, 5.5, smoothstep(3.0, 45.0, vScale));
    // per-pixel bump from a low-octave noise gradient
    float e = 0.035;
    float bd = det * 0.7;
    float h0 = fbm2(p * bd);
    vec3 grad = vec3(fbm2((p + vec3(e, 0.0, 0.0)) * bd) - h0, fbm2((p + vec3(0.0, e, 0.0)) * bd) - h0, fbm2((p + vec3(0.0, 0.0, e)) * bd) - h0) / e;
    grad = vM * grad;
    vec3 Nb = normalize(N - (grad - N * dot(grad, N)) * 0.3);
    // cracks: thin ridged lines
    float cr = ridged3(p * det * 1.1 + 2.0);
    float crack = smoothstep(0.84, 0.93, cr);
    // structure-driven albedo: regolith dust settles in hollows (soft, warm, matte); exposed rock on the
    // ridges is darker and glossier; a slow large-scale band gives each rock a direction/strata read.
    float hollow = smoothstep(0.25, -0.35, h0);
    float strata = 0.5 + 0.5 * sin(dot(vObj, normalize(vec3(0.3, 1.0, 0.2))) * 7.0 + seed + fbm2(p * 0.8) * 2.5);
    strata = smoothstep(0.35, 0.75, strata);
    float fleck = smoothstep(0.62, 0.74, snoise(p * det * 4.0));
    vec3 albedo; float rough, specK; vec3 emis = vec3(0.0);
    if (type < 0.5) {            // iron-red: hematite rock, ochre dust in the hollows, dark oxide strata
      vec3 rock = mix(vec3(0.34, 0.13, 0.07), vec3(0.58, 0.24, 0.11), strata);
      vec3 dustC = vec3(0.80, 0.50, 0.28);
      albedo = mix(rock, dustC, hollow * 0.7);
      albedo = mix(albedo, vec3(0.14, 0.07, 0.05), crack * 0.85);
      albedo = mix(albedo, vec3(0.70, 0.62, 0.55), fleck * 0.14);
      rough = mix(0.45, 0.8, hollow); specK = mix(0.6, 0.15, hollow);
    } else if (type < 1.5) {     // slate: blue-grey rock, warm tan dust, dark fissures (never a flat grey)
      vec3 rock = mix(vec3(0.20, 0.24, 0.33), vec3(0.38, 0.40, 0.46), strata);
      vec3 dustC = vec3(0.62, 0.55, 0.44);
      albedo = mix(rock, dustC, hollow * 0.75);
      albedo = mix(albedo, vec3(0.06, 0.06, 0.09), crack * 0.9);
      albedo = mix(albedo, vec3(0.80, 0.78, 0.74), fleck * 0.14);
      rough = mix(0.4, 0.8, hollow); specK = mix(0.7, 0.15, hollow);
    } else if (type < 2.5) {     // ice: glassy pale blue, cyan-lit veins, frost in the hollows
      albedo = mix(vec3(0.28, 0.48, 0.80), vec3(0.62, 0.80, 0.94), strata);
      albedo = mix(albedo, vec3(0.86, 0.93, 1.0), hollow * 0.5);
      albedo = mix(albedo, vec3(0.12, 0.30, 0.60), crack * 0.6);
      emis = vec3(0.30, 1.10, 1.60) * crack * vRock.z * (0.7 + 0.3 * sin(uTime * 2.0 + seed * 10.0));
      rough = 0.2; specK = 1.4;
    } else {                     // charcoal: near-black with ember veins
      albedo = mix(vec3(0.08, 0.07, 0.07), vec3(0.22, 0.18, 0.16), strata);
      albedo = mix(albedo, vec3(0.30, 0.26, 0.24), hollow * 0.4);
      emis = vec3(2.2, 0.55, 0.08) * crack * vRock.z * (0.75 + 0.25 * sin(uTime * 3.0 + seed * 7.0));
      rough = 0.45; specK = 0.6;
    }
    float ao = mix(0.62, 1.0, smoothstep(-0.4, 0.3, h0)) * (1.0 - crack * 0.35);
    // key light: hard terminator, slight wrap, stylised
    float ndl = dot(Nb, uSunDir);
    float diff = clamp((ndl + 0.10) / 1.10, 0.0, 1.0);
    diff = mix(diff, smoothstep(0.0, 0.5, diff), 0.55);
    // self-shadow in the hollows on the terminator side (cheap directional occlusion)
    diff *= 1.0 - hollow * 0.35 * (1.0 - smoothstep(0.2, 0.7, ndl));
    vec3 H = normalize(uSunDir + V);
    float shin = mix(120.0, 10.0, rough);
    float spec = pow(max(dot(Nb, H), 0.0), shin) * specK * smoothstep(-0.05, 0.15, ndl) * (shin + 8.0) / 40.0;
    float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
    vec3 amb = mix(uHemiGround, uHemiSky, N.y * 0.5 + 0.5) * 0.24;
    float fd = max(dot(Nb, uFillDir), 0.0);
    vec3 col = albedo * (uSunCol * diff * 1.45 + amb + uFillCol * fd * 0.18) * ao;
    col += uSunCol * spec * (0.6 + 0.4 * fleck) * (1.0 - hollow * 0.5);
    // rim: warm sun rim on the lit edge, cool sky rim everywhere
    col += fres * (uSunCol * 1.1 * smoothstep(-0.25, 0.35, ndl) + uHemiSky * 0.3) * (albedo * 0.6 + 0.2);
    col += emis;
    // depth haze toward the nebula so far rocks recede
    float dist = length(cameraPosition - vW);
    col = mix(col, uHaze, 1.0 - exp(-dist * uHazeDensity));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/**
 * @param rng deterministic rng
 * @param opts.count total asteroids, opts.extent half-size of wrap box around the player
 */
export function buildAsteroidBelt(rng, { count = 900, extent = 520, thickness = 170, look = null } = {}) {
  const uniforms = {
    uSunDir: { value: new THREE.Vector3(0.8, 0.46, -0.24).normalize() }, uSunCol: { value: new THREE.Color(1, 0.95, 0.85) },
    uFillDir: { value: new THREE.Vector3(-0.6, 0.2, 0.75).normalize() }, uFillCol: { value: new THREE.Color(0.6, 0.7, 1.0) },
    uHemiSky: { value: new THREE.Color(0.29, 0.42, 0.75) }, uHemiGround: { value: new THREE.Color(0.23, 0.16, 0.28) },
    uHaze: { value: new THREE.Color(0.035, 0.03, 0.085) }, uHazeDensity: { value: 0.0011 }, uTime: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: ROCK_VERT, fragmentShader: ROCK_FRAG });
  const variantSpec = [
    { detail: 3, size: () => (rng.next() < 0.06 ? rng.range(34, 60) : rng.range(12, 26)), share: 0.12 },
    { detail: 3, size: () => (rng.next() < 0.04 ? rng.range(60, 110) : rng.range(14, 30)), share: 0.10 },
    { detail: 3, size: () => rng.range(6, 16), share: 0.20 },
    { detail: 3, size: () => rng.range(5, 14), share: 0.20 },
    { detail: 2, size: () => rng.range(1.8, 5.5), share: 0.19 },
    { detail: 2, size: () => rng.range(1.5, 5.0), share: 0.19 },
  ];
  const meshes = [];
  const rocks = [];
  variantSpec.forEach((spec, v) => {
    const per = Math.max(1, Math.round(count * spec.share));
    const geo = rockGeometry(v * 13 + 1, spec.detail);
    const aRock = new Float32Array(per * 4);
    const im = new THREE.InstancedMesh(geo, mat, per);
    im.castShadow = false; im.receiveShadow = false;
    im.frustumCulled = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < per; i++) {
      const pos = new THREE.Vector3(rng.range(-extent, extent), rng.range(-thickness, thickness) * Math.pow(rng.next(), 0.6), rng.range(-extent, extent));
      const scale = spec.size();
      const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(0, 6.28), rng.range(0, 6.28), rng.range(0, 6.28)));
      const axis = new THREE.Vector3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize();
      const rotSpeed = rng.range(0.05, 0.5) * (scale > 20 ? 0.25 : 1) * (scale > 50 ? 0.4 : 1);
      // rock families: iron-red 40%, grey 33%, ice 19%, charcoal/ember 8%
      const r = rng.next();
      const type = r < 0.42 ? 0 : r < 0.80 ? 1 : r < 0.92 ? 2 : 3;
      const emis = type === 2 ? rng.range(0.5, 1.3) : type === 3 ? rng.range(0.6, 1.2) : 0;
      aRock.set([type, rng.range(0, 40), emis, rng.range(0, 6.28)], i * 4);
      rocks.push({ pos, quat, axis, rotSpeed, scale, type, mesh: im, index: i });
    }
    geo.setAttribute('aRock', new THREE.InstancedBufferAttribute(aRock, 4));
    meshes.push(im);
  });
  const group = new THREE.Group();
  for (const m of meshes) group.add(m);

  /** Pull light colours / directions from the lookdev preset so the rocks match the rest of the scene. */
  function syncLook(p) {
    if (!p) return;
    uniforms.uSunDir.value.copy(p.sun.dir).normalize();
    uniforms.uSunCol.value.copy(p.sun.color).multiplyScalar(p.sun.intensity / 2.6);
    uniforms.uFillDir.value.copy(p.fill.dir).normalize();
    uniforms.uFillCol.value.copy(p.fill.color).multiplyScalar(p.fill.intensity / 1.35);
    uniforms.uHemiSky.value.copy(p.hemi.sky).multiplyScalar(p.hemi.intensity * 1.6);
    uniforms.uHemiGround.value.copy(p.hemi.ground).multiplyScalar(p.hemi.intensity * 1.6);
  }
  syncLook(look?.preset);

  /** Remove rocks from a sphere (used to clear the spawn point / opening path). */
  function clearAround(p, radius) {
    for (const r of rocks) {
      const d = r.pos.distanceTo(p);
      if (d < radius + r.scale) {
        _p.copy(r.pos).sub(p).normalize(); if (_p.lengthSq() < 0.5) _p.set(0, 0, 1);
        r.pos.copy(p).addScaledVector(_p, extent * 0.9);
      }
    }
  }
  /** Returns the rock a point is inside of (approx sphere test), or null. */
  function hitTest(p) {
    for (const r of rocks) {
      if (r.scale < 3) continue;
      if (r.pos.distanceToSquared(p) < (r.scale * 0.85) ** 2) return r;
    }
    return null;
  }

  function update(dt, center, t = 0) {
    uniforms.uTime.value = t;
    for (const r of rocks) {
      for (const k of ['x', 'z']) {
        const d = r.pos[k] - center[k];
        if (d > extent) r.pos[k] -= extent * 2; else if (d < -extent) r.pos[k] += extent * 2;
      }
      const dy = r.pos.y - center.y;
      if (dy > thickness * 1.6) r.pos.y -= thickness * 3.2; else if (dy < -thickness * 1.6) r.pos.y += thickness * 3.2;
      const dd = r.pos.distanceTo(center), minD = r.scale + 6;
      if (dd < minD) { _p.copy(r.pos).sub(center); if (_p.lengthSq() < 1e-4) _p.set(1, 0, 0); _p.normalize(); r.pos.addScaledVector(_p, (minD - dd) * Math.min(1, dt * 6)); }
      _q.setFromAxisAngle(r.axis, r.rotSpeed * dt);
      r.quat.premultiply(_q);
      _s.setScalar(r.scale);
      _m.compose(r.pos, r.quat, _s);
      r.mesh.setMatrixAt(r.index, _m);
    }
    for (const m of meshes) m.instanceMatrix.needsUpdate = true;
  }
  function dispose() {
    for (const m of meshes) m.geometry.dispose();
    mat.dispose();
  }
  return { group, rocks, update, dispose, clearAround, hitTest, material: mat, syncLook };
}
