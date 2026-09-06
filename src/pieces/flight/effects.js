// Feel VFX: laser bolts, muzzle flash, speed streaks, barrel-roll sparkle,
// reticle, boost flame, boost/grade post pass.
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const NOISE_GLSL = /* glsl */ `
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
  float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
`;

/* ---------------- laser bolts: fat hot core + soft additive sheath + head flare ---------------- */
export class Lasers {
  constructor(scene, count = 32) {
    this.pool = [];
    const core = new THREE.CapsuleGeometry(0.28, 7.4, 4, 10);
    core.rotateX(Math.PI / 2);
    const sheath = new THREE.CapsuleGeometry(0.85, 7.8, 4, 12);
    sheath.rotateX(Math.PI / 2);
    // white-hot core, slightly green (HDR values so bloom picks it up cleanly)
    this.coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 4.2, 2.2), toneMapped: false });
    // sheath: soft edge via view-facing falloff so the bolt reads as a glowing rod, not a tube
    this.sheathMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
      uniforms: { uCol: { value: new THREE.Color(0.3, 2.0, 0.55) } },
      vertexShader: `varying float vF; varying float vZ;
        void main(){ vec3 n = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0);
          vF = pow(max(dot(n, normalize(-mv.xyz)), 0.0), 1.6); vZ = position.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uCol; varying float vF; varying float vZ;
        void main(){ float tail = smoothstep(-3.2, 0.6, -vZ); gl_FragColor = vec4(uCol * vF * (0.55 + 0.45 * tail), vF * 0.9); }`,
    });
    // head flare billboard
    this.flareMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 3.0, 1.2), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, map: softDiscTexture() });
    const flareGeo = new THREE.PlaneGeometry(2.6, 2.6);
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(core, this.coreMat));
      g.add(new THREE.Mesh(sheath, this.sheathMat));
      const fl = new THREE.Mesh(flareGeo, this.flareMat); fl.position.z = -3.7; fl.name = 'flare'; g.add(fl);
      g.visible = false;
      g.userData = { vel: new THREE.Vector3(), life: 0, flare: fl };
      scene.add(g);
      this.pool.push(g);
    }
    this._q = new THREE.Quaternion();
  }
  fire(origin, dir, speed = 520) {
    const b = this.pool.find((p) => !p.visible);
    if (!b) return;
    b.visible = true;
    b.position.copy(origin);
    b.userData.vel.copy(dir).multiplyScalar(speed);
    b.userData.life = 1.0;
    b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir.clone().normalize());
    b.scale.setScalar(0.4);
  }
  update(dt, camera) {
    for (const b of this.pool) {
      if (!b.visible) continue;
      b.userData.life -= dt;
      if (b.userData.life <= 0) { b.visible = false; continue; }
      b.position.addScaledVector(b.userData.vel, dt);
      // bolt stretches to full length over the first frames (feels like it leaves the barrel)
      const s = Math.min(1, b.scale.x + dt * 9);
      b.scale.set(1, 1, s);
      const fl = b.userData.flare;
      fl.quaternion.copy(camera.quaternion); b.getWorldQuaternion(this._q).invert(); fl.quaternion.premultiply(this._q);
    }
  }
}

function softDiscTexture() {
  const S = 64, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/* ---------------- muzzle flashes: two additive billboards at the cannon tips ---------------- */
export class MuzzleFlash {
  constructor(parent, positions) {
    this.mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 3.2, 1.4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, map: softDiscTexture() });
    this.meshes = positions.map((p) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat); m.position.copy(p); m.renderOrder = 20; parent.add(m); return m; });
    this.a = 0; this._q = new THREE.Quaternion();
  }
  kick() { this.a = 1; }
  update(dt, camera) {
    this.a = Math.max(0, this.a - dt * 16);
    this.mat.opacity = this.a;
    for (const m of this.meshes) {
      m.scale.setScalar(1.2 + (1 - this.a) * 1.4);
      m.quaternion.copy(camera.quaternion); m.parent.getWorldQuaternion(this._q).invert(); m.quaternion.premultiply(this._q);
    }
  }
}

