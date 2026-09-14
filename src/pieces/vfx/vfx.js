// STARWING VFX library.
//   const vfx = createVfx(ctx);
//   vfx.laser(pos, dir, { color, speed })      twin-capable bolt (core+glow+trail)
//   vfx.muzzleFlash(pos, dir, color)
//   vfx.hitSparks(pos, normal, color)
//   vfx.explode(pos, size, { color })           layered: flash, fireballs, ring, debris, smoke, embers
//   vfx.bomb(pos, { radius })                  smart bomb expanding sphere
//   vfx.charge.begin(muzzleFn) / .lock(target) / .release() / .cancel()
//   vfx.trail({ color, width })                 boost afterburner ribbon (+ flame cone)
//   vfx.shake(strength)  vfx.hitStop(seconds)   -> vfx.timeScale, vfx.applyShake(camera)
//   vfx.update(dt, camera)  vfx.dispose()
import * as THREE from 'three';
import { ParticleSystem, P } from './particles.js';
import { DebrisSystem } from './debris.js';
import { LaserSystem } from './lasers.js';

const V = () => new THREE.Vector3();
const _a = V(), _b = V(), _c = V(), _q = new THREE.Quaternion();
const _col = new THREE.Color(), _col2 = new THREE.Color();
const WHITE = new THREE.Color(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

export const PALETTE = {
  playerLaser: new THREE.Color(0.35, 1.0, 0.45),
  playerLaserHot: new THREE.Color(0.8, 1.0, 0.7),
  enemyLaser: new THREE.Color(1.0, 0.25, 0.2),
  charge: new THREE.Color(0.45, 0.75, 1.0),
  fireHot: new THREE.Color(1.0, 0.82, 0.38),
  fireCool: new THREE.Color(1.0, 0.36, 0.06),
  // Smoke shadow was effectively black (0.05), so a plume read as a hole punched
  // in the sky rather than a lit volume. Lift the shadow to a cool slate that
  // sits in the same family as the hemisphere ambient, and warm the lit side.
  smokeLit: new THREE.Color(0.58, 0.52, 0.48),
  smokeDark: new THREE.Color(0.13, 0.13, 0.155),
  debris: new THREE.Color(0.16, 0.15, 0.17),
  boost: new THREE.Color(0.3, 0.7, 1.0),
  boostHot: new THREE.Color(0.85, 0.95, 1.0),
  bomb: new THREE.Color(0.35, 0.72, 1.0),
};

// ---------- boost trail ribbon ----------
const RIBBON_VERT = /* glsl */ `
attribute float aT;      // 0 head .. 1 tail
attribute float aSide;   // -1 / 1
uniform float uWidth;
uniform float uTime;
uniform float uIntensity;
varying float vT; varying float vSide;
void main() {
  vT = aT; vSide = aSide;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 toCam = normalize(cameraPosition - wp.xyz);
  vec3 tangent = normalize(normal);          // we store segment direction in normal
  vec3 side = normalize(cross(tangent, toCam));
  float w = uWidth * (0.55 + 0.6 * uIntensity) * (1.0 - vT * 0.7) * (1.0 + 0.15 * sin(vT * 40.0 - uTime * 30.0));
  wp.xyz += side * aSide * w;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const RIBBON_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor; uniform vec3 uHot; uniform float uIntensity; uniform float uTime;
varying float vT; varying float vSide;
void main() {
  float edge = 1.0 - abs(vSide);
  float core = pow(edge, 1.6);
  float fade = pow(1.0 - vT, 1.4);
  float flick = 0.85 + 0.15 * sin(uTime * 45.0 + vT * 25.0);
  vec3 col = mix(uColor, uHot, core * (1.0 - vT) * 0.9);
  gl_FragColor = vec4(col * core * fade * uIntensity * 1.5 * flick, 0.0);
}
`;

const FLAME_VERT = /* glsl */ `
varying vec2 vUv; varying float vFacing;
uniform float uIntensity; uniform float uTime;
void main() {
  vUv = uv;
  vec3 p = position;
  float len = 0.3 + 0.9 * uIntensity;
  p.y = p.y * len;                              // cone along -y (points backward)
  float wob = 1.0 + 0.08 * sin(uTime * 60.0 + uv.y * 9.0);
  p.xz *= wob * (0.5 + 0.3 * uIntensity);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec3 n = normalize(normalMatrix * normal);
  vFacing = abs(dot(n, normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
}
`;
const FLAME_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor; uniform vec3 uHot; uniform float uIntensity; uniform float uTime;
varying vec2 vUv; varying float vFacing;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
void main() {
  float t = vUv.y;                       // 1 at nozzle (top of cone), 0 at tip
  float n = vnoise(vec2(vUv.x * 6.0, t * 4.0 + uTime * 14.0));
  float body = smoothstep(0.0, 0.35, t) * (0.6 + 0.4 * n);
  float g = pow(vFacing, 1.3) * body;
  vec3 col = mix(uColor, uHot, pow(t, 2.0) * 0.9);
  float tip = smoothstep(0.0, 0.25, t);   // soft tip, no hard cone edge
  gl_FragColor = vec4(col * g * tip * (0.45 + 0.9 * uIntensity), 0.0);
}
`;

class BoostTrail {
  constructor(o = {}) {
    this.n = o.segments ?? 28;
    this.spacing = o.spacing ?? 0.06; // seconds between samples
    this.color = o.color ?? PALETTE.boost;
    this.hot = o.hot ?? PALETTE.boostHot;
    this.width = o.width ?? 0.35;
    this.intensity = 0; this.target = 0;
    this.pts = []; for (let i = 0; i < this.n; i++) this.pts.push(V());
    this.dirs = []; for (let i = 0; i < this.n; i++) this.dirs.push(new THREE.Vector3(0, 0, 1));
    this.acc = 0; this.inited = false;
    const geo = new THREE.BufferGeometry();
    const n = this.n;
    const pos = new Float32Array(n * 2 * 3), nor = new Float32Array(n * 2 * 3), aT = new Float32Array(n * 2), aS = new Float32Array(n * 2);
    const idx = [];
    for (let i = 0; i < n; i++) { aT[i * 2] = aT[i * 2 + 1] = i / (n - 1); aS[i * 2] = -1; aS[i * 2 + 1] = 1; }
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
    geo.setAttribute('aSide', new THREE.BufferAttribute(aS, 1));
    geo.setIndex(idx);
    this.geometry = geo;
    const add = { transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor };
    this.material = new THREE.ShaderMaterial({
      vertexShader: RIBBON_VERT, fragmentShader: RIBBON_FRAG, ...add, side: THREE.DoubleSide,
      uniforms: { uWidth: { value: this.width }, uTime: { value: 0 }, uIntensity: { value: 0 }, uColor: { value: this.color }, uHot: { value: this.hot } },
    });
    this.mesh = new THREE.Mesh(geo, this.material); this.mesh.frustumCulled = false; this.mesh.renderOrder = 8;
    // flame cone at the nozzle
    const cone = new THREE.ConeGeometry(0.5, 1, 14, 6, true);
    cone.translate(0, -0.5, 0); // apex down (-y), base at origin
    this.flameMat = new THREE.ShaderMaterial({
      vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG, ...add, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uIntensity: { value: 0 }, uColor: { value: this.color }, uHot: { value: this.hot } },
    });
    this.flame = new THREE.Mesh(cone, this.flameMat); this.flame.renderOrder = 8; this.flame.frustumCulled = false;
    this.group = new THREE.Group(); this.group.add(this.mesh, this.flame);
    this.time = 0;
  }
  /** head: world position of nozzle; dir: world forward of the craft (flame points opposite). */
  update(dt, head, dir, boost) {
    this.time += dt;
    this.target = boost;
    this.intensity += (this.target - this.intensity) * Math.min(1, dt * (boost > this.intensity ? 9 : 4));
    if (!this.inited) { for (const p of this.pts) p.copy(head); this.inited = true; }
    this.acc += dt;
    // sample history: shift when spacing exceeded, always pin head
    if (this.acc >= this.spacing) {
      this.acc -= this.spacing;
      for (let i = this.n - 1; i > 0; i--) this.pts[i].copy(this.pts[i - 1]);
    }
    this.pts[0].copy(head);
    const pa = this.geometry.attributes.position, na = this.geometry.attributes.normal;
    for (let i = 0; i < this.n; i++) {
      const p = this.pts[i];
      const nxt = this.pts[Math.min(i + 1, this.n - 1)], prv = this.pts[Math.max(i - 1, 0)];
      _a.copy(prv).sub(nxt); if (_a.lengthSq() < 1e-8) _a.copy(dir);
      _a.normalize();
      pa.setXYZ(i * 2, p.x, p.y, p.z); pa.setXYZ(i * 2 + 1, p.x, p.y, p.z);
      na.setXYZ(i * 2, _a.x, _a.y, _a.z); na.setXYZ(i * 2 + 1, _a.x, _a.y, _a.z);
    }
    pa.needsUpdate = true; na.needsUpdate = true;
    this.material.uniforms.uTime.value = this.time; this.material.uniforms.uIntensity.value = this.intensity;
    this.flame.position.copy(head);
    _q.setFromUnitVectors(UP, _a.copy(dir).negate().normalize()); // cone -y should point backward => cone's -y = -dir => +y = dir... set +y = -(-dir)
    _q.setFromUnitVectors(DOWN, _a.copy(dir).negate());
    this.flame.quaternion.copy(_q);
    this.flameMat.uniforms.uTime.value = this.time; this.flameMat.uniforms.uIntensity.value = this.intensity;
    this.flame.visible = this.intensity > 0.02;
  }
  dispose() { this.geometry.dispose(); this.material.dispose(); this.flame.geometry.dispose(); this.flameMat.dispose(); }
}

// ---------- charge shot + lock-on ----------
const PLASMA_VERT = /* glsl */ `
uniform float uTime;
varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main() {
  vP = position;
  vec3 p = position * (1.0 + 0.06 * sin(uTime * 23.0 + position.y * 8.0) * sin(uTime * 17.0 + position.x * 7.0));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * normal); vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;
const PLASMA_FRAG = /* glsl */ `
precision highp float;
uniform float uTime; uniform vec3 uColor;
varying vec3 vN; varying vec3 vV; varying vec3 vP;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x), mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x), mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z); }
void main() {
  vec3 n = normalize(vN), v = normalize(vV);
  float facing = max(dot(n, v), 0.0);
  float n1 = noise(vP * 3.0 + vec3(0.0, uTime * 2.5, uTime * 1.3));
  float n2 = noise(vP * 7.0 - vec3(uTime * 3.0, 0.0, uTime * 1.7));
  float veins = pow(smoothstep(0.35, 0.75, n1 * 0.6 + n2 * 0.5), 2.0);
  vec3 core = vec3(1.0) * pow(facing, 2.5) * 2.2;
  vec3 rim = uColor * pow(1.0 - facing, 1.2) * 2.0;
  vec3 col = core + rim + uColor * veins * 2.5 + uColor * 0.6;
  gl_FragColor = vec4(col, 1.0);
}
`;
const BEAM_VERT = /* glsl */ `
varying vec2 vUv; varying float vFacing;
void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * normal); vFacing = abs(dot(n, normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv; }
`;
const BEAM_FRAG = /* glsl */ `
precision highp float;
uniform float uTime; uniform vec3 uColor; uniform float uAlpha;
varying vec2 vUv; varying float vFacing;
void main() {
  float dash = 0.55 + 0.45 * smoothstep(0.3, 0.7, fract(vUv.y * 14.0 - uTime * 6.0));
  float g = pow(vFacing, 1.5) * dash * uAlpha;
  float ends = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.92, 1.0, vUv.y));
  gl_FragColor = vec4(uColor * g * 1.8 * ends, 0.0);
}
`;

function makeReticle(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const outer = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const arc = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 12, 1, i * Math.PI / 2 + 0.25, Math.PI / 2 - 0.5), mat);
    outer.add(arc);
  }
  const inner = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.32), mat);
    const a = i * Math.PI / 2 + Math.PI / 4;
    tick.position.set(Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0); tick.rotation.z = a;
    inner.add(tick);
  }
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.07, 12), mat);
  g.add(outer, inner, dot);
  g.userData = { outer, inner, mat };
  g.renderOrder = 30;
  return g;
}

