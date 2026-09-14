// Laser bolts: capsule core (white-hot) + additive glow shell + additive
// gradient trail. All bolts of all colours share three instanced draws.
import * as THREE from 'three';

const GLOW_VERT = /* glsl */ `
attribute vec3 iColor;
varying vec3 vColor;
varying float vFacing;
varying float vAxis;
void main() {
  vColor = iColor;
  vAxis = position.y;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  vFacing = max(dot(n, normalize(-mv.xyz)), 0.0);
  gl_Position = projectionMatrix * mv;
}
`;
const GLOW_FRAG = /* glsl */ `
precision highp float;
uniform float uHalf;     // half length of local capsule (for axial gradient)
uniform float uTail;     // 0: symmetric glow, 1: trail (fade towards -y)
uniform float uGain;
varying vec3 vColor;
varying float vFacing;
varying float vAxis;
void main() {
  float g = pow(vFacing, 2.2);
  float t = (vAxis + uHalf) / (2.0 * uHalf);   // 0 at tail, 1 at head
  float ax = mix(1.0, smoothstep(0.0, 0.85, t) * (1.0 - smoothstep(0.9, 1.0, t)), uTail);
  vec3 col = vColor * g * ax * uGain;
  gl_FragColor = vec4(col, 0.0);
}
`;

const CORE_VERT = /* glsl */ `
attribute vec3 iColor;
varying vec3 vColor;
varying float vFacing;
void main() {
  vColor = iColor;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  vFacing = max(dot(n, normalize(-mv.xyz)), 0.0);
  gl_Position = projectionMatrix * mv;
}
`;
const CORE_FRAG = /* glsl */ `
precision highp float;
varying vec3 vColor;
varying float vFacing;
void main() {
  // Hot centre, saturated rim. The white-hot mix is deliberately hue-preserving:
  // a flat vec3(1.9) core washed every bolt to a colourless dot at distance
  // (once ACES + bloom had their way), so the "white" is now the bolt's own
  // colour lifted towards white per channel — a green bolt stays green-white.
  // A bolt flying AWAY from the camera is seen almost entirely through its cap,
  // i.e. vFacing ~ 1 everywhere — so the old 100%-white head-on term erased the
  // bolt's colour exactly when it mattered most (rail's twin lasers read as
  // colourless specks). Keep most of the hue even at the hottest point.
  vec3 hot = mix(vColor, vec3(1.0), 0.15) * 3.4;
  vec3 col = mix(vColor * 2.4, hot, pow(vFacing, 1.6));
  gl_FragColor = vec4(col, 1.0);
}
`;

export class LaserSystem {
  constructor(capacity = 96) {
    this.capacity = capacity;
    this.bolts = [];
    const mkInst = (geo, mat, order) => {
      const m = new THREE.InstancedMesh(geo, mat, capacity);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const col = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
      col.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('iColor', col);
      m.frustumCulled = false; m.count = 0; m.renderOrder = order;
      m.userData.color = col;
      return m;
    };
    const add = { transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor };
    // core:glow radius ratio matters more than absolute size — at 0.075 vs 0.28
    // the solid core was a hairline inside a big soft halo, so a bolt read as a
    // pale fuzzy dot. Fatten the core, tighten the halo, and push the halo gain
    // well above 1 so the additive tint survives being drawn over bright water.
    this.core = mkInst(new THREE.CapsuleGeometry(0.14, 1.3, 4, 10), new THREE.ShaderMaterial({ vertexShader: CORE_VERT, fragmentShader: CORE_FRAG }), 10);
    this.glow = mkInst(new THREE.CapsuleGeometry(0.30, 1.5, 4, 12), new THREE.ShaderMaterial({
      vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, ...add, side: THREE.FrontSide,
      uniforms: { uHalf: { value: 1.03 }, uTail: { value: 0 }, uGain: { value: 2.0 } },
    }), 11);
    this.trail = mkInst(new THREE.CapsuleGeometry(0.14, 4.2, 4, 10), new THREE.ShaderMaterial({
      vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, ...add,
      uniforms: { uHalf: { value: 2.24 }, uTail: { value: 1 }, uGain: { value: 1.15 } },
    }), 9);
    this.group = new THREE.Group();
    this.group.add(this.trail, this.glow, this.core);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0); this._tmp = new THREE.Vector3();
    this._meshes = [this.core, this.glow, this.trail];
  }

  /** fire({pos, dir, color, speed, life, scale, stretch, owner, damage}) */
  fire(o) {
    if (this.bolts.length >= this.capacity) this.bolts.shift();
    const speed = o.speed ?? 180;
    // Axial streak. A bolt is only ~1.5 m of geometry; at rail speeds (440 m/s)
    // it covers 7 m per frame, so it drew as a subpixel dot and the twin lasers
    // were effectively invisible. Stretch the capsule along its axis in
    // proportion to per-frame travel (the classic motion-streak cheat) so a fast
    // bolt reads as a bolt, not a speck. Callers may override with `stretch`.
    const stretch = o.stretch ?? Math.max(1, Math.min(3.6, speed / 150));
    const b = {
      pos: o.pos.clone(), dir: o.dir.clone().normalize(), color: o.color.clone(),
      speed, life: o.life ?? 1.6, age: 0, scale: o.scale ?? 1, stretch,
      owner: o.owner ?? 'player', damage: o.damage ?? 1, homing: o.homing ?? null, turn: o.turn ?? 6,
      dead: false,
    };
    this.bolts.push(b);
    return b;
  }

  /** hitTest(b) -> truthy when bolt should be removed; called per bolt per frame. */
  update(dt, hitTest) {
    // compact in place — a fresh `alive` array per frame was GC churn
    const bolts = this.bolts;
    let n = 0;
    for (let i = 0; i < bolts.length; i++) {
      const b = bolts[i];
      b.age += dt;
      if (b.homing && !b.homing.dead) {
        this._tmp.copy(b.homing.pos).sub(b.pos).normalize();
        b.dir.lerp(this._tmp, Math.min(1, b.turn * dt)).normalize();
      }
      b.pos.addScaledVector(b.dir, b.speed * dt);
      if (b.age > b.life || b.dead) continue;
      if (hitTest && hitTest(b)) continue;
      bolts[n++] = b;
    }
    bolts.length = n;
    for (let i = 0; i < n; i++) {
      const b = bolts[i];
      this._q.setFromUnitVectors(this._up, b.dir);
      const grow = Math.min(1, b.age * 12); // quick stretch-in from the muzzle
      const ax = b.stretch * (0.35 + 0.65 * grow);
      this._s.set(b.scale, b.scale * ax, b.scale);
      this._m.compose(b.pos, this._q, this._s);
      this.core.setMatrixAt(i, this._m);
      this.glow.setMatrixAt(i, this._m);
      // trail centre sits behind the head (scaled with the streak so it stays attached)
      this._tmp.copy(b.pos).addScaledVector(b.dir, -1.6 * b.scale * grow * b.stretch);
      this._s.set(b.scale, b.scale * grow * b.stretch, b.scale);
      this._m.compose(this._tmp, this._q, this._s);
      this.trail.setMatrixAt(i, this._m);
      for (const m of this._meshes) m.userData.color.setXYZ(i, b.color.r, b.color.g, b.color.b);
    }
    for (const m of this._meshes) {
      m.count = n; m.instanceMatrix.needsUpdate = true; m.userData.color.needsUpdate = true;
    }
  }

  dispose() { for (const m of [this.core, this.glow, this.trail]) { m.geometry.dispose(); m.material.dispose(); } }
}
