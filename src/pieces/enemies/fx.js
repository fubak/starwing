/**
 * Lightweight VFX owned by the enemies piece: instanced laser bolts,
 * pooled explosions (flash + fireball + shockwave + sparks) and smoke trails.
 */
import * as THREE from 'three';
import { glowSpriteTexture } from './craft.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _v = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------- bolts
export class BoltPool {
  /**
   * @param {THREE.Scene} scene
   * @param {{color:number, core?:number, max?:number, length?:number, radius?:number}} o
   */
  constructor(scene, { color, core = 0xffffff, max = 48, length = 5, radius = 0.28 }) {
    this.max = max; this.scene = scene;
    this.bolts = []; // {p, v, life, owner}
    const halo = new THREE.SphereGeometry(1, 10, 8); halo.scale(radius, radius, length * 0.5);
    const cr = new THREE.SphereGeometry(1, 8, 6); cr.scale(radius * 0.38, radius * 0.38, length * 0.46);
    this.halo = new THREE.InstancedMesh(halo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), max);
    this.core = new THREE.InstancedMesh(cr, new THREE.MeshBasicMaterial({ color: core, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), max);
    this.halo.frustumCulled = this.core.frustumCulled = false;
    this.halo.count = this.core.count = 0;
    scene.add(this.halo, this.core);
    // muzzle glow sprite material
    this.flashMat = new THREE.SpriteMaterial({ map: glowSpriteTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.flashes = [];
  }
  fire(origin, dir, speed, owner = null) {
    if (this.bolts.length >= this.max) this.bolts.shift();
    this.bolts.push({ p: origin.clone(), v: dir.clone().normalize().multiplyScalar(speed), life: 2.6, owner, prev: origin.clone() });
    const sp = new THREE.Sprite(this.flashMat); sp.position.copy(origin); sp.scale.setScalar(3.5); sp.userData.t = 0;
    this.scene.add(sp); this.flashes.push(sp);
  }
  update(dt) {
    const list = this.bolts;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i]; b.prev.copy(b.p); b.p.addScaledVector(b.v, dt); b.life -= dt;
      if (b.life <= 0) list.splice(i, 1);
    }
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      _m.lookAt(b.p, _v.copy(b.p).add(b.v), UP); _q.setFromRotationMatrix(_m);
      _m.compose(b.p, _q, _s.set(1, 1, 1));
      this.halo.setMatrixAt(i, _m); this.core.setMatrixAt(i, _m);
    }
    this.halo.count = this.core.count = list.length;
    this.halo.instanceMatrix.needsUpdate = this.core.instanceMatrix.needsUpdate = true;
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i]; f.userData.t += dt * 9; f.scale.setScalar(3.5 * (1 - f.userData.t) + 0.01);
      if (f.userData.t >= 1) { this.scene.remove(f); this.flashes.splice(i, 1); }
    }
  }
  remove(b) { const i = this.bolts.indexOf(b); if (i >= 0) this.bolts.splice(i, 1); }
  dispose() {
    this.scene.remove(this.halo, this.core); this.flashes.forEach((f) => this.scene.remove(f));
    this.halo.geometry.dispose(); this.halo.material.dispose(); this.core.geometry.dispose(); this.core.material.dispose(); this.flashMat.dispose();
  }
}

