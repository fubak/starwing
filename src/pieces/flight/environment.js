// Corridor environment for the flight piece: golden-hour sea, sea-stack rock
// pillars flanking the rail, distant island silhouettes in haze, gold boost
// rings, soft cloud billboards. Everything is procedural + cheap per pixel
// (custom lean shaders rather than PBR on screen-filling surfaces).
import * as THREE from 'three';

export const PALETTE = {
  zenith: new THREE.Color(0x1d5ccc),
  sky: new THREE.Color(0x63a7ea),
  horizon: new THREE.Color(0xffc6a0),
  sun: new THREE.Color(0xffe6c2),
  fog: new THREE.Color(0xe2bfa6),
  deep: new THREE.Color(0x0b3d5e),
  shallow: new THREE.Color(0x1fa2a8),
  gold: new THREE.Color(0xffb24a),
};
export const SUN_DIR = new THREE.Vector3(-0.42, 0.26, -0.87).normalize();

const NOISE_GLSL = /* glsl */ `
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
  float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
`;

/* ------------------------------------------------------------------ sky (fallback when lookdev is unavailable) */
export function buildSky() {
  const geo = new THREE.SphereGeometry(2600, 40, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      zenith: { value: PALETTE.zenith }, sky: { value: PALETTE.sky }, horizon: { value: PALETTE.horizon },
      sunDir: { value: SUN_DIR }, sunCol: { value: PALETTE.sun }, time: { value: 0 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 zenith, sky, horizon, sunDir, sunCol; uniform float time; varying vec3 vDir;
      ${NOISE_GLSL}
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        float t = pow(clamp(h, 0.0, 1.0), 0.5);
        vec3 col = mix(horizon, sky, smoothstep(0.0, 0.3, t));
        col = mix(col, zenith, smoothstep(0.3, 1.0, t));
        col = mix(col, horizon * 0.9, smoothstep(0.0, -0.1, h));
        float sd = max(dot(d, sunDir), 0.0);
        col += sunCol * (pow(sd, 1200.0) * 8.0 + pow(sd, 40.0) * 0.6 + pow(sd, 5.0) * 0.22);
        vec2 uv = d.xz / (abs(d.y) + 0.12);
        float cl = noise(uv * 2.5 + vec2(time * 0.01, 0.0));
        cl = smoothstep(0.45, 0.75, cl) * smoothstep(0.02, 0.2, h) * (1.0 - smoothstep(0.3, 0.7, h));
        col = mix(col, mix(horizon, vec3(1.0), 0.7), cl * 0.5);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.renderOrder = -10;
  return m;
}

/* ------------------------------------------------------------------ ocean */
export function buildOcean() {
  const geo = new THREE.PlaneGeometry(5000, 5000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    fog: true,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      deep: { value: PALETTE.deep.clone() }, shallow: { value: PALETTE.shallow.clone() },
      skyCol: { value: PALETTE.horizon.clone() }, sunCol: { value: PALETTE.sun.clone() },
      sunDir: { value: SUN_DIR.clone() }, camPos: { value: new THREE.Vector3() }, shipPos: { value: new THREE.Vector3() },
      time: { value: 0 },
    },
    vertexShader: `
      #include <fog_pars_vertex>
      varying vec3 vW;
      void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <fog_pars_fragment>
      uniform vec3 deep, shallow, skyCol, sunCol, sunDir, camPos, shipPos; uniform float time; varying vec3 vW;
      ${NOISE_GLSL}
      // three analytic directional waves -> cheap normal
      void wave(vec2 p, vec2 d, float f, float a, float s, inout float dx, inout float dz){
        float ph = dot(p, d) * f + time * s; float c = cos(ph) * a * f;
        dx += c * d.x; dz += c * d.y;
      }
      void main(){
        vec2 p = vW.xz;
        vec3 V = normalize(camPos - vW);
        float dist = length(camPos - vW);
        // detail fades with distance so the far water never aliases into moire
        float det = 1.0 - smoothstep(120.0, 700.0, dist);
        float det2 = 1.0 - smoothstep(60.0, 320.0, dist);
        float dx = 0.0, dz = 0.0;
        wave(p, normalize(vec2(0.8, 0.6)), 0.35, 0.22 * (0.35 + 0.65 * det), 2.6, dx, dz);
        wave(p, normalize(vec2(-0.5, 0.9)), 0.6, 0.12 * det, 3.4, dx, dz);
        wave(p, normalize(vec2(0.2, -1.0)), 1.3, 0.05 * det2, 5.0, dx, dz);
        float rip = noise(p * 0.35 + vec2(time * 0.7, -time * 0.4));
        dx += (rip - 0.5) * 0.25 * det2; dz += (noise(p * 0.35 + 17.0 - time * 0.5) - 0.5) * 0.25 * det2;
        // long swell visible from far away
        wave(p, normalize(vec2(0.3, 0.95)), 0.045, 0.9 * (1.0 - det * 0.5), 1.1, dx, dz);
        vec3 N = normalize(vec3(-dx, 1.0, -dz));
        // colour: deep channel with turquoise sandbanks
        float bank = noise(p * 0.012) * 0.65 + noise(p * 0.04) * 0.35;
        vec3 water = mix(deep, shallow, smoothstep(0.42, 0.78, bank));
        // fresnel toward the sky (cool blue overhead, warm only right at the horizon)
        float fr = pow(1.0 - max(dot(N, V), 0.0), 4.0);
        vec3 refl = mix(vec3(0.42, 0.62, 0.9), skyCol, smoothstep(0.55, 1.0, fr));
        vec3 col = mix(water, refl, 0.08 + 0.6 * fr);
        // sun glints: tight + broad lobes
        vec3 H = normalize(V + sunDir);
        float nh = max(dot(N, H), 0.0);
        float spec = mix(520.0, 60.0, 1.0 - det); // broader, calmer lobe in the distance
        col += sunCol * (pow(nh, spec) * mix(0.9, 2.6, det) + pow(nh, 48.0) * 0.22);
        // foam flecks on wave crests (near only)
        float crest = smoothstep(0.62, 0.8, noise(p * 0.5 + vec2(time * 0.9, time * 0.3)) * (0.5 + 0.5 * rip)) * det2;
        col += vec3(0.9, 0.95, 1.0) * crest * 0.18;
        // soft diffuse from sun
        col *= 0.82 + 0.28 * max(dot(N, sunDir), 0.0);
        // ship blob shadow
        float d = length(p - shipPos.xz);
        float sh = 1.0 - smoothstep(2.5, 8.0, d);
        col *= 1.0 - 0.45 * sh * clamp(1.0 - (shipPos.y) / 80.0, 0.2, 1.0);
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  return m;
}

/* ------------------------------------------------------------------ rock shader (lean, instanced) */
function rockMaterial(opts = {}) {
  const mat = new THREE.ShaderMaterial({
    fog: true,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      sunDir: { value: SUN_DIR.clone() }, sunCol: { value: PALETTE.sun.clone() },
      skyCol: { value: PALETTE.sky.clone() }, groundCol: { value: PALETTE.deep.clone() },
      colA: { value: new THREE.Color(opts.a ?? 0x8a5e4a) }, colB: { value: new THREE.Color(opts.b ?? 0xd9a27a) },
      colTop: { value: new THREE.Color(opts.top ?? 0x6f8f4e) },
      haze: { value: opts.haze ?? 0 },
    },
    vertexShader: `
      #include <common>
      #include <fog_pars_vertex>
      varying vec3 vN; varying vec3 vW; varying float vH; varying float vSeed;
      void main(){
        #include <beginnormal_vertex>
        #include <defaultnormal_vertex>
        #include <begin_vertex>
        #include <project_vertex>
        vN = normalize(transformedNormal);
        vec4 wp = modelMatrix * vec4(transformed, 1.0);
        vSeed = 0.5;
        #ifdef USE_INSTANCING
          wp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
          vSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
        #endif
        vW = wp.xyz; vH = position.y;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <fog_pars_fragment>
      uniform vec3 sunDir, sunCol, skyCol, groundCol, colA, colB, colTop; uniform float haze;
      varying vec3 vN; varying vec3 vW; varying float vH; varying float vSeed;
      ${NOISE_GLSL}
      void main(){
        vec3 N = normalize(vN);
        float dist = length(cameraPosition - vW);
        float det = 1.0 - smoothstep(80.0, 500.0, dist);
        // strata bands along world height + coarse grime
        float band = sin(vW.y * 0.42 + noise(vW.xz * 0.05) * 3.0 + noise(vec2(vW.y * 0.3, vW.x * 0.02)) * 2.0) * 0.5 + 0.5;
        float grime = noise(vW.xz * 0.18 + vW.y * 0.1) * 0.6 + noise(vW.xz * 0.6 + vW.y * 0.4) * 0.4;
        vec3 alb = mix(colA, colB, 0.3 + smoothstep(0.3, 0.8, band) * 0.28 + grime * 0.3);
        // per-instance hue drift: warm ochre <-> cool mauve so the stacks are not clones
        alb *= mix(vec3(1.06, 0.98, 0.9), vec3(0.9, 0.95, 1.08), vSeed);
        // fine surface grain + pitting (near only)
        float grain = noise(vW.xz * 2.2 + vW.y * 1.7) * 0.5 + noise(vec2(vW.y * 3.1, (vW.x + vW.z) * 2.4)) * 0.5;
        alb *= 1.0 + (grain - 0.5) * 0.28 * det;
        float pit = smoothstep(0.7, 0.85, noise(vW.xz * 1.1 + vW.y * 0.9)) * det;
        alb *= 1.0 - pit * 0.35;
        // dark vertical streaks (water runoff / cracks)
        float crack = smoothstep(0.62, 0.72, noise(vec2(atan(vW.z - vW.x * 0.3, vW.x) * 6.0, vW.y * 0.08)));
        alb *= 1.0 - crack * 0.3;
        // ledges: a thin lit line on the upper edge of each strata step
        float ledge = smoothstep(0.92, 1.0, fract(vW.y * 0.42 * 0.159 + noise(vW.xz * 0.05) * 0.5)) * smoothstep(0.1, 0.5, N.y);
        alb = mix(alb, colB * 1.1, ledge * 0.5 * det);
        // mossy cap on upward faces near the top
        float cap = smoothstep(0.45, 0.9, N.y) * smoothstep(0.55, 0.95, vH);
        alb = mix(alb, colTop, cap);
        // waterline: dark wet band with a pale salt/foam tide line just above it
        alb *= 0.55 + 0.45 * smoothstep(0.0, 7.0, vW.y);
        alb = mix(alb, vec3(0.92, 0.9, 0.86), smoothstep(1.2, 2.2, vW.y) * (1.0 - smoothstep(2.6, 4.0, vW.y)) * 0.35);
        float ndl = max(dot(N, sunDir), 0.0);
        // wrapped diffuse + sky/ground ambient so shadow sides stay readable and warm
        float wrap = max(dot(N, sunDir) * 0.6 + 0.4, 0.0);
        vec3 amb = mix(vec3(0.55, 0.42, 0.36), skyCol * 1.1, N.y * 0.5 + 0.5) * 0.9;
        // fake AO: darker in the lower third and on overhangs
        float ao = mix(0.7, 1.0, smoothstep(0.0, 0.45, vH)) * mix(0.75, 1.0, N.y * 0.5 + 0.5);
        vec3 col = alb * (amb * ao + sunCol * (ndl * 1.1 + wrap * 0.45));
        // warm rim from the low sun
        float rim = pow(1.0 - max(dot(N, normalize(cameraPosition - vW)), 0.0), 3.0) * max(dot(N, sunDir) + 0.3, 0.0);
        col += sunCol * rim * 0.25;
        // aerial perspective: far rocks sink into the warm haze, lit faces stay a touch warmer
        float hz = haze + (1.0 - haze) * smoothstep(300.0, 1600.0, dist) * 0.55;
        col = mix(col, mix(skyCol, sunCol * 0.9, ndl * 0.35), hz);
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });
  return mat;
}

/** Jagged sea-stack geometry: displaced cylinder, flat shaded. Unit height (0..1), unit radius. */
function rockGeometry(rng, radialSeg = 14, heightSeg = 7, topR = 0.55) {
  const geo = new THREE.CylinderGeometry(topR, 1.0, 1, radialSeg, heightSeg, false);
  geo.translate(0, 0.5, 0);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const seed = rng.range(0, 100);
  const lean = rng.range(-0.12, 0.12), lean2 = rng.range(-0.12, 0.12);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const a = Math.atan2(v.z, v.x), h = v.y;
    const r0 = Math.hypot(v.x, v.z);
    if (r0 > 1e-4) {
      // multi-octave radial noise + strata steps so silhouettes read as layered stone
      const step = 0.06 * (Math.sin(h * 21 + seed) > 0.55 ? 1 : 0) * (1 - h);
      const n = 0.82 + 0.16 * Math.sin(a * 3 + seed) * Math.cos(h * 7 + seed * 0.3) + 0.1 * Math.sin(a * 7 + h * 5 + seed) + 0.05 * Math.sin(h * 17 + a * 2)
        + 0.04 * Math.sin(a * 11 + h * 13 + seed * 1.7) + step;
      const r = r0 * n * (1 + 0.1 * Math.sin(h * 5.0 + seed));
      v.x = Math.cos(a) * r + lean * h * h; v.z = Math.sin(a) * r + lean2 * h * h;
    }
    v.y = h + 0.03 * Math.sin(a * 5 + seed) * (h > 0.05 ? 1 : 0);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  const flat = geo.toNonIndexed();
  flat.computeVertexNormals();
  geo.dispose();
  return flat;
}

function foamTexture() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, S * 0.18, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,0.0)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.85)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  // break the ring up with radial noise
  let sd = 11; const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 40; i++) { const a = rnd() * 6.283, r = S * (0.2 + rnd() * 0.3); g.beginPath(); g.arc(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, 4 + rnd() * 9, 0, 6.283); g.fillStyle = `rgba(0,0,0,${0.3 + rnd() * 0.5})`; g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Sea stacks flanking the corridor, recycled as the ship passes. Three rock variants + foam collars. */
export class Pillars {
  constructor(rng, count = 66) {
    this.rng = rng;
    this.count = count;
    this.mesh = new THREE.Group();
    this.mat = rockMaterial({ a: 0x9a6a52, b: 0xdcb08c, top: 0x6f9a4c });
    this.geos = [rockGeometry(rng, 16, 10, 0.5), rockGeometry(rng, 14, 12, 0.35), rockGeometry(rng, 18, 9, 0.62), rockGeometry(rng, 14, 11, 0.28)];
    const per = Math.ceil(count / this.geos.length);
    this.insts = this.geos.map((g) => { const m = new THREE.InstancedMesh(g, this.mat, per); m.frustumCulled = false; this.mesh.add(m); return m; });
    this.foamTex = foamTexture();
    this.foamMat = new THREE.MeshBasicMaterial({ map: this.foamTex, transparent: true, opacity: 0.8, depthWrite: false, fog: true, color: 0xfff4e8 });
    const foamGeo = new THREE.PlaneGeometry(1, 1); foamGeo.rotateX(-Math.PI / 2);
    this.foam = new THREE.InstancedMesh(foamGeo, this.foamMat, count); this.foam.frustumCulled = false; this.foam.renderOrder = 2; this.mesh.add(this.foam);
    this.items = [];
    this.M = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.s = new THREE.Vector3(); this.p = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < count; i++) {
      const it = { x: 0, z: -i * 25 - 60, h: 0, w: 0, rot: 0, tilt: 0, v: i % this.geos.length, k: Math.floor(i / this.geos.length) };
      this.roll(it, it.z);
      this.items.push(it);
    }
  }
  roll(it, z) {
    const r = this.rng;
    const side = r.sign();
    // mostly beside the corridor, occasionally a big one right at the edge (soft wall)
    const near = r.range(0, 1) < 0.3;
    it.x = side * (near ? r.range(30, 48) : r.range(48, 150));
    it.z = z;
    it.h = near ? r.range(20, 45) : r.range(18, 95);
    it.w = it.h * r.range(0.16, 0.4);
    it.sq = r.range(0.75, 1.3);
    it.rot = r.range(0, Math.PI * 2);
    it.tilt = r.range(-0.08, 0.08);
  }
  update(shipZ, t = 0) {
    let minZ = Infinity;
    for (const it of this.items) minZ = Math.min(minZ, it.z);
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (it.z > shipZ + 80) { this.roll(it, minZ - 25); minZ = it.z; }
      this.q.setFromAxisAngle(this.up, it.rot);
      this.s.set(it.w * it.sq, it.h, it.w / it.sq);
      this.p.set(it.x, -1.5, it.z);
      this.M.compose(this.p, this.q, this.s);
      this.insts[it.v].setMatrixAt(it.k, this.M);
      // foam collar breathing with the swell
      const fw = it.w * (2.6 + 0.25 * Math.sin(t * 1.3 + it.rot * 3.0));
      this.q.setFromAxisAngle(this.up, it.rot + t * 0.02);
      this.s.set(fw * it.sq, 1, fw / it.sq);
      this.p.set(it.x, 0.35, it.z);
      this.M.compose(this.p, this.q, this.s);
      this.foam.setMatrixAt(i, this.M);
    }
    for (const m of this.insts) m.instanceMatrix.needsUpdate = true;
    this.foam.instanceMatrix.needsUpdate = true;
  }
  dispose() { for (const g of this.geos) g.dispose(); this.mat.dispose(); this.foamTex.dispose(); this.foamMat.dispose(); }
}

