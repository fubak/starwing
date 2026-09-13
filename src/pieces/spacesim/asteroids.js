// Instanced asteroid belt that wraps around the player so it never runs out.
// Round 4 rewrite — the belt IS the frame, so the rocks have to read as rock:
//  * geometry: fractured polyhedra (deep cutting planes -> hard facets + crease-preserving normals),
//    ridged fbm for sharp spines, explicit bowl+rim craters; per-vertex cavity attribute for dust/AO
//  * surface: per-pixel Voronoi crater field with ANALYTIC normals (two scales) + fine regolith bump,
//    faded by on-screen size so small/far rocks never sparkle
//  * shading: one strong warm key with a hard terminator, matte Lambert + low grazing spec, cool
//    hemisphere fill on the shadow side, thin warm sun rim, deep-space haze; no plastic highlights
//  * composition: a handful of colossal hero rocks (160-320 u) in a wider wrap box, clustered mid rocks
//    with real negative space between clumps, and a fine spray of gravel
//  * palette: basalt (blue-grey w/ warm regolith) dominant, umber/rust secondary, rare ice + ember accents
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
function ridged(x, y, z, oct = 3) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += a * (1 - Math.abs(smoothNoise3(x * f + 3.1, y * f + 1.7, z * f + 9.2) * 2 - 1)); a *= 0.5; f *= 2.2; }
  return v;
}

/**
 * Fractured rock: ellipsoid, low-frequency fbm mass, ridged spines, explicit craters, then 4-7 deep
 * cutting planes so the silhouette has hard shelves and facets. Writes an `aCav` attribute
 * (-1 hollow .. +1 ridge) used by the shader for regolith / AO.
 * @param kind 'hero' | 'large' | 'mid' | 'small'
 */
