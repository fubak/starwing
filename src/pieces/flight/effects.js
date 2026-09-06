// Feel VFX: laser bolts, speed lines, barrel-roll sparkle, reticle, grade pass.
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ---------------- laser bolts ---------------- */
export class Lasers {
  constructor(scene, count = 24) {
    this.pool = [];
    const core = new THREE.CapsuleGeometry(0.16, 4.5, 4, 8);
    core.rotateX(Math.PI / 2);
    const halo = new THREE.CapsuleGeometry(0.45, 4.8, 4, 8);
    halo.rotateX(Math.PI / 2);
    this.coreMat = new THREE.MeshBasicMaterial({ color: 0xeaffb0, toneMapped: false });
    this.haloMat = new THREE.MeshBasicMaterial({ color: 0x3cff5a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(core, this.coreMat));
      g.add(new THREE.Mesh(halo, this.haloMat));
      g.visible = false;
      g.userData = { vel: new THREE.Vector3(), life: 0 };
      scene.add(g);
      this.pool.push(g);
    }
    this.muzzles = [];
  }
  fire(origin, dir, speed = 420) {
    const b = this.pool.find((p) => !p.visible);
    if (!b) return;
    b.visible = true;
    b.position.copy(origin);
    b.userData.vel.copy(dir).multiplyScalar(speed);
    b.userData.life = 1.1;
    b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize());
  }
  update(dt) {
    for (const b of this.pool) {
      if (!b.visible) continue;
      b.userData.life -= dt;
      if (b.userData.life <= 0) { b.visible = false; continue; }
      b.position.addScaledVector(b.userData.vel, dt);
    }
  }
}