class ChargeShot {
  constructor(vfx) {
    this.vfx = vfx;
    this.state = 'idle'; // idle | charging | flying
    this.charge = 0; this.target = null; this.muzzleFn = null;
    this.color = PALETTE.charge;
    this.mat = new THREE.ShaderMaterial({ vertexShader: PLASMA_VERT, fragmentShader: PLASMA_FRAG, uniforms: { uTime: { value: 0 }, uColor: { value: this.color } } });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), this.mat);
    this.ball.visible = false; this.ball.renderOrder = 12;
    this.beamMat = new THREE.ShaderMaterial({
      vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      uniforms: { uTime: { value: 0 }, uColor: { value: this.color }, uAlpha: { value: 0 } },
    });
    const cyl = new THREE.CylinderGeometry(0.09, 0.09, 1, 10, 1, true); cyl.translate(0, 0.5, 0);
    this.beam = new THREE.Mesh(cyl, this.beamMat); this.beam.visible = false; this.beam.frustumCulled = false; this.beam.renderOrder = 12;
    this.reticle = makeReticle(0xff4040); this.reticle.visible = false;
    this.group = new THREE.Group(); this.group.add(this.ball, this.beam, this.reticle);
    this.pos = V(); this.dir = new THREE.Vector3(0, 0, -1); this.speed = 110; this.age = 0;
    this.lockT = 0; this.time = 0; this.onHit = null; this.radius = 0.5;
  }
  begin(muzzleFn) { this.state = 'charging'; this.charge = 0; this.muzzleFn = muzzleFn; this.target = null; this.lockT = 0; this.ball.visible = true; }
  lock(target) { if (this.target !== target) this.lockT = 0; this.target = target; }
  cancel() { this.state = 'idle'; this.ball.visible = false; this.beam.visible = false; this.reticle.visible = false; }
  release(onHit) {
    if (this.state !== 'charging') return;
    if (this.charge < 0.3) { this.cancel(); return; }
    this.state = 'flying'; this.age = 0; this.onHit = onHit;
    const m = this.muzzleFn(); this.pos.copy(m.pos); this.dir.copy(m.dir);
    this.beam.visible = false;
    this.vfx.muzzleFlash(m.pos, m.dir, this.color, 2.2);
    this.vfx.shake(0.25);
  }
  update(dt, camera) {
    this.time += dt; this.mat.uniforms.uTime.value = this.time; this.beamMat.uniforms.uTime.value = this.time;
    const vfx = this.vfx;
    if (this.state === 'charging') {
      this.charge = Math.min(1, this.charge + dt * 1.6);
      const m = this.muzzleFn();
      const pulse = 1 + 0.08 * Math.sin(this.time * 28);
      const r = (0.12 + 0.55 * (1 - Math.pow(1 - this.charge, 2))) * pulse;
      this.radius = r;
      this.ball.position.copy(m.pos).addScaledVector(m.dir, 0.4 + r);
      this.ball.scale.setScalar(r);
      // sucked-in sparkles
      if (vfx.rng() < 0.8) {
        _a.set(vfx.rng() - 0.5, vfx.rng() - 0.5, vfx.rng() - 0.5).normalize().multiplyScalar(r * 3.5 + 0.8);
        _b.copy(_a).multiplyScalar(-2.4);
        vfx.particles.spawn({ x: this.ball.position.x + _a.x, y: this.ball.position.y + _a.y, z: this.ball.position.z + _a.z, vx: _b.x, vy: _b.y, vz: _b.z,
          type: P.SPARK, colA: PALETTE.boostHot, colB: this.color, size0: 0.25, size1: 0.05, life: 0.4, drag: 0.001 });
      }
      // lock-on
      const tgt = this.target && !this.target.dead ? this.target : null;
      if (tgt && this.charge > 0.35) {
        this.lockT = Math.min(1, this.lockT + dt * 4);
        this.reticle.visible = true;
        this.reticle.position.copy(tgt.pos);
        if (camera) {
          this.reticle.quaternion.copy(camera.quaternion);
          const d = camera.position.distanceTo(tgt.pos);
          const s = (tgt.radius ?? 1.5) * (2.6 - 1.5 * this.lockT) * (0.8 + 0.06 * Math.sin(this.time * 20)) * Math.max(1, d / 40);
          this.reticle.scale.setScalar(s);
        }
        this.reticle.userData.outer.rotation.z = this.time * 2.5;
        this.reticle.userData.inner.rotation.z = -this.time * 4;
        this.reticle.userData.mat.opacity = 0.55 + 0.45 * this.lockT;
        this.reticle.userData.mat.color.setHex(this.lockT >= 1 ? 0xff5040 : 0xffd040);
        // beam
        this.beam.visible = true;
        _a.copy(tgt.pos).sub(this.ball.position); const L = _a.length(); _a.normalize();
        this.beam.position.copy(this.ball.position);
        this.beam.quaternion.setFromUnitVectors(UP, _a);
        this.beam.scale.set(1, L, 1);
        this.beamMat.uniforms.uAlpha.value = 0.35 + 0.65 * this.lockT;
      } else { this.beam.visible = false; this.reticle.visible = false; this.lockT = 0; }
    } else if (this.state === 'flying') {
      this.age += dt;
      const tgt = this.target && !this.target.dead ? this.target : null;
      if (tgt) { _a.copy(tgt.pos).sub(this.pos).normalize(); this.dir.lerp(_a, Math.min(1, dt * 7)).normalize(); }
      this.pos.addScaledVector(this.dir, this.speed * dt);
      this.ball.position.copy(this.pos);
      this.reticle.visible = false;
      // plasma wake
      for (let i = 0; i < 3; i++) {
        vfx.particles.spawn({ x: this.pos.x + (vfx.rng() - 0.5) * 0.4, y: this.pos.y + (vfx.rng() - 0.5) * 0.4, z: this.pos.z + (vfx.rng() - 0.5) * 0.4,
          vx: (vfx.rng() - 0.5) * 3, vy: (vfx.rng() - 0.5) * 3, vz: (vfx.rng() - 0.5) * 3,
          type: P.SOFT, colA: PALETTE.boostHot, colB: this.color, size0: this.radius * 2.2, size1: 0.2, life: 0.35 });
      }
      let hit = false;
      if (tgt && this.pos.distanceTo(tgt.pos) < (tgt.radius ?? 1.5) + this.radius) hit = true;
      if (hit || this.age > 2.5) {
        if (hit && this.onHit) this.onHit(tgt, this.pos);
        vfx.explode(this.pos, 3.2, { color: this.color, hot: PALETTE.boostHot });
        this.cancel();
      }
    }
  }
  dispose() { this.ball.geometry.dispose(); this.mat.dispose(); this.beam.geometry.dispose(); this.beamMat.dispose(); this.reticle.userData.mat.dispose(); }
}