/* ---------------- speed streaks: camera-attached tapered quads (not hairlines) ---------------- */
export class SpeedLines {
  constructor(camera, rng, count = 80) {
    this.count = count;
    const pos = new Float32Array(count * 12);
    const col = new Float32Array(count * 16);
    const idx = new Uint16Array(count * 6);
    for (let i = 0; i < count; i++) { const b = i * 4, o = i * 6; idx[o] = b; idx[o + 1] = b + 1; idx[o + 2] = b + 2; idx[o + 3] = b; idx[o + 4] = b + 2; idx[o + 5] = b + 3; }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.lines = new THREE.Mesh(this.geo, this.mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 50;
    camera.add(this.lines);
    this.p = [];
    for (let i = 0; i < count; i++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(2.5, 9);
      this.p.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, z: -rng.range(5, 60), len: rng.range(4, 12), w: rng.range(0.6, 1.4), rng });
    }
    this.amount = 0;
  }
  update(dt, amount, speed) {
    this.amount += (amount - this.amount) * Math.min(1, dt * 8);
    const A = this.amount;
    this.lines.visible = A > 0.01;
    const P = this.geo.attributes.position.array, C = this.geo.attributes.color.array;
    for (let i = 0; i < this.count; i++) {
      const s = this.p[i];
      s.z += speed * dt * 1.6;
      if (s.z > -3) { s.z = -60 - s.rng.range(0, 25); const a = s.rng.range(0, Math.PI * 2), r = s.rng.range(2.5, 9); s.x = Math.cos(a) * r; s.y = Math.sin(a) * r; }
      const L = s.len * (0.3 + A * 1.2);
      const r = Math.hypot(s.x, s.y) || 1;
      const px = -s.y / r, py = s.x / r; // screen-perpendicular
      const wHead = 0.012 * -s.z * s.w, wTail = 0.045 * -(s.z + L) * s.w * 0.5;
      const o = i * 12, c = i * 16;
      // head (near camera, thin & bright) -> tail (far, wider & faint)
      P[o] = s.x + px * wHead; P[o + 1] = s.y + py * wHead; P[o + 2] = s.z;
      P[o + 3] = s.x - px * wHead; P[o + 4] = s.y - py * wHead; P[o + 5] = s.z;
      P[o + 6] = s.x - px * wTail; P[o + 7] = s.y - py * wTail; P[o + 8] = s.z - L;
      P[o + 9] = s.x + px * wTail; P[o + 10] = s.y + py * wTail; P[o + 11] = s.z - L;
      const ah = A * 0.38, at = 0;
      C[c] = 0.85; C[c + 1] = 0.95; C[c + 2] = 1.0; C[c + 3] = ah;
      C[c + 4] = 0.85; C[c + 5] = 0.95; C[c + 6] = 1.0; C[c + 7] = ah;
      C[c + 8] = 0.6; C[c + 9] = 0.8; C[c + 10] = 1.0; C[c + 11] = at;
      C[c + 12] = 0.6; C[c + 13] = 0.8; C[c + 14] = 1.0; C[c + 15] = at;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

/* ---------------- barrel-roll sparkle ring (stays outside the hull so the ship reads through it) ---------------- */
export class Sparkle {
  constructor(parent, rng, count = 160) {
    this.count = count;
    this.rng = rng;
    const pos = new Float32Array(count * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.mat = new THREE.PointsMaterial({ color: new THREE.Color(0.6, 1.4, 2.0), size: 0.32, map: softDiscTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, toneMapped: false });
    this.pts = new THREE.Points(this.geo, this.mat);
    this.pts.frustumCulled = false;
    parent.add(this.pts);
    this.parts = [];
    for (let i = 0; i < count; i++) this.parts.push({ a: rng.range(0, Math.PI * 2), r: rng.range(3.4, 4.4), z: rng.range(-2.5, 2.5), w: rng.range(4, 9), off: rng.range(0, 1) });
    this.t = 0;
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(4.1, 0.08, 8, 72), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 1.6, 2.4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    parent.add(this.ring);
    this.ring2 = new THREE.Mesh(new THREE.TorusGeometry(4.1, 0.035, 6, 72), this.ring.material);
    parent.add(this.ring2);
  }
  /** amount: 0..1 roll progress, active bool */
  update(dt, active, progress) {
    this.t += dt;
    const target = active ? 1 : 0;
    this.mat.opacity += (target - this.mat.opacity) * Math.min(1, dt * (active ? 18 : 6));
    this.ring.material.opacity = this.mat.opacity * 0.4 * (0.6 + 0.4 * Math.sin(progress * Math.PI));
    this.ring.scale.setScalar(0.9 + 0.2 * Math.sin(progress * Math.PI));
    this.ring2.scale.setScalar(1.08 - 0.15 * Math.sin(progress * Math.PI));
    this.ring.rotation.z = progress * Math.PI * 2; this.ring2.rotation.z = -progress * Math.PI * 2;
    this.ring.rotation.x = this.ring2.rotation.x = Math.sin(progress * Math.PI) * 0.4;
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

/* ---------------- boost flame: long additive blue-white plume with animated noise ---------------- */
export class BoostFlame {
  constructor(parent, pos, scale = 1) {
    const geo = new THREE.LatheGeometry([
      new THREE.Vector2(0.30, 0), new THREE.Vector2(0.42, 0.5), new THREE.Vector2(0.40, 1.5), new THREE.Vector2(0.28, 3.2), new THREE.Vector2(0.10, 5.4), new THREE.Vector2(0.0, 6.5),
    ].map((v) => v.multiplyScalar(scale)), 32);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uAmt: { value: 0 } },
      vertexShader: `varying vec2 vUv; varying float vF; void main(){ vUv = uv; vec3 n = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0);
        vF = abs(dot(n, normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uTime, uAmt; varying vec2 vUv; varying float vF; ${NOISE_GLSL}
        void main(){
          float y = vUv.y; // 0 at nozzle -> 1 at tip
          float n = noise(vec2(vUv.x * 6.0, y * 5.0 - uTime * 14.0)) * 0.6 + noise(vec2(vUv.x * 13.0 + 3.0, y * 9.0 - uTime * 22.0)) * 0.4;
          float body = (1.0 - smoothstep(0.15, 1.0, y)) * smoothstep(0.0, 0.08, y);
          float a = body * (0.55 + 0.6 * n) * pow(vF, 0.7) * uAmt;
          vec3 core = vec3(0.85, 0.95, 1.0), edge = vec3(0.2, 0.45, 1.0);
          vec3 col = mix(edge, core, pow(1.0 - y, 1.5) * (0.5 + 0.5 * n)) * (1.2 + 0.8 * (1.0 - y));
          gl_FragColor = vec4(col * a * 1.6, a);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.rotation.x = -Math.PI / 2; // lathe +y -> +z (tail)
    this.mesh.position.copy(pos);
    this.mesh.renderOrder = 9;
    this.mesh.visible = false;
    parent.add(this.mesh);
  }
  update(dt, t, amt) {
    this.mat.uniforms.uTime.value = t;
    this.mat.uniforms.uAmt.value = amt;
    this.mesh.visible = amt > 0.02;
    const flick = 1 + Math.sin(t * 43) * 0.05;
    this.mesh.scale.set(0.6 + amt * 0.5, 0.25 + amt * 0.9 * flick, 0.6 + amt * 0.5);
  }
}

/* ---------------- reticle: near ring + far crosshair ---------------- */
export class Reticle {
  constructor(scene) {
    const mat = (c, o = 0.95) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const geos = [];
    const bar = (w, h, x, y, rz = 0) => { const g = new THREE.PlaneGeometry(w, h); g.rotateZ(rz); g.translate(x, y, 0); geos.push(g); return g; };
    // near: four chunky corner brackets (a rotated diamond)
    const s = 2.4, L = 1.1, T = 0.24;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      bar(L, T, sx * (s - L / 2), sy * s); bar(T, L, sx * s, sy * (s - L / 2));
    }
    this.near = new THREE.Mesh(mergeGeometries(geos), mat(new THREE.Color(0.55, 1.4, 1.5)));
    geos.length = 0;
    // far: crosshair ticks + thin ring
    const tk = 1.0, tt = 0.18;
    bar(tk, tt, -1.7, 0); bar(tk, tt, 1.7, 0); bar(tt, tk, 0, -1.7); bar(tt, tk, 0, 1.7);
    geos.push(new THREE.RingGeometry(1.05, 1.24, 40));
    this.far = new THREE.Mesh(mergeGeometries(geos), mat(new THREE.Color(0.5, 1.5, 0.65)));
    this.dot = new THREE.Mesh(new THREE.CircleGeometry(0.2, 12), mat(0xffffff, 1));
    // dark under-stroke so it reads over bright sky/water
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x06202a, transparent: true, opacity: 0.45, depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    this.nearS = new THREE.Mesh(this.near.geometry, shadowMat); this.farS = new THREE.Mesh(this.far.geometry, shadowMat);
    this.nearS.renderOrder = this.farS.renderOrder = 59;
    this.near.renderOrder = this.far.renderOrder = this.dot.renderOrder = 60;
    for (const o of [this.near, this.far, this.dot, this.nearS, this.farS]) o.frustumCulled = false;
    scene.add(this.nearS, this.farS, this.near, this.far, this.dot);
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
    this.nearS.position.copy(n); this.nearS.quaternion.copy(this.near.quaternion); this.nearS.scale.copy(this.near.scale).multiplyScalar(1.12);
    this.farS.position.copy(f); this.farS.quaternion.copy(this.far.quaternion); this.farS.scale.copy(this.far.scale).multiplyScalar(1.12);
  }
  dispose() { for (const o of [this.near, this.far, this.dot, this.nearS, this.farS]) { o.geometry.dispose(); o.material.dispose(); o.removeFromParent(); } }
}

/* ---------------- boost / grade / vignette / chroma pass ---------------- */
export function makeGradePass() {
  return new ShaderPass({
    uniforms: { tDiffuse: { value: null }, vignette: { value: 0.32 }, boost: { value: 0 }, flash: { value: 0 }, time: { value: 0 }, grade: { value: 1 }, aspect: { value: 1.78 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float vignette, boost, flash, time, grade, aspect; varying vec2 vUv;
      float hash(float p){ return fract(sin(p * 127.1) * 43758.5453); }
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
          // screen-space radial speed streaks (seamless: one streak per angular cell)
          vec2 ca2 = c * vec2(aspect, 1.0);
          float ang = atan(ca2.y, ca2.x); float rr = length(ca2);
          float k = (ang + 3.14159265) / 6.2831853 * 56.0;
          float cell = floor(k), fr = fract(k) - 0.5;
          float id = hash(cell);
          float line = smoothstep(0.16 + id * 0.1, 0.0, abs(fr));
          float mv = fract(rr * (1.6 + id * 1.2) - time * (3.0 + id * 2.0) + id * 7.0);
          float seg = smoothstep(0.0, 0.35, mv) * smoothstep(1.0, 0.55, mv);
          float streak = line * seg * smoothstep(0.22, 0.6, rr) * step(0.25, id) * boost;
          col += vec3(0.75, 0.9, 1.0) * streak * 0.18;
        }
        // warm/cool grade: lift shadows toward teal, highlights toward warm (only when lookdev grade is absent)
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