function rockGeometry(seed, kind = 'mid') {
  const detail = kind === 'hero' ? 4 : kind === 'small' ? 2 : 3;
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.attributes.position;
  const v = new THREE.Vector3(), dir = new THREE.Vector3();
  const h = (a, b) => hashNoise(seed, a, b);
  // elongated shapes read as shards; heroes stay chunkier
  const elong = kind === 'hero' ? 0.35 : 0.7;
  const sx = 0.8 + h(1, 2) * elong, sy = 0.65 + h(3, 4) * elong, sz = 0.85 + h(5, 6) * elong * 0.8;
  const nCuts = kind === 'hero' ? 5 : 4 + Math.floor(h(7, 8) * 3);
  const cuts = [];
  for (let i = 0; i < nCuts; i++) {
    const n = new THREE.Vector3(h(10 + i, 1) - 0.5, h(20 + i, 2) - 0.5, h(30 + i, 3) - 0.5).normalize();
    cuts.push({ n, d: (kind === 'hero' ? 0.82 : 0.62) + h(40 + i, 4) * 0.22 });
  }
  const craters = [];
  const nCr = kind === 'hero' ? 14 : 4 + Math.floor(h(9, 9) * 5);
  for (let i = 0; i < nCr; i++) {
    const c = new THREE.Vector3(h(50 + i, 1) - 0.5, h(60 + i, 2) - 0.5, h(70 + i, 3) - 0.5).normalize();
    craters.push({ c, r: (kind === 'hero' ? 0.10 : 0.16) + h(80 + i, 4) * 0.28, depth: 0.05 + h(90 + i, 5) * 0.09 });
  }
  const rBase = new Float32Array(pos.count), rFin = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i); dir.copy(v);
    const big = fbm(v.x * 0.8 + seed, v.y * 0.8, v.z * 0.8 + seed * 2, 2);
    const n = fbm(v.x * 1.7 + seed * 7.1, v.y * 1.7 + seed * 3.3, v.z * 1.7, 3);
    const rg = ridged(v.x * 2.4 + seed, v.y * 2.4, v.z * 2.4, 3);
    let r = 1 + 0.26 * big + 0.09 * n;
    const r0 = r;
    r += 0.10 * (rg - 0.6);                         // sharp spines / ridges
    for (const cr of craters) {
      const d = dir.angleTo(cr.c) / cr.r;
      if (d < 1.3) {
        const bowl = d < 1 ? -(1 - d * d) : 0;
        const rim = Math.exp(-((d - 1) * (d - 1)) * 16) * 0.45;
        r += (bowl + rim) * cr.depth;
      }
    }
    rBase[i] = r0; rFin[i] = r;
    v.multiplyScalar(r);
    v.x *= sx; v.y *= sy; v.z *= sz;
    for (const c of cuts) { const hh = v.dot(c.n); if (hh > c.d) v.addScaledVector(c.n, -(hh - c.d) * 0.92); }
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  smoothNormalsByPosition(g, kind === 'hero' ? 0.75 : 0.66);
  // cavity: displacement relative to the smooth mass, plus facet-ness (normal vs radial)
  const cav = new Float32Array(pos.count);
  const nor = g.attributes.normal, nn = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize(); nn.fromBufferAttribute(nor, i);
    const dh = THREE.MathUtils.clamp((rFin[i] - rBase[i]) * 9, -1, 1);
    const facet = 1 - THREE.MathUtils.clamp(v.dot(nn), 0, 1); // 0 on the smooth mass, >0 on facets / shelves
    cav[i] = THREE.MathUtils.clamp(dh + facet * 0.8, -1, 1);
  }
  g.setAttribute('aCav', new THREE.BufferAttribute(cav, 1));
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
  attribute vec4 aRock; // type, seed, emissive, tint
  attribute float aCav;
  varying vec3 vObj, vW, vN; varying vec4 vRock; varying float vScale, vCav; varying mat3 vM;
  void main() {
    vObj = position; vRock = aRock; vCav = aCav;
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
  varying vec3 vObj, vW, vN; varying vec4 vRock; varying float vScale, vCav; varying mat3 vM;

  vec3 hash33(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }

  // Sparse Voronoi crater field: bowl + raised rim per cell, returns height and analytic gradient.
  // 8-cell (nearest corner) lookup keeps it cheap enough for software GL.
  float craters(vec3 p, float density, float rimK, out vec3 grad) {
    vec3 i = floor(p), f = fract(p);
    vec3 base = i + step(0.5, f) - 1.0;
    float h = 0.0; grad = vec3(0.0);
    for (int k = 0; k < 8; k++) {
      vec3 cell = base + vec3(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1));
      vec3 rnd = hash33(cell);
      if (rnd.x > density) continue;
      vec3 c = cell + 0.5 + (rnd - 0.5) * 0.5;
      float R = 0.22 + rnd.y * 0.26;
      vec3 dv = p - c; float dl = length(dv); float d = dl / R;
      if (d > 1.35) continue;
      float depth = 0.12 + rnd.z * 0.1;
      float bowl = d < 1.0 ? -(1.0 - d * d) : 0.0;
      float dbowl = d < 1.0 ? 2.0 * d : 0.0;
      float e = exp(-(d - 1.0) * (d - 1.0) * 18.0);
      float rim = e * rimK; float drim = -2.0 * (d - 1.0) * 18.0 * e * rimK;
      // soft outer skirt so the rim fades into the plain
      float skirt = 1.0 - smoothstep(1.0, 1.35, d);
      h += depth * (bowl + rim) * skirt;
      grad += depth * (dbowl + drim) * skirt * dv / max(dl * R, 1e-4);
    }
    return h;
  }
  float fbm2(vec3 p) { return 0.5 * snoise(p) + 0.25 * snoise(p * 2.07 + vec3(3.1, 1.3, 7.7)); }

  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vW);
    float dist = length(cameraPosition - vW);
    float type = vRock.x, seed = vRock.y, tint = vRock.w;
    vec3 p = vObj + seed * 7.31;
    // apparent size on screen (radius / distance) -> fade micro detail so far rocks stay clean
    float px = vScale / max(dist, 1.0);
    float wMid = smoothstep(0.012, 0.05, px);
    float wFine = smoothstep(0.05, 0.16, px);

    // ---- surface relief: two crater scales + fine regolith bump, all feeding one bent normal.
    // The fine/octave detail terms are multiplied by wMid / wFine (0 for distant
    // rocks), so we early-out their noise entirely — pixel-identical, ~40% less
    // fragment work on the far field.
    vec3 gA, gB = vec3(0.0), gF = vec3(0.0);
    float hA = craters(p * 1.6, 0.30, 0.55, gA); gA *= 1.6;
    float hB = 0.0;
    if (wMid > 0.004) { hB = craters(p * 5.0 + 11.0, 0.30, 0.45, gB); gB *= 5.0; }
    float e = 0.02, bf = 7.0;
    if (wFine > 0.004) {
      float h0 = fbm2(p * bf);
      gF = vec3(fbm2((p + vec3(e, 0.0, 0.0)) * bf) - h0, fbm2((p + vec3(0.0, e, 0.0)) * bf) - h0, fbm2((p + vec3(0.0, 0.0, e)) * bf) - h0) / e;
    }
    vec3 gObj = gA * 0.9 + gB * 0.55 * wMid + gF * 0.028 * wFine;
    vec3 grad = vM * gObj;
    vec3 Nb = normalize(N - (grad - N * dot(grad, N)) * 0.55);
    float relief = hA + hB * 0.6 * wMid;                    // <0 in bowls, >0 on rims

    // ---- material structure
    float hollow = smoothstep(0.15, -0.35, vCav) * 0.7 + smoothstep(0.0, -0.10, relief) * 0.5; // regolith settles here
    hollow = clamp(hollow, 0.0, 1.0);
    float ridge = smoothstep(0.2, 0.8, vCav);
    float strata = smoothstep(0.35, 0.75, 0.5 + 0.5 * sin(dot(vObj, normalize(vec3(0.3, 1.0, 0.2))) * 6.0 + seed + fbm2(p * 0.9) * 2.5));
    float grain = 0.5 + 0.5 * snoise(p * 14.0);             // fine albedo mottling
    float fleck = wFine > 0.004 ? smoothstep(0.66, 0.78, snoise(p * 26.0 + 3.0)) * wFine : 0.0;
    float crack = smoothstep(0.80, 0.92, 1.0 - abs(snoise(p * 4.5 + 1.0))) * (1.0 - hollow * 0.7);

    vec3 albedo; float rough, specK; vec3 emis = vec3(0.0);
    if (type < 0.5) {            // basalt: cool blue-grey rock, warm khaki regolith in the hollows
      vec3 rock = mix(vec3(0.19, 0.20, 0.25), vec3(0.31, 0.30, 0.32), strata);
      rock = mix(rock, vec3(0.34, 0.27, 0.22), tint * 0.6);
      vec3 dustC = vec3(0.50, 0.44, 0.36);
      albedo = mix(rock, dustC, hollow * 0.6);
      albedo = mix(albedo, vec3(0.42, 0.40, 0.40), ridge * 0.35);
      albedo *= 0.85 + 0.3 * grain;
      albedo = mix(albedo, vec3(0.05, 0.05, 0.07), crack * 0.8);
      albedo = mix(albedo, vec3(0.72, 0.70, 0.66), fleck * 0.35);
      rough = 0.85; specK = 0.22;
    } else if (type < 1.5) {     // umber / rust: dark oxidised rock, ochre regolith, near-black fissures
      vec3 rock = mix(vec3(0.25, 0.12, 0.07), vec3(0.42, 0.22, 0.12), strata);
      rock = mix(rock, vec3(0.36, 0.22, 0.15), tint * 0.5);
      vec3 dustC = vec3(0.62, 0.42, 0.26);
      albedo = mix(rock, dustC, hollow * 0.55);
      albedo = mix(albedo, vec3(0.50, 0.32, 0.20), ridge * 0.3);
      albedo *= 0.85 + 0.3 * grain;
      albedo = mix(albedo, vec3(0.08, 0.04, 0.03), crack * 0.85);
      albedo = mix(albedo, vec3(0.75, 0.62, 0.50), fleck * 0.3);
      rough = 0.8; specK = 0.25;
    } else if (type < 2.5) {     // ice: glassy pale blue, cyan-lit veins, frost in the hollows
      albedo = mix(vec3(0.30, 0.50, 0.80), vec3(0.62, 0.80, 0.94), strata);
      albedo = mix(albedo, vec3(0.86, 0.93, 1.0), hollow * 0.5);
      albedo = mix(albedo, vec3(0.12, 0.30, 0.60), crack * 0.6);
      emis = vec3(0.30, 1.10, 1.60) * crack * vRock.z * (0.7 + 0.3 * sin(uTime * 2.0 + seed * 10.0));
      rough = 0.25; specK = 1.3;
    } else {                     // charcoal: near-black with ember veins
      albedo = mix(vec3(0.07, 0.06, 0.06), vec3(0.20, 0.16, 0.14), strata) * (0.85 + 0.3 * grain);
      albedo = mix(albedo, vec3(0.28, 0.24, 0.22), hollow * 0.4);
      emis = vec3(2.2, 0.55, 0.08) * crack * vRock.z * (0.75 + 0.25 * sin(uTime * 3.0 + seed * 7.0));
      rough = 0.6; specK = 0.4;
    }
    // occlusion: crater floors, hollows and cracks go dark
    float ao = 1.0 - 0.45 * smoothstep(0.0, -0.12, relief) - 0.25 * smoothstep(0.0, -0.6, vCav) - 0.3 * crack;
    ao = clamp(ao, 0.25, 1.0);

    // ---- lighting: one hard key, cool shadow side, thin sun rim
    float ndl = dot(Nb, uSunDir);
    float ndlG = dot(N, uSunDir);
    float diff = smoothstep(-0.04, 0.32, ndl) * (0.55 + 0.45 * max(ndl, 0.0));
    // crater walls facing away from the sun fall into shadow even on the lit hemisphere
    diff *= mix(1.0, smoothstep(-0.15, 0.25, ndl), smoothstep(0.0, -0.05, relief) * 0.8);
    diff *= smoothstep(-0.25, 0.05, ndlG);                  // geometric terminator (no light leaking round the back)
    vec3 H = normalize(uSunDir + V);
    float shin = mix(90.0, 14.0, rough);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
    float spec = pow(max(dot(Nb, H), 0.0), shin) * specK * (0.35 + fres * 1.6) * smoothstep(0.0, 0.2, ndl) * (shin + 8.0) / 60.0;
    vec3 amb = mix(uHemiGround, uHemiSky, N.y * 0.5 + 0.5) * 0.20;
    float fd = max(dot(Nb, uFillDir), 0.0);
    vec3 col = albedo * (uSunCol * diff * 1.55 + amb + uFillCol * fd * 0.16) * ao;
    col += uSunCol * spec * (0.7 + 0.3 * fleck) * (1.0 - hollow * 0.5) * ao;
    // rim: warm on the lit limb, faint cool sky rim on the dark limb
    col += fres * (uSunCol * 0.9 * smoothstep(-0.1, 0.4, ndlG) + uHemiSky * 0.18) * (albedo * 0.8 + 0.12);
    col += emis;
    // depth haze toward the nebula so far rocks recede and heroes wrap unseen
    col = mix(col, uHaze, 1.0 - exp(-dist * uHazeDensity));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/**
 * @param rng deterministic rng
 * @param opts.count total non-hero asteroids, opts.extent half-size of wrap box around the player
 */