// ---------------------------------------------------------------- explosions
// Stylised multi-stage burst: white-hot core pop -> spiky cel-banded fireball that
// erodes away by noise -> hot shards + sparks -> camera-facing shock ring.
const NOISE3 = /* glsl */`
  float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
  float noise(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
  float fbm(vec3 p){ return noise(p)*0.6 + noise(p*2.3+7.1)*0.28 + noise(p*5.1-3.3)*0.12; }
`;
const FIREBALL_SHADER = {
  vertexShader: /* glsl */`
    uniform float uT; uniform float uSeed; varying float vN; varying float vFres; varying vec3 vP;
    ${NOISE3}
    void main(){
      vec3 dir = normalize(position);
      float n = fbm(dir*1.9 + uSeed + uT*0.8);
      float spikes = pow(noise(dir*4.5 + uSeed*3.0), 6.0) * 0.7;      // a few tongues of flame
      vN = n;
      vec3 p = dir * (0.6 + 0.6*n + spikes*(1.0-uT*0.6));
      vP = p;
      vec4 mv = modelViewMatrix * vec4(p,1.0);
      vec3 nv = normalize(normalMatrix * normal);
      vFres = 1.0 - abs(dot(nv, normalize(-mv.xyz)));
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */`
    uniform float uT; uniform float uSeed; varying float vN; varying float vFres; varying vec3 vP;
    ${NOISE3}
    void main(){
      // erosion: burn away from the noise edges (crisp cutout, no fog of alpha)
      float n = fbm(vP*2.6 + uSeed*5.0 + uT*1.2);
      float burn = smoothstep(0.15, 1.0, uT);
      if (n < burn*1.05 - 0.05) discard;
      // cel bands: white core -> yellow -> orange -> ember. Volume comes from the view-facing term
      // (centre hot, silhouette cooler) plus the noise so it reads as a ball, not a cut-out.
      float facing = 1.0 - vFres;
      float heat = facing*facing*0.9 + (n - burn)*0.9 + vN*0.3 - uT*0.55;
      vec3 c;
      if (heat > 0.95)      c = vec3(2.6, 2.4, 2.0);
      else if (heat > 0.65) c = vec3(2.4, 1.7, 0.45);
      else if (heat > 0.3)  c = vec3(2.0, 0.72, 0.1);
      else                  c = vec3(0.6, 0.14, 0.05);
      // dark charred rim right at the erosion edge
      float edge = smoothstep(0.0, 0.06, n - (burn*1.05 - 0.05));
      c = mix(vec3(0.16, 0.06, 0.03), c, edge);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

class Explosion {
  constructor(scene) {
    this.scene = scene; this.active = false; this.t = 0; this.dur = 1.25;
    this.group = new THREE.Group(); this.group.visible = false;
    this.fire = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 5), new THREE.ShaderMaterial({
      ...FIREBALL_SHADER, uniforms: { uT: { value: 0 }, uSeed: { value: 0 } }, transparent: false, depthWrite: false,
    }));
    this.fire.material.toneMapped = false;
    // white-hot core: solid unlit sphere that pops first
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshBasicMaterial({ color: 0xfff6e0, toneMapped: false, transparent: true, depthWrite: false }));
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSpriteTexture(), color: 0xffe2b0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffc080, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    // hot shards (instanced tetrahedra)
    const NS = 22; this.NS = NS;
    this.shards = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xff9a40, toneMapped: false }), NS);
    this.shards.frustumCulled = false;
    this.shardV = new Float32Array(NS * 3); this.shardP = new Float32Array(NS * 3); this.shardR = new Float32Array(NS * 3); this.shardS = new Float32Array(NS);
    const N = 80; this.N = N;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.sparks = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.9, vertexColors: true, map: glowSpriteTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, toneMapped: false }));
    this.vel = new Float32Array(N * 3);
    this.group.add(this.fire, this.core, this.flash, this.ring, this.shards, this.sparks);
    scene.add(this.group);
    this.light = new THREE.PointLight(0xffa050, 0, 90, 1.6); this.group.add(this.light);
  }
  spawn(p, size = 1, seed = 0) {
    this.active = true; this.t = 0; this.size = size;
    this.group.visible = true; this.group.position.copy(p);
    this.fire.material.uniforms.uSeed.value = seed;
    this.fire.rotation.set(Math.random() * 6, Math.random() * 6, 0);
    const pa = this.sparks.geometry.attributes.position.array, ca = this.sparks.geometry.attributes.color.array;
    for (let i = 0; i < this.N; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), sp = (18 + Math.random() * 40) * size;
      this.vel[i * 3] = Math.sin(ph) * Math.cos(th) * sp; this.vel[i * 3 + 1] = Math.sin(ph) * Math.sin(th) * sp; this.vel[i * 3 + 2] = Math.cos(ph) * sp;
      pa[i * 3] = pa[i * 3 + 1] = pa[i * 3 + 2] = 0;
      const w = Math.random(); ca[i * 3] = 3; ca[i * 3 + 1] = 1.2 + w * 1.5; ca[i * 3 + 2] = 0.3 + w * 0.8;
    }
    this.sparks.geometry.attributes.position.needsUpdate = true; this.sparks.geometry.attributes.color.needsUpdate = true;
    for (let i = 0; i < this.NS; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), sp = (16 + Math.random() * 34) * size;
      this.shardV[i * 3] = Math.sin(ph) * Math.cos(th) * sp; this.shardV[i * 3 + 1] = Math.sin(ph) * Math.sin(th) * sp; this.shardV[i * 3 + 2] = Math.cos(ph) * sp;
      this.shardP[i * 3] = this.shardP[i * 3 + 1] = this.shardP[i * 3 + 2] = 0;
      this.shardR[i * 3] = Math.random() * 6; this.shardR[i * 3 + 1] = Math.random() * 6; this.shardR[i * 3 + 2] = Math.random() * 6;
      this.shardS[i] = (0.35 + Math.random() * 0.7) * size;
    }
  }
  update(dt, camera) {
    if (!this.active) return;
    this.t += dt; const u = this.t / this.dur, S = this.size;
    if (u >= 1) { this.active = false; this.group.visible = false; return; }
    // fireball: fast pop with overshoot, then slow expansion while it erodes
    const pop = 1 - Math.pow(1 - Math.min(u * 2.6, 1), 3);
    const over = 1 + 0.18 * Math.sin(Math.min(u * 2.6, 1) * Math.PI);
    const r = (3.4 * pop * over + 1.8 * u) * S;
    this.fire.scale.setScalar(r); this.fire.material.uniforms.uT.value = u;
    this.fire.visible = u > 0.03;
    // white core pops first and shrinks as the fireball overtakes it
    const cu = Math.min(u / 0.22, 1);
    const cr = (4.2 * Math.sin(cu * Math.PI * 0.5) * (1 - cu * 0.75)) * S;
    this.core.scale.setScalar(Math.max(cr, 0.01)); this.core.material.opacity = 1 - cu; this.core.visible = cu < 1;
    // flash: short, then gone (no lingering wash)
    const fl = Math.max(0, 1 - u * 6);
    this.flash.scale.setScalar(22 * S * (0.5 + fl)); this.flash.material.opacity = fl * 0.9; this.flash.visible = fl > 0;
    // shock ring: thin, camera-facing, quick
    const ring = Math.min(u * 2.8, 1);
    this.ring.quaternion.copy(camera.quaternion);
    this.ring.scale.setScalar(1 + 16 * S * (1 - Math.pow(1 - ring, 2.2))); this.ring.material.opacity = 0.7 * (1 - ring) * (1 - ring);
    this.ring.visible = ring < 1;
    // shards
    const heat = Math.max(0, 1 - u * 1.3);
    this.shards.material.color.setRGB(0.25 + 2.4 * heat, 0.1 + 1.0 * heat * heat, 0.04 + 0.25 * heat * heat * heat);
    for (let i = 0; i < this.NS; i++) {
      this.shardV[i * 3 + 1] -= 22 * dt;
      this.shardP[i * 3] += this.shardV[i * 3] * dt; this.shardP[i * 3 + 1] += this.shardV[i * 3 + 1] * dt; this.shardP[i * 3 + 2] += this.shardV[i * 3 + 2] * dt;
      this.shardR[i * 3] += dt * 9; this.shardR[i * 3 + 1] += dt * 6;
      _q.setFromEuler(new THREE.Euler(this.shardR[i * 3], this.shardR[i * 3 + 1], this.shardR[i * 3 + 2]));
      const sc = this.shardS[i] * (1 - u * 0.6);
      _m.compose(_v.set(this.shardP[i * 3], this.shardP[i * 3 + 1], this.shardP[i * 3 + 2]), _q, _s.set(sc, sc, sc * 2.2));
      this.shards.setMatrixAt(i, _m);
    }
    this.shards.instanceMatrix.needsUpdate = true;
    // sparks
    const pa = this.sparks.geometry.attributes.position.array;
    for (let i = 0; i < this.N; i++) {
      this.vel[i * 3 + 1] -= 18 * dt;
      pa[i * 3] += this.vel[i * 3] * dt; pa[i * 3 + 1] += this.vel[i * 3 + 1] * dt; pa[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3] *= 0.985; this.vel[i * 3 + 1] *= 0.985; this.vel[i * 3 + 2] *= 0.985;
    }
    this.sparks.geometry.attributes.position.needsUpdate = true;
    this.sparks.material.opacity = 1 - u * u; this.sparks.material.size = 1.1 * S * (1 - u * 0.5);
    this.light.intensity = 260 * S * fl + 90 * S * heat;
  }
  dispose() {
    this.scene.remove(this.group);
    this.fire.geometry.dispose(); this.fire.material.dispose(); this.flash.material.dispose(); this.core.geometry.dispose(); this.core.material.dispose();
    this.ring.geometry.dispose(); this.ring.material.dispose(); this.sparks.geometry.dispose(); this.sparks.material.dispose();
    this.shards.geometry.dispose(); this.shards.material.dispose();
  }
}

