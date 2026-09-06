// Corridor environment: painted sky dome, tiled plateau ground with fog,
// distant mesa silhouettes, scrolling gates + monoliths.
import * as THREE from 'three';

export const PALETTE = {
  zenith: new THREE.Color(0x1a3d8f),
  sky: new THREE.Color(0x4f9be6),
  horizon: new THREE.Color(0xffc9a0),
  sun: new THREE.Color(0xfff1d0),
  fog: new THREE.Color(0xe6b79b),
  ground: new THREE.Color(0x2f7f78),
  groundDark: new THREE.Color(0x1c4f52),
  gate: new THREE.Color(0xffb14a),
};
export const SUN_DIR = new THREE.Vector3(-0.45, 0.32, -0.83).normalize();

export function buildSky() {
  const geo = new THREE.SphereGeometry(2400, 48, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      zenith: { value: PALETTE.zenith }, sky: { value: PALETTE.sky }, horizon: { value: PALETTE.horizon },
      sunDir: { value: SUN_DIR }, sunCol: { value: PALETTE.sun }, time: { value: 0 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 zenith, sky, horizon, sunDir, sunCol; uniform float time; varying vec3 vDir;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -1.0, 1.0);
        float t = pow(clamp(h, 0.0, 1.0), 0.45);
        vec3 col = mix(horizon, sky, smoothstep(0.0, 0.35, t));
        col = mix(col, zenith, smoothstep(0.35, 1.0, t));
        // below horizon: haze
        col = mix(col, horizon * 0.92, smoothstep(0.0, -0.08, h));
        // sun disc + halo
        float sd = max(dot(d, sunDir), 0.0);
        col += sunCol * (pow(sd, 900.0) * 6.0 + pow(sd, 32.0) * 0.55 + pow(sd, 6.0) * 0.18);
        // high cirrus streaks
        vec2 uv = d.xz / (abs(d.y) + 0.15);
        float cl = noise(uv * 3.0 + vec2(time * 0.01, 0.0)) * noise(uv * 9.0 - vec2(0.0, time * 0.02));
        cl = smoothstep(0.32, 0.7, cl) * smoothstep(0.02, 0.25, h) * (1.0 - smoothstep(0.35, 0.8, h));
        col = mix(col, mix(horizon, vec3(1.0), 0.6), cl * 0.55);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.renderOrder = -10;
  return m;
}

export function buildGround() {
  const geo = new THREE.PlaneGeometry(3200, 3200, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    fog: true,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      col: { value: PALETTE.ground }, colDark: { value: PALETTE.groundDark }, line: { value: new THREE.Color(0x7de7d8) },
      sunDir: { value: SUN_DIR }, camPos: { value: new THREE.Vector3() }, shipPos: { value: new THREE.Vector3() },
    },
    vertexShader: `
      #include <fog_pars_vertex>
      varying vec3 vW;
      void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <fog_pars_fragment>
      uniform vec3 col, colDark, line, sunDir, camPos, shipPos; varying vec3 vW;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec2 p = vW.xz;
        // large tile plates (12u) with bevel lines, plus fine 3u grid
        vec2 tile = p / 12.0;
        vec2 f = abs(fract(tile) - 0.5);
        float edge = 1.0 - smoothstep(0.44, 0.5, max(f.x, f.y));
        vec2 f2 = abs(fract(p / 3.0) - 0.5);
        float edge2 = 1.0 - smoothstep(0.40, 0.5, max(f2.x, f2.y));
        float n = noise(p * 0.035) * 0.6 + noise(p * 0.11) * 0.4;
        float plate = hash(floor(tile));
        vec3 base = mix(colDark, col, n * 0.8 + plate * 0.25);
        base *= 0.85 + 0.3 * edge2;
        // sun-facing sheen (fake spec on the plates)
        vec3 V = normalize(camPos - vW);
        vec3 Hh = normalize(V + sunDir);
        float spec = pow(max(Hh.y, 0.0), 60.0) * 0.35 * edge;
        base += vec3(1.0, 0.85, 0.7) * spec;
        // glowing seams
        float seam = (1.0 - edge) * 0.9;
        base += line * seam * 0.9;
        // ship blob shadow
        float d = length(p - shipPos.xz);
        float sh = 1.0 - smoothstep(2.0, 7.0, d) * 1.0;
        base *= 1.0 - 0.55 * sh * clamp(1.0 - (shipPos.y - vW.y) / 60.0, 0.2, 1.0);
        gl_FragColor = vec4(base, 1.0);
        #include <fog_fragment>
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.receiveShadow = true;
  return m;
}

/** Distant mesa silhouettes: ring of noisy cylinders for parallax horizon. */
export function buildMesas(rng) {
  const geo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, false);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x6a4f6e, roughness: 0.9, metalness: 0.0, flatShading: true });
  const N = 90;
  const inst = new THREE.InstancedMesh(geo, mat, N);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + rng.range(-0.03, 0.03);
    const r = rng.range(900, 1500);
    const h = rng.range(60, 260) * (0.6 + 0.8 * Math.abs(Math.sin(a * 3.3)));
    const w = rng.range(70, 220);
    pos.set(Math.cos(a) * r, -5, Math.sin(a) * r);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, Math.PI));
    s.set(w, h, w * rng.range(0.6, 1.4));
    M.compose(pos, q, s);
    inst.setMatrixAt(i, M);
  }
  inst.frustumCulled = false;
  return inst;
}

/** Monoliths / pillars scattered beside the corridor, recycled as ship passes. */
export class Monoliths {
  constructor(rng, count = 70) {
    this.rng = rng;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    this.mat = new THREE.MeshStandardMaterial({ color: 0x8e7b86, roughness: 0.55, metalness: 0.25 });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, count);
    this.mesh.castShadow = false;
    this.mesh.frustumCulled = false;
    this.items = [];
    this.M = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.s = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const it = { x: 0, z: -i * 22 - 40, h: 0, w: 0, rot: 0 };
      this.roll(it, it.z);
      this.items.push(it);
    }
    this.count = count;
  }
  roll(it, z) {
    const r = this.rng;
    const side = r.sign();
    it.x = side * r.range(34, 110);
    it.z = z;
    it.h = r.range(14, 70);
    it.w = r.range(4, 14);
    it.rot = r.range(0, Math.PI);
  }
  update(shipZ) {
    let minZ = Infinity;
    for (const it of this.items) minZ = Math.min(minZ, it.z);
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (it.z > shipZ + 60) { this.roll(it, minZ - 22); minZ = it.z; }
      this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.rot);
      this.s.set(it.w, it.h, it.w);
      this.M.compose(new THREE.Vector3(it.x, -2, it.z), this.q, this.s);
      this.mesh.setMatrixAt(i, this.M);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Boost gates: square arches with emissive rims. */
export class Gates {
  constructor(rng, count = 10) {
    this.rng = rng;
    this.group = new THREE.Group();
    this.items = [];
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x35404f, metalness: 0.85, roughness: 0.35 });
    this.rimMat = new THREE.MeshStandardMaterial({ color: PALETTE.gate, emissive: PALETTE.gate, emissiveIntensity: 2.2, roughness: 0.4 });
    const W = 22, H = 14, T = 1.2;
    const frame = new THREE.Group();
    const bar = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 2.2), frameMat); m.position.set(x, y, 0); frame.add(m); };
    bar(W + T, T, 0, H / 2); bar(W + T, T, 0, -H / 2); bar(T, H, -W / 2, 0); bar(T, H, W / 2, 0);
    // rim lights inside frame
    const rim = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.5), this.rimMat); m.position.set(x, y, 0); frame.add(m); };
    rim(W - 0.4, 0.35, 0, H / 2 - T / 2 - 0.3); rim(W - 0.4, 0.35, 0, -H / 2 + T / 2 + 0.3);
    rim(0.35, H - 0.4, -W / 2 + T / 2 + 0.3, 0); rim(0.35, H - 0.4, W / 2 - T / 2 - 0.3, 0);
    // corner beacons
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), this.rimMat);
      b.position.set(sx * (W / 2 + T * 0.4), sy * (H / 2 + T * 0.4), 0); frame.add(b);
    }
    for (let i = 0; i < count; i++) {
      const g = frame.clone();
      const it = { g, x: 0, y: 0, z: -140 - i * 150, passed: false, flash: 0 };
      this.place(it, it.z);
      this.group.add(g);
      this.items.push(it);
    }
    this.W = W; this.H = H;
  }
  place(it, z) {
    const r = this.rng;
    it.x = r.range(-10, 10); it.y = r.range(6, 20); it.z = z; it.passed = false; it.flash = 0;
    it.g.position.set(it.x, it.y, it.z);
    it.g.rotation.z = r.range(-0.15, 0.15);
  }
  /** returns true when the ship passes through a gate this frame */
  update(ship, dt) {
    let minZ = Infinity, hit = false;
    for (const it of this.items) minZ = Math.min(minZ, it.z);
    for (const it of this.items) {
      if (it.z > ship.z + 40) { this.place(it, minZ - 150); minZ = it.z; }
      if (!it.passed && ship.z < it.z && ship.z > it.z - 12) {
        it.passed = true;
        if (Math.abs(ship.x - it.x) < this.W / 2 && Math.abs(ship.y - it.y) < this.H / 2) { it.flash = 1; hit = true; }
      }
      it.flash = Math.max(0, it.flash - dt * 2.5);
      it.g.scale.setScalar(1 + it.flash * 0.08);
    }
    return hit;
  }
}