// ---------- smart bomb ----------
const BOMB_VERT = /* glsl */ `
uniform float uTime; uniform float uU;
varying vec3 vN; varying vec3 vV; varying vec3 vP;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x), mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x), mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z); }
void main() {
  vP = position;
  // barely-there breathing: the silhouette must stay a perfect smooth sphere
  float n = noise(position * 2.5 + uTime * 1.5);
  vec3 p = position * (1.0 + 0.012 * (n - 0.5) * (1.0 + uU * 2.0));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * normal); vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;
const BOMB_FRAG = /* glsl */ `
precision highp float;
uniform float uTime; uniform float uU; uniform vec3 uColor; uniform vec3 uHot; uniform float uNear; uniform float uInner;
varying vec3 vN; varying vec3 vV; varying vec3 vP;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x), mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x), mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z); }
void main() {
  vec3 n = normalize(vN), v = normalize(vV);
  float facing = abs(dot(n, v));
  // fresnel shell whose peak sits just INSIDE the silhouette and falls back to
  // zero at the geometric edge, so the sphere never shows a hard polygon rim.
  float soft = smoothstep(0.0, 0.16, facing);
  float rim = pow(1.0 - facing, 3.2) * soft;
  float rim2 = pow(1.0 - facing, 1.4) * soft;
  // energy surface: flowing plasma cells + fine latitude scan bands
  float cells = noise(vP * 3.0 + vec3(uTime * 0.7, -uTime * 0.4, 0.0)) * 0.6 + noise(vP * 7.0 - vec3(0.0, uTime * 1.6, uTime * 0.9)) * 0.4;
  float web = smoothstep(0.48, 0.66, cells);
  float bands = 0.5 + 0.5 * sin(vP.y * 60.0 - uTime * 14.0);
  bands = smoothstep(0.55, 0.95, bands) * 0.15;
  // life: snap bright on (first 12%) then decay; inner shell lags
  float on = smoothstep(0.0, 0.08, uU);
  float fade = (1.0 - smoothstep(0.35, 1.0, uU)) * on;
  float back = gl_FrontFacing ? 1.0 : 0.2;
  vec3 col = uColor * (rim2 * 0.14 + web * (0.012 + 0.14 * rim2) + bands * rim2 * 0.4) + mix(uColor, uHot, 0.3) * pow(rim, 1.8) * 0.4;
  col = mix(col, col * vec3(0.7, 0.55, 1.0), uInner);        // inner shell leans violet
  // when the camera is close to / inside the shell the fresnel rim covers the whole disc: thin it out
  gl_FragColor = vec4(col * fade * uNear * back, 0.0);
}
`;

class Bomb {
  constructor(vfx) {
    this.vfx = vfx; this.active = false; this.u = 0; this.dur = 2.2; this.maxR = 40;
    const mkMat = (inner) => new THREE.ShaderMaterial({
      vertexShader: BOMB_VERT, fragmentShader: BOMB_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      uniforms: { uTime: { value: 0 }, uU: { value: 0 }, uColor: { value: PALETTE.bomb }, uHot: { value: PALETTE.boostHot }, uNear: { value: 1 }, uInner: { value: inner } },
    });
    this.mat = mkMat(0); this.matInner = mkMat(1);
    const geo = new THREE.SphereGeometry(1, 160, 112);   // dense: the silhouette must read as a perfect circle
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.inner = new THREE.Mesh(geo, this.matInner);
    this.mesh.add(this.inner);
    this.mesh.visible = false; this.mesh.renderOrder = 15; this.mesh.frustumCulled = false; this.inner.frustumCulled = false; this.inner.renderOrder = 15;
    this.center = V(); this.radius = 0; this.time = 0;
  }
  fire(pos, o = {}) {
    this.active = true; this.u = 0; this.center.copy(pos); this.maxR = o.radius ?? 40; this.dur = o.duration ?? 2.2;
    this.mesh.visible = true; this.mesh.position.copy(pos);
    const vfx = this.vfx;
    // crisp nova: a short hard white pop, then thin cyan shock rings; no big soft fills
    vfx.particles.spawn({ x: pos.x, y: pos.y, z: pos.z, type: P.FLASH, colA: PALETTE.bomb, size0: 3, size1: this.maxR * 0.3, life: 0.12 });
    vfx.particles.spawn({ x: pos.x, y: pos.y, z: pos.z, type: P.RING, colA: PALETTE.charge, colB: new THREE.Color(0.25, 0.45, 1.0), size0: 2, size1: this.maxR * 2.4, life: 1.1, rot: 0.28 });
    vfx.particles.spawn({ x: pos.x, y: pos.y, z: pos.z, type: P.RING, colA: PALETTE.charge, colB: new THREE.Color(0.5, 0.3, 1.0), size0: 1, size1: this.maxR * 2.0, life: 1.5, delay: 0.12, rot: 0.2 });
    for (let i = 0; i < 44; i++) {
      _a.set(vfx.rng() - 0.5, vfx.rng() - 0.5, vfx.rng() - 0.5).normalize();
      _b.copy(_a).multiplyScalar(this.maxR * (0.5 + vfx.rng() * 0.6) / 1.2);
      _a.multiplyScalar(2 + vfx.rng() * 5);     // born on a shell, not a point: never a central blob
      vfx.particles.spawn({ x: pos.x + _a.x, y: pos.y + _a.y, z: pos.z + _a.z, vx: _b.x, vy: _b.y, vz: _b.z, type: P.SPARK, colA: PALETTE.boostHot, colB: PALETTE.bomb,
        size0: 0.3, size1: 0.08, life: 1.0 + vfx.rng() * 0.6, drag: 0.6, delay: vfx.rng() * 0.35 });
    }
    vfx.shake(1.0); vfx.hitStop(0.12); vfx.flashLight(pos, PALETTE.bomb, 10, this.maxR * 3); vfx.flashAmount = Math.max(vfx.flashAmount, 0.08);
  }
  update(dt, camera) {
    this.time += dt; this.mat.uniforms.uTime.value = this.time;
    if (!this.active) return;
    if (camera) {
      const rel = camera.position.distanceTo(this.center) / Math.max(0.01, this.radius);
      const nearV = 0.12 + 0.88 * THREE.MathUtils.smoothstep(rel, 1.0, 2.2);
      this.mat.uniforms.uNear.value = nearV; this.matInner.uniforms.uNear.value = nearV;
    }
    this.u = Math.min(1, this.u + dt / this.dur);
    const e = 1 - Math.pow(1 - this.u, 3);
    this.radius = this.maxR * (e * 1.06 - 0.06 * Math.sin(this.u * Math.PI)); // slight overshoot & settle
    this.mesh.scale.setScalar(Math.max(0.01, this.radius));
    // inner shell lags behind the front and lingers a touch longer
    const ui = Math.max(0, this.u - 0.08) / 0.92, ei = 1 - Math.pow(1 - ui, 3);
    this.inner.scale.setScalar(Math.max(0.01, 0.06 + 0.78 * ei));
    this.mat.uniforms.uU.value = this.u; this.matInner.uniforms.uU.value = Math.min(1, ui);
    this.matInner.uniforms.uTime.value = this.time;
    if (this.u >= 1) { this.active = false; this.mesh.visible = false; this.radius = 0; }
  }
  dispose() { this.mesh.geometry.dispose(); this.mat.dispose(); this.matInner.dispose(); }
}

// ---------- main ----------
export function createVfx(ctx, opts = {}) {
  const { scene } = ctx;
  const rngObj = ctx.rng;
  const rng = () => rngObj.next();
  const particles = new ParticleSystem(opts.particles ?? 6000);
  const debris = new DebrisSystem(opts.debris ?? 400);
  const lasers = new LaserSystem(opts.lasers ?? 128);
  // NOTE: this light stays mounted + visible (intensity 0) forever. Toggling a
  // light's visibility changes the scene light count, which forces EVERY lit
  // material to recompile a new program variant mid-play (a huge hitch).
  const light = new THREE.PointLight(0xffffff, 0, 60, 1.6);
  const group = new THREE.Group(); group.name = 'vfx';
  group.add(particles.mesh, debris.mesh, lasers.group, light);
  scene.add(group);
  const trails = [];

  const vfx = {
    particles, debris, lasers, group, rng, PALETTE,
    timeScale: 1, trauma: 0, hitStopT: 0, time: 0,
    shakeOffset: V(), shakeRoll: 0,
    /** 0..1 full-screen white flash request (decays each frame); feed to a grade pass. */
    flashAmount: 0,
    _lightT: 0, _lightPeak: 0,

    // --- weapons
    laser(pos, dir, o = {}) {
      const color = o.color ?? PALETTE.playerLaser;
      const b = lasers.fire({ pos, dir, color, speed: o.speed ?? 190, life: o.life ?? 1.4, scale: o.scale ?? 1, stretch: o.stretch, owner: o.owner, damage: o.damage, homing: o.homing, turn: o.turn });
      if (o.flash !== false) this.muzzleFlash(pos, dir, color, o.scale ?? 1);
      return b;
    },
    twinLaser(left, right, dir, o = {}) { return [this.laser(left, dir, o), this.laser(right, dir, o)]; },

    muzzleFlash(pos, dir, color, scale = 1) {
      particles.spawn({ x: pos.x, y: pos.y, z: pos.z, type: P.FLASH, colA: color, size0: 0.3 * scale, size1: 0.8 * scale, life: 0.08, rot: rng() * 6.28 });
      particles.spawn({ x: pos.x, y: pos.y, z: pos.z, type: P.SOFT, colA: color, colB: color, size0: 0.6 * scale, size1: 0.2 * scale, life: 0.1 });
      for (let i = 0; i < 3; i++) {
        _a.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(5).addScaledVector(dir, 12);
        particles.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: _a.x, vy: _a.y, vz: _a.z, type: P.SPARK, colA: WHITE, colB: color, size0: 0.12 * scale, size1: 0.02, life: 0.14, drag: 3 });
      }
    },

    hitSparks(pos, normal, o = {}) {
      const color = o.color ?? PALETTE.playerLaser;
      const hot = o.hot ?? WHITE;
      const s = o.scale ?? 1;
      particles.spawn({ x: pos.x, y: pos.y, z: pos.z, type: P.FLASH, colA: color, size0: 0.8 * s, size1: 2.4 * s, life: 0.14, rot: rng() * 6.28 });
      particles.spawn({ x: pos.x, y: pos.y, z: pos.z, type: P.SOFT, colA: hot, colB: color, size0: 2.0 * s, size1: 0.3 * s, life: 0.28 });
      particles.spawn({ x: pos.x, y: pos.y, z: pos.z, type: P.RING, colA: hot, colB: color, size0: 0.3 * s, size1: 3.0 * s, life: 0.32 });
      const n = o.count ?? 16;
      for (let i = 0; i < n; i++) {
        _a.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
        if (_a.dot(normal) < 0) _a.negate();
        _a.lerp(normal, 0.35).normalize().multiplyScalar((10 + rng() * 22) * s);
        particles.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: _a.x, vy: _a.y, vz: _a.z, type: P.SPARK, colA: hot, colB: color,
          size0: 0.32 * s, size1: 0.05, life: 0.35 + rng() * 0.35, drag: 2.5, gravity: 6 });
      }
      this.flashLight(pos, color, 6 * s, 14 * s);
    },

    explode(pos, size = 1, o = {}) {
      const hot = o.hot ?? PALETTE.fireHot, cool = o.color ?? PALETTE.fireCool;
      const sparkHot = _col.setRGB(1, 1, 1).lerp(hot, 0.45);
      // 1. core flash: brief, tinted, small. The fireball ramp carries the heat.
      //    (quiet = secondary/bomb kills: many stack in a few frames, so no additive core at all)
      if (!o.quiet) {
        particles.spawn({ x: pos.x, y: pos.y, z: pos.z, type: P.FLASH, colA: hot, size0: size * 2, size1: size * 6, life: 0.16, rot: rng() * 6.28 });
        particles.spawn({ x: pos.x, y: pos.y, z: pos.z, type: P.SOFT, colA: hot, colB: cool, size0: size * 3.2, size1: size * 1.2, life: 0.3 });
        // 2. ring shockwave(s)
        particles.spawn({ x: pos.x, y: pos.y, z: pos.z, type: P.RING, colA: hot, colB: cool, size0: size * 1, size1: size * 14, life: 0.42, rot: 0.55 });
      }
      particles.spawn({ x: pos.x, y: pos.y, z: pos.z, type: P.RING, colA: hot, colB: cool, size0: size * 0.5, size1: size * 8, life: 0.6, delay: 0.08, rot: 0.7 });
      // 3. fireball cluster (animated procedural noise sprites). Inner tight cluster
      //    stays hot longest; outer lobes are born cooler and turn to smoke sooner.
      const nFire = o.quiet ? Math.round(4 + size * 3) : Math.round(8 + size * 5);
      for (let i = 0; i < nFire; i++) {
        const outer = i >= nFire * 0.4;
        _a.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize().multiplyScalar(size * (outer ? 0.6 + rng() * 0.8 : 0.1 + rng() * 0.4));
        _b.copy(_a).normalize().multiplyScalar(size * (outer ? 4 + rng() * 6 : 1 + rng() * 3));
        particles.spawn({ x: pos.x + _a.x, y: pos.y + _a.y, z: pos.z + _a.z, vx: _b.x, vy: _b.y + size * 1.2, vz: _b.z,
          type: P.FIRE, colA: hot, colB: cool, size0: size * (0.8 + rng() * 0.9), size1: size * (outer ? 3.6 + rng() * 2.6 : 2.8 + rng() * 1.6),
          life: outer ? 0.65 + rng() * 0.45 : 0.9 + rng() * 0.5, drag: 2.2, rot: rng() * 6.28, rotVel: (rng() - 0.5) * 3, seed: rng(), delay: outer ? 0.04 + rng() * 0.08 : rng() * 0.03 });
      }
      // 4. smoke (lingers, lit side, soft alpha)
      const nSmoke = Math.round(6 + size * 4);
      for (let i = 0; i < nSmoke; i++) {
        _a.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize().multiplyScalar(size * (2 + rng() * 4));
        particles.spawn({ x: pos.x + _a.x * 0.15, y: pos.y + _a.y * 0.15, z: pos.z + _a.z * 0.15, vx: _a.x, vy: _a.y + size * 0.8, vz: _a.z, type: P.SMOKE,
          colA: PALETTE.smokeLit, colB: PALETTE.smokeDark, size0: size * 1.4, size1: size * (3.5 + rng() * 2.5), life: 1.5 + rng() * 1.1,
          drag: 1.5, rot: rng() * 6.28, rotVel: (rng() - 0.5) * 1.2, seed: rng(), delay: 0.1 + rng() * 0.25 });
      }
      // 5. embers / sparks
      const nSpark = Math.round(14 + size * 10);
      for (let i = 0; i < nSpark; i++) {
        _a.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize().multiplyScalar(size * (10 + rng() * 22));
        particles.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: _a.x, vy: _a.y, vz: _a.z, type: P.SPARK, colA: sparkHot, colB: cool,
          size0: size * 0.3, size1: 0.04, life: 0.5 + rng() * 0.9, drag: 1.4, gravity: 4 });
      }
      // 6. debris chunks (charred hull, glowing edges) + ember streak riding each chunk
      const nDeb = Math.round(5 + size * 4);
      for (let i = 0; i < nDeb; i++) {
        _a.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
        _b.copy(_a).multiplyScalar(size * (6 + rng() * 12));
        _c.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
        debris.spawn({ x: pos.x + _a.x * size * 0.3, y: pos.y + _a.y * size * 0.3, z: pos.z + _a.z * size * 0.3, vx: _b.x, vy: _b.y, vz: _b.z,
          ax: _c.x, ay: _c.y, az: _c.z, angVel: 4 + rng() * 10, scale: size * (0.16 + rng() * 0.26), life: 1.3 + rng() * 1.1,
          tint: o.debrisTint ?? PALETTE.debris });
        particles.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: _b.x * 0.95, vy: _b.y * 0.95, vz: _b.z * 0.95, type: P.EMBER, colA: hot, colB: cool,
          size0: size * 0.4, size1: 0.08, life: 0.5 + rng() * 0.5, drag: 0.35 });
      }
      if (o.quiet) return;                      // secondary kills: no camera/screen response
      this.flashLight(pos, _col2.copy(hot).lerp(cool, 0.4), 9 * size, 26 * size);
      this.shake(Math.min(1, 0.25 * size));
      if (o.flash !== false) this.flashAmount = Math.min(0.14, this.flashAmount + 0.015 * size);
      if (size >= 2) this.hitStop(0.05 + 0.02 * size);
    },

    bomb(pos, o) { bombFx.fire(pos, o); },
    get bombRadius() { return bombFx.active ? bombFx.radius : 0; },
    get bombCenter() { return bombFx.center; },

    trail(o) { const t = new BoostTrail(o); trails.push(t); group.add(t.group); return t; },

    // --- feel
    shake(strength) { this.trauma = Math.min(1.2, this.trauma + strength); },
    hitStop(sec) { this.hitStopT = Math.max(this.hitStopT, sec); },
    flashLight(pos, color, intensity, dist) {
      light.position.copy(pos); light.color.copy(color); light.intensity = intensity; light.distance = dist;
      this._lightT = 0; this._lightPeak = intensity;
    },
    /** Add shake offset to a camera whose base pose was just set this frame. */
    applyShake(camera) {
      camera.position.add(this.shakeOffset);
      camera.rotateZ(this.shakeRoll);
    },

    update(dt, camera) {
      // hit-stop: everything owned by vfx slows to a crawl
      if (this.hitStopT > 0) { this.hitStopT -= dt; this.timeScale = 0.08; } else this.timeScale = 1;
      const sdt = dt * this.timeScale;
      this.time += sdt;
      particles.update(sdt); debris.update(sdt, camera);
      lasers.update(sdt, opts.hitTest);
      charge.update(sdt, camera); bombFx.update(sdt, camera);
      // light decay (intensity only — visibility must never toggle, see above)
      if (this._lightPeak > 0) { this._lightT += dt; light.intensity = this._lightPeak * Math.exp(-this._lightT * 7) * (0.8 + 0.2 * Math.sin(this._lightT * 70)); if (light.intensity < 0.05) { light.intensity = 0; this._lightPeak = 0; } }
      // trauma-based shake (real time, not hit-stopped)
      this.trauma = Math.max(0, this.trauma - dt * 1.6);
      this.flashAmount = Math.max(0, this.flashAmount - dt * 3.5);
      const s = this.trauma * this.trauma;
      const t = this.time * 1 + performance.now() * 0.001 * 0; // deterministic in fixed mode
      const T = this._shakeClock = (this._shakeClock ?? 0) + dt * 30;
      const n1 = Math.sin(T * 1.3) * 0.6 + Math.sin(T * 2.7 + 1.0) * 0.4;
      const n2 = Math.sin(T * 1.7 + 2.0) * 0.6 + Math.sin(T * 3.1 + 0.5) * 0.4;
      const n3 = Math.sin(T * 1.1 + 4.0) * 0.6 + Math.sin(T * 2.3 + 3.0) * 0.4;
      this.shakeOffset.set(n1, n2, 0).multiplyScalar(0.9 * s);
      this.shakeRoll = n3 * 0.06 * s;
      void t;
    },
    dispose() {
      group.removeFromParent();   // may be mounted under a parked warm group reparented at activate
      particles.dispose(); debris.dispose(); lasers.dispose(); charge.dispose(); bombFx.dispose();
      for (const t of trails) t.dispose();
    },
  };
  const charge = new ChargeShot(vfx); group.add(charge.group);
  const bombFx = new Bomb(vfx); group.add(bombFx.mesh);
  vfx.charge = charge;
  vfx.setSun = (dir) => debris.setSun(dir);
  return vfx;
}