export class ExplosionPool {
  constructor(scene, n = 8) { this.items = Array.from({ length: n }, () => new Explosion(scene)); this.i = 0; }
  spawn(p, size = 1) { const e = this.items[this.i++ % this.items.length]; e.spawn(p, size, Math.random() * 10); return e; }
  update(dt, cam) { for (const e of this.items) e.update(dt, cam); }
  dispose() { this.items.forEach((e) => e.dispose()); }
}

// ---------------------------------------------------------------- engine ribbon trails
const _c = new THREE.Vector3(), _d = new THREE.Vector3(), _w = new THREE.Vector3();
export class Trail {
  /** Camera-facing ribbon behind a moving point. push(worldPos) each frame, update(camera). */
  constructor(scene, color, { n = 16, width = 0.55, opacity = 0.75 } = {}) {
    this.n = n; this.width = width; this.pts = []; this.scene = scene;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 2 * 3); this.alpha = new Float32Array(n * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aA', new THREE.BufferAttribute(this.alpha, 1));
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
      vertexShader: /* glsl */`attribute float aA; varying float vA; void main(){ vA = aA; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: /* glsl */`uniform vec3 uColor; uniform float uOpacity; varying float vA; void main(){ gl_FragColor = vec4(uColor * (0.6 + 1.4*vA*vA), vA*uOpacity); }`,
    }));
    this.mesh.frustumCulled = false; this.mesh.visible = false;
    scene.add(this.mesh);
  }
  reset() { this.pts.length = 0; this.mesh.visible = false; }
  push(p) {
    if (this.pts.length >= this.n) this.pts.pop();
    this.pts.unshift(p.clone());
  }
  update(camera, boost = 1) {
    const P = this.pts; if (P.length < 2) { this.mesh.visible = false; return; }
    this.mesh.visible = true;
    const n = this.n;
    for (let i = 0; i < n; i++) {
      const k = Math.min(i, P.length - 1), p = P[k];
      const q = P[Math.min(k + 1, P.length - 1)], r = P[Math.max(k - 1, 0)];
      _d.copy(r).sub(q); if (_d.lengthSq() < 1e-6) _d.set(0, 0, 1);
      _c.copy(camera.position).sub(p);
      _w.crossVectors(_d, _c).normalize();
      const u = i / (n - 1), w = this.width * boost * (1 - u) * (0.4 + 0.6 * Math.min(1, i * 0.5));
      const a = (1 - u) * (k < P.length - 1 ? 1 : 0);
      const o = i * 6;
      this.pos[o] = p.x + _w.x * w; this.pos[o + 1] = p.y + _w.y * w; this.pos[o + 2] = p.z + _w.z * w;
      this.pos[o + 3] = p.x - _w.x * w; this.pos[o + 4] = p.y - _w.y * w; this.pos[o + 5] = p.z - _w.z * w;
      this.alpha[i * 2] = this.alpha[i * 2 + 1] = a;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.aA.needsUpdate = true;
  }
  dispose() { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

// ---------------------------------------------------------------- smoke / hit sparks (sprite pool)
let _smokeTex = null;
/** Lumpy soft smoke puff (several overlapping blobs) so smoke does not read as a glow disc. */
export function smokeTexture() {
  if (_smokeTex) return _smokeTex;
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2, rr = 18 + Math.random() * 12;
    const x = 64 + Math.cos(a) * rr, y = 64 + Math.sin(a) * rr, r = 26 + Math.random() * 12;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  }
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 40);
  gr.addColorStop(0, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  _smokeTex = new THREE.CanvasTexture(c); _smokeTex.colorSpace = THREE.SRGBColorSpace;
  return _smokeTex;
}

export class SpritePool {
  constructor(scene, n = 120) {
    this.scene = scene; this.items = [];
    this.glowTex = glowSpriteTexture(); this.smokeTex = smokeTexture();
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, transparent: true, depthWrite: false, opacity: 0 }));
      sp.visible = false; sp.userData = { life: 0, dur: 1, vel: new THREE.Vector3(), grow: 0, s0: 1, a0: 1, additive: false, delay: 0, rot: 0 };
      scene.add(sp); this.items.push(sp);
    }
    this.i = 0;
  }
  /** emit({p, vel, size, grow, dur, color, additive, opacity, smoke, delay}) */
  emit({ p, vel, size = 1, grow = 1.5, dur = 1, color = 0x222222, additive = false, opacity = 0.6, smoke = false, delay = 0 }) {
    const sp = this.items[this.i++ % this.items.length];
    sp.visible = true; sp.position.copy(p); sp.scale.setScalar(delay > 0 ? 0.001 : size);
    const d = sp.userData; d.life = -delay; d.dur = dur; d.vel.copy(vel); d.grow = grow; d.s0 = size; d.a0 = opacity;
    d.rot = (Math.random() - 0.5) * 1.5;
    sp.material.map = smoke ? this.smokeTex : this.glowTex;
    sp.material.rotation = Math.random() * Math.PI * 2;
    sp.material.color.set(color); sp.material.opacity = delay > 0 ? 0 : opacity;
    sp.material.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    sp.material.needsUpdate = true;
  }
  update(dt) {
    for (const sp of this.items) {
      if (!sp.visible) continue;
      const d = sp.userData; d.life += dt;
      if (d.life < 0) continue;
      const u = d.life / d.dur;
      if (u >= 1) { sp.visible = false; continue; }
      sp.position.addScaledVector(d.vel, dt); d.vel.multiplyScalar(1 - 1.5 * dt);
      sp.scale.setScalar(d.s0 * (1 + d.grow * u));
      sp.material.rotation += d.rot * dt;
      sp.material.opacity = d.a0 * (1 - u) * (1 - u);
    }
  }
  dispose() { this.items.forEach((s) => { this.scene.remove(s); s.material.dispose(); }); }
}
