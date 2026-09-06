// Instanced hot debris chunks: analytic ballistic motion + tumbling in the
// vertex shader, lambert + fresnel shading with a cooling emissive glow.
import * as THREE from 'three';

const VERT = /* glsl */ `
uniform float uTime;
attribute vec3 aPos;
attribute vec3 aVel;
attribute vec3 aAxis;   // rotation axis (unit)
attribute vec4 aInfo;   // birth, life, angVel, scale
attribute vec3 aTint;
varying vec3 vN;
varying vec3 vV;
varying float vU;
varying vec3 vTint;
varying float vSeed;

mat3 rot(vec3 ax, float a) {
  float c = cos(a), s = sin(a), t = 1.0 - c;
  return mat3(
    t*ax.x*ax.x + c,      t*ax.x*ax.y + s*ax.z, t*ax.x*ax.z - s*ax.y,
    t*ax.x*ax.y - s*ax.z, t*ax.y*ax.y + c,      t*ax.y*ax.z + s*ax.x,
    t*ax.x*ax.z + s*ax.y, t*ax.y*ax.z - s*ax.x, t*ax.z*ax.z + c);
}

void main() {
  float age = uTime - aInfo.x;
  float u = age / max(aInfo.y, 1e-4);
  vU = u; vTint = aTint; vSeed = aInfo.z;
  if (u < 0.0 || u > 1.0) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); vN = vec3(0,0,1); vV = vec3(0); return; }
  float k = 0.35;
  vec3 p = aPos + aVel * (1.0 - exp(-k * age)) / k;
  mat3 R = rot(aAxis, aInfo.z * age);
  float sc = aInfo.w * (1.0 - smoothstep(0.8, 1.0, u));
  vec3 lp = R * (position * sc);
  vN = normalize(normalMatrix * (R * normal));
  vec4 mv = modelViewMatrix * vec4(p + lp, 1.0);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform vec3 uSunDir;   // view-space
uniform vec3 uSunCol;
uniform vec3 uSkyCol;
uniform vec3 uGroundCol;
varying vec3 vN;
varying vec3 vV;
varying float vU;
varying vec3 vTint;
varying float vSeed;
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(vV);
  float ndl = max(dot(n, uSunDir), 0.0);
  vec3 hemi = mix(uGroundCol, uSkyCol, n.y * 0.5 + 0.5);
  vec3 h = normalize(uSunDir + v);
  float spec = pow(max(dot(n, h), 0.0), 40.0) * 0.6;
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  vec3 base = vTint;
  vec3 col = base * (hemi * 0.9 + uSunCol * ndl) + uSunCol * spec + hemi * fres * 0.5;
  // cooling heat: bright orange edges early, flickers off
  float heat = pow(max(1.0 - vU * 1.6, 0.0), 1.6);
  float flick = 0.7 + 0.3 * sin(vU * 60.0 + vSeed * 3.0);
  vec3 hot = vec3(1.0, 0.45, 0.1) * 3.0;
  col += hot * heat * flick * (0.45 + 0.75 * fres);
  gl_FragColor = vec4(col, 1.0);
}
`;

function chunkGeometry() {
  const g = new THREE.IcosahedronGeometry(0.5, 0);
  const pos = g.attributes.position;
  // jitter vertices for an irregular shard look; positions are non-indexed so
  // jitter per-unique-vertex via hashing to keep faces welded
  const seen = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let j = seen.get(key);
    if (!j) { j = [0.6 + Math.random() * 0.8, 0.6 + Math.random() * 0.8, 0.6 + Math.random() * 0.8]; seen.set(key, j); }
    pos.setXYZ(i, pos.getX(i) * j[0], pos.getY(i) * j[1] * 0.7, pos.getZ(i) * j[2] * 1.3);
  }
  g.computeVertexNormals();
  return g;
}

export class DebrisSystem {
  constructor(capacity = 512) {
    this.capacity = capacity; this.cursor = 0; this.time = 0;
    const base = chunkGeometry();
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.attributes.position = base.attributes.position;
    geo.attributes.normal = base.attributes.normal;
    const mk = (n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.aPos = mk(3); this.aVel = mk(3); this.aAxis = mk(3); this.aInfo = mk(4); this.aTint = mk(3);
    for (let i = 0; i < capacity; i++) this.aInfo.setXYZW(i, 1e9, 1, 0, 1);
    geo.setAttribute('aPos', this.aPos); geo.setAttribute('aVel', this.aVel);
    geo.setAttribute('aAxis', this.aAxis); geo.setAttribute('aInfo', this.aInfo); geo.setAttribute('aTint', this.aTint);
    geo.instanceCount = capacity;
    this.geometry = geo;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunCol: { value: new THREE.Color(1.0, 0.95, 0.85).multiplyScalar(2.2) },
        uSkyCol: { value: new THREE.Color(0.35, 0.5, 0.8) },
        uGroundCol: { value: new THREE.Color(0.12, 0.1, 0.16) },
      },
      vertexShader: VERT, fragmentShader: FRAG,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this._dirty = false;
    this._sunWorld = new THREE.Vector3(0.5, 1, 0.3).normalize();
  }

  setSun(dirWorld) { this._sunWorld.copy(dirWorld).normalize(); }

  spawn(o) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.capacity;
    this.aPos.setXYZ(i, o.x, o.y, o.z);
    this.aVel.setXYZ(i, o.vx, o.vy, o.vz);
    this.aAxis.setXYZ(i, o.ax, o.ay, o.az);
    this.aInfo.setXYZW(i, this.time + (o.delay ?? 0), o.life ?? 2, o.angVel ?? 6, o.scale ?? 0.3);
    const t = o.tint; this.aTint.setXYZ(i, t.r, t.g, t.b);
    this._dirty = true;
  }

  update(dt, camera) {
    this.time += dt;
    this.material.uniforms.uTime.value = this.time;
    if (camera) this.material.uniforms.uSunDir.value.copy(this._sunWorld).transformDirection(camera.matrixWorldInverse);
    if (this._dirty) { for (const a of [this.aPos, this.aVel, this.aAxis, this.aInfo, this.aTint]) a.needsUpdate = true; this._dirty = false; }
  }

  dispose() { this.geometry.dispose(); this.material.dispose(); }
}
