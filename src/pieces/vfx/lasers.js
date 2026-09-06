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
  // white-hot centre, tinted rim
  vec3 col = mix(vColor * 1.8, vec3(2.4), pow(vFacing, 1.5));
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
    this.core = mkInst(new THREE.CapsuleGeometry(0.075, 1.3, 4, 10), new THREE.ShaderMaterial({ vertexShader: CORE_VERT, fragmentShader: CORE_FRAG }), 10);
    this.glow = mkInst(new THREE.CapsuleGeometry(0.28, 1.5, 4, 12), new THREE.ShaderMaterial({
      vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, ...add, side: THREE.FrontSide,
      uniforms: { uHalf: { value: 1.03 }, uTail: { value: 0 }, uGain: { value: 1.1 } },
    }), 11);
    this.trail = mkInst(new THREE.CapsuleGeometry(0.14, 4.2, 4, 10), new THREE.ShaderMaterial({
      vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, ...add,
      uniforms: { uHalf: { value: 2.24 }, uTail: { value: 1 }, uGain: { value: 0.9 } },
    }), 9);
    this.group = new THREE.Group();
    this.group.add(this.trail, this.glow, this.core);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0); this._tmp = new THREE.Vector3();
  }

  /** fire({pos, dir, color, speed, life, scale, owner, damage}) */
  fire(o) {
    if (this.bolts.length >= this.capacity) this.bolts.shift();
    const b = {
      pos: o.pos.clone(), dir: o.dir.clone().normalize(), color: o.color.clone(),
      speed: o.speed ?? 180, life: o.life ?? 1.6, age: 0, scale: o.scale ?? 1,
      owner: o.owner ?? 'player', damage: o.damage ?? 1, homing: o.homing ?? null, turn: o.turn ?? 6,
      dead: false,
    };
    this.bolts.push(b);
    return b;
  }

  /** hitTest(b) -> truthy when bolt should be removed; called per bolt per frame. */
  update(dt, hitTest) {
    const alive = [];
    for (const b of this.bolts) {
      b.age += dt;
      if (b.homing && !b.homing.dead) {
        this._tmp.copy(b.homing.pos).sub(b.pos).normalize();
        b.dir.lerp(this._tmp, Math.min(1, b.turn * dt)).normalize();
      }
      b.pos.addScaledVector(b.dir, b.speed * dt);
      if (b.age > b.life || b.dead) continue;
      if (hitTest && hitTest(b)) continue;
      alive.push(b);
    }
    this.bolts = alive;
    const n = alive.length;
    for (let i = 0; i < n; i++) {
      const b = alive[i];
      this._q.setFromUnitVectors(this._up, b.dir);
      const grow = Math.min(1, b.age * 12); // quick stretch-in from the muzzle
      this._s.set(b.scale, b.scale * (0.35 + 0.65 * grow), b.scale);
      this._m.compose(b.pos, this._q, this._s);
      this.core.setMatrixAt(i, this._m);
      this.glow.setMatrixAt(i, this._m);
      // trail centre sits behind the head
      this._tmp.copy(b.pos).addScaledVector(b.dir, -1.6 * b.scale * grow);
      this._s.set(b.scale, b.scale * grow, b.scale);
      this._m.compose(this._tmp, this._q, this._s);
      this.trail.setMatrixAt(i, this._m);
      for (const m of [this.core, this.glow, this.trail]) m.userData.color.setXYZ(i, b.color.r, b.color.g, b.color.b);
    }
    for (const m of [this.core, this.glow, this.trail]) {
      m.count = n; m.instanceMatrix.needsUpdate = true; m.userData.color.needsUpdate = true;
    }
  }

  dispose() { for (const m of [this.core, this.glow, this.trail]) { m.geometry.dispose(); m.material.dispose(); } }
}