/* ---------------- speed lines (camera-attached streaks) ---------------- */
export class SpeedLines {
  constructor(camera, rng, count = 90) {
    this.count = count;
    const pos = new Float32Array(count * 6);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false });
    this.lines = new THREE.LineSegments(this.geo, this.mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 50;
    camera.add(this.lines);
    this.p = [];
    for (let i = 0; i < count; i++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(3, 9);
      this.p.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, z: -rng.range(5, 60), len: rng.range(3, 9), rng });
    }
    this.amount = 0;
  }
  update(dt, amount, speed) {
    this.amount += (amount - this.amount) * Math.min(1, dt * 8);
    this.mat.opacity = this.amount * 0.55;
    const arr = this.geo.attributes.position.array;
    for (let i = 0; i < this.count; i++) {
      const s = this.p[i];
      s.z += speed * dt * 1.5;
      if (s.z > -3) { s.z = -60 - s.rng.range(0, 20); const a = s.rng.range(0, Math.PI * 2), r = s.rng.range(3, 9); s.x = Math.cos(a) * r; s.y = Math.sin(a) * r; }
      const L = s.len * (0.4 + this.amount);
      arr[i * 6 + 0] = s.x; arr[i * 6 + 1] = s.y; arr[i * 6 + 2] = s.z;
      arr[i * 6 + 3] = s.x; arr[i * 6 + 4] = s.y; arr[i * 6 + 5] = s.z + L;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}

/* ---------------- barrel-roll sparkle ring ---------------- */
export class Sparkle {
  constructor(parent, rng, count = 140) {
    this.count = count;
    this.rng = rng;
    const pos = new Float32Array(count * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.mat = new THREE.PointsMaterial({ color: 0x9ff2ff, size: 0.42, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, toneMapped: false });
    this.pts = new THREE.Points(this.geo, this.mat);
    this.pts.frustumCulled = false;
    parent.add(this.pts);
    this.parts = [];
    for (let i = 0; i < count; i++) this.parts.push({ a: rng.range(0, Math.PI * 2), r: rng.range(3.2, 5.0), z: rng.range(-3, 3), w: rng.range(4, 9), off: rng.range(0, 1) });
    this.t = 0;
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(4.8, 0.09, 8, 64), new THREE.MeshBasicMaterial({ color: 0x8fe0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    parent.add(this.ring);
  }
  /** amount: 0..1 roll progress, active bool */
  update(dt, active, progress) {
    this.t += dt;
    const target = active ? 1 : 0;
    this.mat.opacity += (target - this.mat.opacity) * Math.min(1, dt * (active ? 18 : 6));
    this.ring.material.opacity = this.mat.opacity * 0.6 * (0.6 + 0.4 * Math.sin(progress * Math.PI));
    this.ring.scale.setScalar(0.85 + 0.35 * Math.sin(progress * Math.PI));
    this.ring.rotation.z = progress * Math.PI * 2;
    const arr = this.geo.attributes.position.array;
    for (let i = 0; i < this.count; i++) {
      const p = this.parts[i];
      const a = p.a + this.t * p.w + progress * 6.283;
      const r = p.r * (0.9 + 0.3 * Math.sin(progress * Math.PI + p.off * 6.283));
      arr[i * 3] = Math.cos(a) * r; arr[i * 3 + 1] = Math.sin(a) * r; arr[i * 3 + 2] = p.z + Math.sin(this.t * 3 + p.off * 6) * 0.6;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}

/* ---------------- reticle: near ring + far crosshair ---------------- */
export class Reticle {
  constructor(scene) {
    const mat = (c, o = 0.95) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const geos = [];
    const bar = (w, h, x, y, rz = 0) => { const g = new THREE.PlaneGeometry(w, h); g.rotateZ(rz); g.translate(x, y, 0); geos.push(g); return g; };
    // near: four chunky corner brackets (a rotated diamond)
    const s = 2.4, L = 1.1, T = 0.22;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      bar(L, T, sx * (s - L / 2), sy * s); bar(T, L, sx * s, sy * (s - L / 2));
    }
    this.near = new THREE.Mesh(mergeGeometries(geos), mat(0x7ef9ff));
    geos.length = 0;
    // far: crosshair ticks + thin ring
    const tk = 1.0, tt = 0.16;
    bar(tk, tt, -1.7, 0); bar(tk, tt, 1.7, 0); bar(tt, tk, 0, -1.7); bar(tt, tk, 0, 1.7);
    geos.push(new THREE.RingGeometry(1.05, 1.22, 40));
    this.far = new THREE.Mesh(mergeGeometries(geos), mat(0x6cff8a));
    this.dot = new THREE.Mesh(new THREE.CircleGeometry(0.2, 12), mat(0xffffff, 1));
    this.near.renderOrder = this.far.renderOrder = this.dot.renderOrder = 60;
    this.near.frustumCulled = this.far.frustumCulled = this.dot.frustumCulled = false;
    scene.add(this.near, this.far, this.dot);
    this.pulse = 0;
  }
  update(shipPos, aimDir, camera, dt, firing) {
    this.pulse = Math.max(0, this.pulse - dt * 6);
    if (firing) this.pulse = 1;
    const n = shipPos.clone().addScaledVector(aimDir, 30);
    const f = shipPos.clone().addScaledVector(aimDir, 95);
    this.near.position.copy(n); this.far.position.copy(f); this.dot.position.copy(f);
    this.near.quaternion.copy(camera.quaternion); this.far.quaternion.copy(camera.quaternion); this.dot.quaternion.copy(camera.quaternion);
    this.near.rotateZ(Math.PI / 4);
    // keep apparent size constant on screen regardless of distance / FOV
    const k = Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5) / Math.tan(THREE.MathUtils.degToRad(31));
    const dn = camera.position.distanceTo(n) / 30 * k, df = camera.position.distanceTo(f) / 30 * k;
    this.near.scale.setScalar(dn * (1 + this.pulse * 0.12));
    this.far.scale.setScalar(df * 1.25); this.dot.scale.setScalar(df * 1.25);
  }
  dispose() { for (const o of [this.near, this.far, this.dot]) { o.geometry.dispose(); o.material.dispose(); o.removeFromParent(); } }
}

/* ---------------- grade / vignette / chroma pass ---------------- */
export function makeGradePass() {
  return new ShaderPass({
    uniforms: { tDiffuse: { value: null }, vignette: { value: 0.32 }, boost: { value: 0 }, flash: { value: 0 }, time: { value: 0 }, grade: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float vignette, boost, flash, time, grade; varying vec2 vUv;
      void main(){
        vec2 uv = vUv; vec2 c = uv - 0.5;
        float r2 = dot(c, c);
        // radial chromatic aberration scales with boost
        float ca = (0.001 + boost * 0.0035) * r2 * 8.0;
        vec3 col;
        col.r = texture2D(tDiffuse, uv + c * ca).r;
        col.g = texture2D(tDiffuse, uv).g;
        col.b = texture2D(tDiffuse, uv - c * ca).b;
        // gentle radial blur when boosting (4 taps)
        if (boost > 0.01) {
          vec3 acc = col; float w = 1.0;
          for (int i = 1; i <= 4; i++) { float k = float(i) * 0.0055 * boost * smoothstep(0.05, 0.4, r2); acc += texture2D(tDiffuse, uv - c * k).rgb; w += 1.0; }
          col = acc / w;
        }
        // warm/cool grade: lift shadows toward teal, highlights toward warm
        if (grade > 0.5) {
          float lum = dot(col, vec3(0.299, 0.587, 0.114));
          col = mix(col, col * vec3(0.92, 1.0, 1.08) + vec3(0.0, 0.01, 0.025), 1.0 - smoothstep(0.0, 0.5, lum));
          col = mix(col, col * vec3(1.06, 1.0, 0.94), smoothstep(0.5, 1.0, lum));
          col = (col - 0.5) * 1.06 + 0.5;
          col *= 1.0 - vignette * smoothstep(0.15, 0.85, r2 * 2.0);
        }
        // boost: darken edges a touch more so the centre pops
        col *= 1.0 - boost * 0.25 * smoothstep(0.2, 0.9, r2 * 2.0);
        col += flash * vec3(0.9, 0.95, 1.0);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}