export function buildAsteroidBelt(rng, { count = 520, extent = 560, thickness = 150, look = null, heroes = 7 } = {}) {
  const uniforms = {
    uSunDir: { value: new THREE.Vector3(0.8, 0.46, -0.24).normalize() }, uSunCol: { value: new THREE.Color(1, 0.95, 0.85) },
    uFillDir: { value: new THREE.Vector3(-0.6, 0.2, 0.75).normalize() }, uFillCol: { value: new THREE.Color(0.6, 0.7, 1.0) },
    uHemiSky: { value: new THREE.Color(0.29, 0.42, 0.75) }, uHemiGround: { value: new THREE.Color(0.23, 0.16, 0.28) },
    uHaze: { value: new THREE.Color(0.030, 0.026, 0.070) }, uHazeDensity: { value: 0.00075 }, uTime: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: ROCK_VERT, fragmentShader: ROCK_FRAG });

  // ---- composition: clusters with negative space between them
  const nClusters = 12;
  const clusters = [];
  for (let i = 0; i < nClusters; i++) {
    clusters.push({ c: new THREE.Vector3(rng.range(-extent, extent), rng.range(-thickness * 0.6, thickness * 0.6), rng.range(-extent, extent)), r: rng.range(55, 150) });
  }
  const heroExtent = extent * 2.4, heroThick = thickness * 2.2;
  const placeIn = (out, big) => {
    if (big) { out.set(rng.range(-heroExtent, heroExtent), rng.range(-heroThick, heroThick) * Math.pow(rng.next(), 0.5), rng.range(-heroExtent, heroExtent)); return out; }
    if (rng.next() < 0.72) {
      const cl = clusters[Math.floor(rng.next() * nClusters)];
      // gaussian-ish blob: sum of two uniforms
      const g = () => (rng.next() + rng.next() - 1);
      out.set(cl.c.x + g() * cl.r, cl.c.y + g() * cl.r * 0.55, cl.c.z + g() * cl.r);
    } else {
      out.set(rng.range(-extent, extent), rng.range(-thickness, thickness) * Math.pow(rng.next(), 0.6), rng.range(-extent, extent));
    }
    return out;
  };

  // variant spec: kind, size sampler, share of `count` (heroes counted separately)
  const variantSpec = [
    { kind: 'hero', size: () => rng.range(160, 320), n: Math.ceil(heroes / 2) },
    { kind: 'hero', size: () => rng.range(150, 260), n: Math.floor(heroes / 2) },
    { kind: 'large', size: () => rng.range(40, 95), share: 0.05 },
    { kind: 'large', size: () => rng.range(34, 80), share: 0.05 },
    { kind: 'mid', size: () => rng.range(11, 28), share: 0.14 },
    { kind: 'mid', size: () => rng.range(9, 24), share: 0.14 },
    { kind: 'small', size: () => rng.range(2.5, 9), share: 0.31 },
    { kind: 'small', size: () => rng.range(2.0, 7), share: 0.31 },
  ];
  const meshes = [];
  const rocks = [];
  variantSpec.forEach((spec, v) => {
    const per = spec.n ?? Math.max(1, Math.round(count * spec.share));
    if (per <= 0) return;
    const geo = rockGeometry(v * 13 + 1, spec.kind);
    const aRock = new Float32Array(per * 4);
    const im = new THREE.InstancedMesh(geo, mat, per);
    im.castShadow = false; im.receiveShadow = false;
    im.frustumCulled = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const big = spec.kind === 'hero';
    for (let i = 0; i < per; i++) {
      const pos = placeIn(new THREE.Vector3(), big);
      const scale = spec.size();
      const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(0, 6.28), rng.range(0, 6.28), rng.range(0, 6.28)));
      const axis = new THREE.Vector3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize();
      const rotSpeed = rng.range(0.05, 0.5) * (scale > 20 ? 0.25 : 1) * (scale > 50 ? 0.4 : 1) * (big ? 0.15 : 1);
      // families: basalt 56%, umber 32%, ice 7%, ember 5%  (heroes: never ice)
      const r = rng.next();
      let type = r < 0.56 ? 0 : r < 0.88 ? 1 : r < 0.95 ? 2 : 3;
      if (big && type >= 2) type = type === 2 ? 0 : 1; // heroes are always plain rock (no ice / ember blobs)
      const emis = type === 2 ? rng.range(0.5, 1.3) : type === 3 ? rng.range(0.6, 1.2) : 0;
      aRock.set([type, rng.range(0, 40), emis, rng.next()], i * 4);
      rocks.push({ pos, quat, axis, rotSpeed, scale, type, mesh: im, index: i, big, ext: big ? heroExtent : extent, thick: big ? heroThick : thickness * 1.6 });
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
        r.pos.copy(p).addScaledVector(_p, r.ext * 0.9);
      }
    }
  }
  /** Returns the rock a point is inside of (approx sphere test), or null. */
  function hitTest(p) {
    for (const r of rocks) {
      if (r.scale < 3) continue;
      if (r.pos.distanceToSquared(p) < (r.scale * 0.8) ** 2) return r;
    }
    return null;
  }

  function update(dt, center, t = 0) {
    uniforms.uTime.value = t;
    for (const r of rocks) {
      const ex = r.ext;
      for (const k of ['x', 'z']) {
        const d = r.pos[k] - center[k];
        if (d > ex) r.pos[k] -= ex * 2; else if (d < -ex) r.pos[k] += ex * 2;
      }
      const dy = r.pos.y - center.y;
      if (dy > r.thick) r.pos.y -= r.thick * 2; else if (dy < -r.thick) r.pos.y += r.thick * 2;
      const dd = r.pos.distanceTo(center), minD = r.scale + 6;
      if (dd < minD) { _p.copy(r.pos).sub(center); if (_p.lengthSq() < 1e-4) _p.set(1, 0, 0); _p.normalize(); r.pos.addScaledVector(_p, (minD - dd) * Math.min(1, dt * (r.big ? 2.5 : 6))); }
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