/** Far island silhouettes in haze: ring of big rocks that parallax slowly. */
export function buildIslands(rng) {
  // peaked ridges rather than slabs; the material's aerial perspective does the rest
  const geo = rockGeometry(rng, 14, 8, 0.12);
  const mat = rockMaterial({ a: 0x6e5a74, b: 0xa48a9a, top: 0x5f7f5c, haze: 0.22 });
  const N = 44;
  const inst = new THREE.InstancedMesh(geo, mat, N);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + rng.range(-0.05, 0.05);
    // keep the corridor ahead (around -z) mostly open at the horizon: smaller islands there
    const ahead = Math.max(0, -Math.sin(a));
    const r = rng.range(900, 1500);
    const h = rng.range(110, 330) * (1 - ahead * 0.55);
    const w = rng.range(140, 320);
    pos.set(Math.cos(a) * r, -4, Math.sin(a) * r);
    q.setFromAxisAngle(up, rng.range(0, Math.PI));
    s.set(w, h, w * rng.range(0.7, 1.5));
    M.compose(pos, q, s);
    inst.setMatrixAt(i, M);
  }
  inst.frustumCulled = false;
  return inst;
}

/* ------------------------------------------------------------------ clouds */
function cloudTexture() {
  const S = 256;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  const puff = (x, y, r, a) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.55, `rgba(255,255,255,${a * 0.55})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  let sd = 3;
  const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  for (let i = 0; i < 26; i++) puff(60 + rnd() * 136, 100 + rnd() * 70 - Math.abs(60 + rnd() * 136 - 128) * 0.25, 28 + rnd() * 46, 0.55);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Clouds {
  constructor(rng, count = 18) {
    this.group = new THREE.Group();
    this.tex = cloudTexture();
    this.mat = new THREE.SpriteMaterial({ map: this.tex, color: 0xfff1e6, transparent: true, opacity: 0.85, depthWrite: false, fog: true });
    this.items = [];
    for (let i = 0; i < count; i++) {
      const sp = new THREE.Sprite(this.mat);
      const it = { sp, x: 0, y: 0, z: -i * 120 - 100, w: 0 };
      this.roll(it, it.z, rng);
      this.group.add(sp);
      this.items.push(it);
    }
    this.rng = rng;
  }
  roll(it, z, rng) {
    it.x = rng.sign() * rng.range(60, 520);
    it.y = rng.range(60, 190);
    it.z = z;
    it.w = rng.range(140, 380);
    it.sp.position.set(it.x, it.y, it.z);
    it.sp.scale.set(it.w, it.w * 0.5, 1);
  }
  update(shipZ) {
    let minZ = Infinity;
    for (const it of this.items) minZ = Math.min(minZ, it.z);
    for (const it of this.items) if (it.z > shipZ + 150) { this.roll(it, minZ - 120, this.rng); minZ = it.z; }
  }
  dispose() { this.tex.dispose(); this.mat.dispose(); }
}

/* ------------------------------------------------------------------ boost rings */
export class Gates {
  constructor(rng, count = 9) {
    this.rng = rng;
    this.group = new THREE.Group();
    this.items = [];
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc35a, metalness: 0.9, roughness: 0.25, emissive: 0x7a3a00, emissiveIntensity: 0.35 });
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const R = 11;
    const proto = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.75, 12, 56), gold);
    proto.add(ring);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(R, 1.4, 8, 56), this.glowMat);
    inner.name = 'glow';
    proto.add(inner);
    // four fins
    const finGeo = new THREE.BoxGeometry(1.1, 3.2, 0.5);
    for (let k = 0; k < 4; k++) {
      const f = new THREE.Mesh(finGeo, gold);
      const a = k * Math.PI / 2 + Math.PI / 4;
      f.position.set(Math.cos(a) * (R + 1.6), Math.sin(a) * (R + 1.6), 0);
      f.rotation.z = a - Math.PI / 2;
      proto.add(f);
    }
    // studs
    const studGeo = new THREE.SphereGeometry(0.55, 10, 8);
    const studMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0, toneMapped: false });
    for (let k = 0; k < 8; k++) {
      const s = new THREE.Mesh(studGeo, studMat);
      const a = k * Math.PI / 4;
      s.position.set(Math.cos(a) * R, Math.sin(a) * R, 0.75);
      proto.add(s);
    }
    for (let i = 0; i < count; i++) {
      const g = proto.clone();
      g.getObjectByName('glow').material = this.glowMat.clone();
      const it = { g, x: 0, y: 0, z: -160 - i * 170, passed: false, flash: 0, spin: rng.range(0, 6.28) };
      this.place(it, it.z);
      this.group.add(g);
      this.items.push(it);
    }
    this.R = R;
  }
  place(it, z) {
    const r = this.rng;
    it.x = r.range(-14, 14); it.y = r.range(8, 22); it.z = z; it.passed = false; it.flash = 0;
    it.g.position.set(it.x, it.y, it.z);
  }
  /** returns true when the ship passes through a ring this frame */
  update(ship, dt, t) {
    let minZ = Infinity, hit = false;
    for (const it of this.items) minZ = Math.min(minZ, it.z);
    for (const it of this.items) {
      if (it.z > ship.z + 40) { this.place(it, minZ - 170); minZ = it.z; }
      if (!it.passed && ship.z < it.z && ship.z > it.z - 14) {
        it.passed = true;
        const dx = ship.x - it.x, dy = ship.y - it.y;
        if (dx * dx + dy * dy < (this.R - 1.5) * (this.R - 1.5)) { it.flash = 1; hit = true; }
      }
      it.flash = Math.max(0, it.flash - dt * 2.2);
      const glow = it.g.getObjectByName('glow');
      glow.material.opacity = 0.35 + 0.15 * Math.sin(t * 5 + it.spin) + it.flash * 0.9;
      glow.scale.setScalar(1 + it.flash * 0.35);
      it.g.rotation.z = it.spin + t * 0.35;
      it.g.scale.setScalar(1 + it.flash * 0.1);
    }
    return hit;
  }
}
