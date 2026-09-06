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
const FIREBALL_SHADER = {
  vertexShader: /* glsl */`
    uniform float uT; uniform float uSeed; varying float vFres; varying float vN;
    float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
    float noise(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                 mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
    void main(){
      float n = noise(normal*2.2 + uSeed + uT*1.5) * 0.7 + noise(normal*5.0 - uSeed + uT*3.0) * 0.3;
      vN = n;
      vec3 p = position * (0.75 + 0.55*n);
      vec4 mv = modelViewMatrix * vec4(p,1.0);
      vec3 nv = normalize(normalMatrix * normal);
      vFres = pow(1.0 - abs(dot(nv, normalize(-mv.xyz))), 1.5);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */`
    uniform float uT; varying float vFres; varying float vN;
    void main(){
      vec3 hot = vec3(6.0, 4.2, 2.0), mid = vec3(3.5, 1.1, 0.15), cool = vec3(0.35, 0.12, 0.08), smoke = vec3(0.08,0.07,0.08);
      float k = clamp(uT*1.15 + vN*0.35 - 0.2, 0.0, 1.0);
      vec3 c = mix(hot, mid, smoothstep(0.0, 0.35, k));
      c = mix(c, cool, smoothstep(0.3, 0.7, k));
      c = mix(c, smoke, smoothstep(0.6, 1.0, k));
      float a = (1.0 - smoothstep(0.55, 1.0, uT)) * (0.75 + 0.25*vFres);
      gl_FragColor = vec4(c, a);
    }`,
};

class Explosion {
  constructor(scene) {
    this.scene = scene; this.active = false; this.t = 0; this.dur = 1.3;
    this.group = new THREE.Group(); this.group.visible = false;
    this.fire = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 4), new THREE.ShaderMaterial({
      ...FIREBALL_SHADER, uniforms: { uT: { value: 0 }, uSeed: { value: 0 } }, transparent: true, depthWrite: false,
    }));
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSpriteTexture(), color: 0xfff1d0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffb070, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    const N = 70; this.N = N;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.sparks = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.9, vertexColors: true, map: glowSpriteTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, toneMapped: false }));
    this.vel = new Float32Array(N * 3);
    this.group.add(this.fire, this.flash, this.ring, this.sparks);
    scene.add(this.group);
    this.light = new THREE.PointLight(0xffa050, 0, 60, 1.6); this.group.add(this.light);
  }
  spawn(p, size = 1, seed = 0) {
    this.active = true; this.t = 0; this.size = size;
    this.group.visible = true; this.group.position.copy(p);
    this.fire.material.uniforms.uSeed.value = seed;
    const pa = this.sparks.geometry.attributes.position.array, ca = this.sparks.geometry.attributes.color.array;
    for (let i = 0; i < this.N; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), sp = (14 + Math.random() * 30) * size;
      this.vel[i * 3] = Math.sin(ph) * Math.cos(th) * sp; this.vel[i * 3 + 1] = Math.sin(ph) * Math.sin(th) * sp; this.vel[i * 3 + 2] = Math.cos(ph) * sp;
      pa[i * 3] = pa[i * 3 + 1] = pa[i * 3 + 2] = 0;
      const w = Math.random(); ca[i * 3] = 3; ca[i * 3 + 1] = 1.2 + w * 1.5; ca[i * 3 + 2] = 0.3 + w * 0.8;
    }
    this.sparks.geometry.attributes.position.needsUpdate = true; this.sparks.geometry.attributes.color.needsUpdate = true;
    this.ring.quaternion.random();
  }
  update(dt, camera) {
    if (!this.active) return;
    this.t += dt; const u = this.t / this.dur, S = this.size;
    if (u >= 1) { this.active = false; this.group.visible = false; return; }
    // fireball: fast pop with overshoot then slow drift
    const pop = 1 - Math.pow(1 - Math.min(u * 2.2, 1), 3);
    const r = (4.5 * pop + 2.5 * u) * S;
    this.fire.scale.setScalar(r); this.fire.material.uniforms.uT.value = u;
    // flash
    const fl = Math.max(0, 1 - u * 5);
    this.flash.scale.setScalar(26 * S * (0.4 + fl)); this.flash.material.opacity = fl;
    // shockwave ring
    const rr = u * 3; const ring = Math.min(rr, 1);
    this.ring.scale.setScalar(2 + 30 * S * (1 - Math.pow(1 - ring, 2.5))); this.ring.material.opacity = 0.8 * (1 - ring);
    this.ring.visible = ring < 1;
    // sparks
    const pa = this.sparks.geometry.attributes.position.array;
    for (let i = 0; i < this.N; i++) {
      this.vel[i * 3 + 1] -= 18 * dt;
      pa[i * 3] += this.vel[i * 3] * dt; pa[i * 3 + 1] += this.vel[i * 3 + 1] * dt; pa[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3] *= 0.985; this.vel[i * 3 + 1] *= 0.985; this.vel[i * 3 + 2] *= 0.985;
    }
    this.sparks.geometry.attributes.position.needsUpdate = true;
    this.sparks.material.opacity = 1 - u * u; this.sparks.material.size = 0.9 * S * (1 - u * 0.5);
    this.light.intensity = 400 * S * fl + 60 * S * (1 - u);
  }
  dispose() {
    this.scene.remove(this.group);
    this.fire.geometry.dispose(); this.fire.material.dispose(); this.flash.material.dispose();
    this.ring.geometry.dispose(); this.ring.material.dispose(); this.sparks.geometry.dispose(); this.sparks.material.dispose();
  }
}

export class ExplosionPool {
  constructor(scene, n = 8) { this.items = Array.from({ length: n }, () => new Explosion(scene)); this.i = 0; }
  spawn(p, size = 1) { const e = this.items[this.i++ % this.items.length]; e.spawn(p, size, Math.random() * 10); return e; }
  update(dt, cam) { for (const e of this.items) e.update(dt, cam); }
  dispose() { this.items.forEach((e) => e.dispose()); }
}

// ---------------------------------------------------------------- smoke / hit sparks (sprite pool)
export class SpritePool {
  constructor(scene, n = 120) {
    this.scene = scene; this.items = [];
    const tex = glowSpriteTexture();
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
      sp.visible = false; sp.userData = { life: 0, dur: 1, vel: new THREE.Vector3(), grow: 0, s0: 1, a0: 1, additive: false };
      scene.add(sp); this.items.push(sp);
    }
    this.i = 0;
  }
  /** emit({p, vel, size, grow, dur, color, additive, opacity}) */
  emit({ p, vel, size = 1, grow = 1.5, dur = 1, color = 0x222222, additive = false, opacity = 0.6 }) {
    const sp = this.items[this.i++ % this.items.length];
    sp.visible = true; sp.position.copy(p); sp.scale.setScalar(size);
    const d = sp.userData; d.life = 0; d.dur = dur; d.vel.copy(vel); d.grow = grow; d.s0 = size; d.a0 = opacity;
    sp.material.color.set(color); sp.material.opacity = opacity;
    sp.material.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    sp.material.needsUpdate = true;
  }
  update(dt) {
    for (const sp of this.items) {
      if (!sp.visible) continue;
      const d = sp.userData; d.life += dt; const u = d.life / d.dur;
      if (u >= 1) { sp.visible = false; continue; }
      sp.position.addScaledVector(d.vel, dt); d.vel.multiplyScalar(1 - 1.5 * dt);
      sp.scale.setScalar(d.s0 * (1 + d.grow * u));
      sp.material.opacity = d.a0 * (1 - u) * (1 - u);
    }
  }
  dispose() { this.items.forEach((s) => { this.scene.remove(s); s.material.dispose(); }); }
}
