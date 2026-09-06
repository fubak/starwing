// GPU-driven particle system: all motion is analytic in the vertex shader
// (position, drag, gravity, rotation, size curves) so the CPU only touches a
// particle at spawn time. One InstancedBufferGeometry, one draw call, several
// procedural "types" resolved in the fragment shader (soft glow, fireball with
// animated fbm, smoke, stretched spark, ring shockwave, star flash).
import * as THREE from 'three';

export const P = { SOFT: 0, FIRE: 1, SMOKE: 2, SPARK: 3, RING: 4, FLASH: 5, EMBER: 6 };

const VERT = /* glsl */ `
uniform float uTime;
attribute vec3 aPos;
attribute vec3 aVel;
attribute vec3 aColA;
attribute vec3 aColB;
attribute vec2 aTime;   // birth, life
attribute vec2 aSize;   // start, end
attribute vec2 aRot;    // rot0, rotVel
attribute vec4 aParams; // type, drag, gravity, seed
varying vec2 vUv;
varying vec3 vColA;
varying vec3 vColB;
varying float vU;
varying float vType;
varying float vSeed;
varying float vAge;
varying float vNear;
varying float vThick;

float easeOut(float x, float p) { return 1.0 - pow(1.0 - x, p); }

void main() {
  float age = uTime - aTime.x;
  float u = age / max(aTime.y, 1e-4);
  vUv = uv; vColA = aColA; vColB = aColB; vU = u; vType = aParams.x; vSeed = aParams.w; vAge = age;
  vThick = aRot.x > 0.0 ? aRot.x : 1.0;   // RING: rot slot doubles as band-thickness multiplier
  if (u < 0.0 || u > 1.0) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }

  float k = max(aParams.y, 1e-3);
  float s = (1.0 - exp(-k * age)) / k;
  vec3 p = aPos + aVel * s + vec3(0.0, -aParams.z * age * age * 0.5, 0.0);
  vec3 vel = aVel * exp(-k * age) + vec3(0.0, -aParams.z * age, 0.0);

  float type = aParams.x;
  float size;
  if (type == 1.0)      size = mix(aSize.x, aSize.y, easeOut(u, 3.0));   // fireball: punch out fast
  else if (type == 2.0) size = mix(aSize.x, aSize.y, easeOut(u, 2.0));   // smoke: steady growth
  else if (type == 4.0) size = mix(aSize.x, aSize.y, easeOut(u, 2.5));   // ring: expand w/ decel
  else if (type == 5.0) size = mix(aSize.x, aSize.y, easeOut(u, 4.0));   // flash: instant
  else if (type == 3.0) size = mix(aSize.x, aSize.y, u);
  else                  size = mix(aSize.x, aSize.y, u);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec2 q = position.xy;
  if (type == 3.0 || type == 6.0) {
    // stretch along screen-space velocity
    vec3 vv = (viewMatrix * vec4(vel, 0.0)).xyz;
    vec2 d = vv.xy; float L = length(d);
    vec2 dir = L > 1e-4 ? d / L : vec2(1.0, 0.0);
    float len = clamp(1.0 + L * 0.12, 1.0, 7.0);
    q = mat2(dir, vec2(-dir.y, dir.x)) * (position.xy * vec2(len, 1.0));
  } else {
    float r = aRot.x + aRot.y * age;
    float c = cos(r), sn = sin(r);
    q = mat2(c, sn, -sn, c) * q;
  }
  mv.xy += q * size;
  // near-camera fade: a billboard that would intersect the near plane or fill
  // the frame dissolves instead of clipping into a hard rectangle. Scaled by
  // sprite size so small sparks may pass close while big smoke fades early.
  float dist = -mv.z;
  float nearEnd = 1.0 + size * 0.35;
  vNear = smoothstep(0.6, nearEnd, dist);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
varying vec3 vColA;
varying vec3 vColB;
varying float vU;
varying float vType;
varying float vSeed;
varying float vAge;
varying float vNear;
varying float vThick;

// precision-safe hash: lattice coords are scaled DOWN before fract so large
// seeds/frequencies never collapse into flat square cells
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1, 0)), c = hash(i + vec2(0, 1)), d = hash(i + vec2(1, 1));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.7); a *= 0.5; }
  return v;
}

// Fire colour ramp, heat 0..1: soot -> deep red -> orange -> yellow -> hot core.
// colA = hot tint (yellow-ish), colB = cool tint (orange/red). Peak intensity is
// kept < ~1.6 so the ACES curve rolls it off to warm yellow, never flat white.
vec3 fireRamp(float h, vec3 hot, vec3 cool) {
  vec3 soot = vec3(0.05, 0.03, 0.03);
  vec3 red  = cool * vec3(0.55, 0.18, 0.12) / max(cool.r, 0.2);   // deep ember red of the cool tint
  vec3 col = mix(soot, red, smoothstep(0.0, 0.22, h));
  col = mix(col, cool * 0.95, smoothstep(0.22, 0.48, h));
  col = mix(col, hot * 1.15, smoothstep(0.48, 0.78, h));
  col = mix(col, mix(hot, vec3(1.0, 0.97, 0.85), 0.45) * 1.3, smoothstep(0.78, 1.0, h));
  return col;
}

void main() {
  vec2 c = vUv * 2.0 - 1.0;
  float r = length(c);
  float u = vU;
  vec3 rgb = vec3(0.0); float a = 0.0;
  bool stretched = (vType == 3.0 || vType == 6.0);
  // hard guarantee: nothing outside the inscribed disc (sparks: outside a rounded bar)
  if (!stretched && r > 0.985) discard;
  if (stretched && (abs(c.y) > 0.985 || abs(c.x) > 0.985)) discard;

  if (vType == 0.0) {                       // SOFT additive glow
    float g = exp(-r * r * 5.0) * (1.0 - smoothstep(0.6, 0.98, r));
    float fade = 1.0 - smoothstep(0.3, 1.0, u);
    rgb = mix(vColA, vColB, u) * g * fade * 0.9;
    a = 0.0;
  } else if (vType == 1.0) {                // FIREBALL (chunky, stylised)
    vec2 nq = c * 1.6 + vSeed * 11.0;
    float n = fbm(nq * 1.4 + vec2(0.0, -vAge * 0.9));
    float n2 = fbm(nq * 3.1 + vec2(vAge * 0.4, vAge * 0.7));
    // billowing silhouette: noise-warped disc that never reaches the quad border
    float shape = (1.0 - r * (0.95 + 0.4 * u)) + (n - 0.5) * 1.0 + (n2 - 0.5) * 0.4;
    float mask = 1.0 - smoothstep(0.6, 0.9, r);
    float edge = smoothstep(0.0, 0.1, shape) * mask;           // crisp cel-like rim
    // heat: hottest at the centre early; the whole ball cools to red then soot
    // over its life so the ramp reads yellow core -> orange -> red -> dark smoke
    float cool = smoothstep(0.15, 0.9, u);
    float heat = clamp(shape * 1.6 + 0.15 - cool * 1.35 - r * 0.25, 0.0, 1.0);
    // gentle banding for the stylised cel look
    float h = mix(heat, floor(heat * 6.0 + 0.5) / 6.0, 0.45);
    vec3 col = fireRamp(h, vColA, vColB);
    // interior creases from the fine noise so it reads as a volume
    col *= 0.82 + 0.36 * smoothstep(0.3, 0.7, n2);
    float fade = 1.0 - smoothstep(0.7, 1.0, u);
    a = edge * fade;
    rgb = col * a;                            // premultiplied, opaque-ish: occludes what's behind
    a *= 0.97;
  } else if (vType == 2.0) {                // SMOKE (soft alpha, lit side)
    vec2 nq = c * 1.5 + vSeed * 13.0 + 7.0;
    float n = fbm(nq * 1.2 + vec2(vAge * 0.15, -vAge * 0.25));
    float n2 = fbm(nq * 2.6 + vec2(-vAge * 0.2, vAge * 0.1));
    float shape = (1.0 - r * 1.15) + (n - 0.5) * 0.7 + (n2 - 0.5) * 0.25;
    float mask = 1.0 - smoothstep(0.35, 0.9, r);             // very soft feather to the disc
    float edge = smoothstep(0.0, 0.45, shape) * mask;
    float fade = (1.0 - smoothstep(0.3, 1.0, u)) * smoothstep(0.0, 0.12, u);
    // lit-side gradient: colA is lit, colB shadow; early smoke still carries ember glow
    float lit = clamp(0.5 + c.x * 0.35 - c.y * 0.45 + (n - 0.5) * 0.8, 0.0, 1.0);
    vec3 col = mix(vColB, vColA, lit);
    float ember = (1.0 - smoothstep(0.0, 0.45, u)) * smoothstep(0.2, 0.7, n2) * 0.5;
    col += vec3(0.9, 0.3, 0.06) * ember * (1.0 - r);
    a = edge * fade * 0.7;
    rgb = col * a;
  } else if (stretched) {                   // SPARK / EMBER (stretched)
    float core = exp(-c.y * c.y * 9.0) * (1.0 - smoothstep(0.55, 0.98, abs(c.x)));
    float tail = smoothstep(-1.0, 0.6, c.x);
    float fade = 1.0 - smoothstep(0.4, 1.0, u);
    vec3 col = mix(vColA, vColB, smoothstep(0.0, 0.8, u));
    rgb = col * core * tail * fade * 1.8;
    a = 0.0;
  } else if (vType == 4.0) {                // RING shockwave
    float rad = mix(0.15, 0.9, 1.0 - pow(1.0 - u, 2.5));
    float th = (0.045 + 0.09 * u) * vThick;
    float band = exp(-pow((r - rad) / th, 2.0));
    // faint fill just inside the wavefront only (outside must stay black or the quad shows)
    float inner = smoothstep(rad - 0.3, rad, r) * (1.0 - smoothstep(rad, rad + th * 1.5, r)) * 0.08 * (1.0 - u);
    float fade = 1.0 - smoothstep(0.3, 1.0, u);
    rgb = mix(vColA, vColB, u) * (band * 1.4 + inner) * fade;
    a = 0.0;
  } else {                                  // FLASH (star)
    float ang = atan(c.y, c.x);
    float rays = pow(abs(cos(ang * 2.0)), 14.0) * 0.9 + pow(abs(cos(ang * 2.0 + 1.5708)), 40.0) * 0.6;
    float edge = 1.0 - smoothstep(0.5, 0.95, r);       // never reach the quad border
    float g = (exp(-r * r * 9.0) * 1.2 + rays * exp(-r * 3.0) * 0.8) * edge;
    float fade = 1.0 - smoothstep(0.0, 1.0, u);
    rgb = mix(mix(vColA, vec3(1.0), 0.6), vColA, smoothstep(0.0, 0.6, r)) * g * fade * fade * 1.8;
    a = 0.0;
  }
  rgb *= vNear; a *= vNear;
  if (a <= 0.001 && dot(rgb, rgb) < 1e-5) discard;
  gl_FragColor = vec4(rgb, a);
}
`;

export class ParticleSystem {
  constructor(capacity = 4096) {
    this.capacity = capacity;
    this.cursor = 0;
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.attributes.position = base.attributes.position;
    geo.attributes.uv = base.attributes.uv;
    const mk = (n) => {
      const att = new THREE.InstancedBufferAttribute(new Float32Array(capacity * n), n);
      att.setUsage(THREE.DynamicDrawUsage);
      return att;
    };
    this.aPos = mk(3); this.aVel = mk(3); this.aColA = mk(3); this.aColB = mk(3);
    this.aTime = mk(2); this.aSize = mk(2); this.aRot = mk(2); this.aParams = mk(4);
    // birth far in the future so nothing draws until spawned
    for (let i = 0; i < capacity; i++) this.aTime.setXY(i, 1e9, 1);
    geo.setAttribute('aPos', this.aPos); geo.setAttribute('aVel', this.aVel);
    geo.setAttribute('aColA', this.aColA); geo.setAttribute('aColB', this.aColB);
    geo.setAttribute('aTime', this.aTime); geo.setAttribute('aSize', this.aSize);
    geo.setAttribute('aRot', this.aRot); geo.setAttribute('aParams', this.aParams);
    geo.instanceCount = capacity;
    this.geometry = geo;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendEquation: THREE.AddEquation,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    this.time = 0;
    this._dirty = false;
  }

  /** Spawn one particle. All params in world units / seconds. */
  spawn(o) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.capacity;
    this.aPos.setXYZ(i, o.x, o.y, o.z);
    this.aVel.setXYZ(i, o.vx ?? 0, o.vy ?? 0, o.vz ?? 0);
    const ca = o.colA, cb = o.colB ?? o.colA;
    this.aColA.setXYZ(i, ca.r, ca.g, ca.b);
    this.aColB.setXYZ(i, cb.r, cb.g, cb.b);
    this.aTime.setXY(i, this.time + (o.delay ?? 0), o.life ?? 1);
    this.aSize.setXY(i, o.size0 ?? 1, o.size1 ?? o.size0 ?? 1);
    this.aRot.setXY(i, o.rot ?? 0, o.rotVel ?? 0);
    this.aParams.setXYZW(i, o.type ?? P.SOFT, o.drag ?? 0.001, o.gravity ?? 0, o.seed ?? Math.random());
    this._dirty = true;
  }

  update(dt) {
    this.time += dt;
    this.material.uniforms.uTime.value = this.time;
    if (this._dirty) {
      for (const a of [this.aPos, this.aVel, this.aColA, this.aColB, this.aTime, this.aSize, this.aRot, this.aParams]) a.needsUpdate = true;
      this._dirty = false;
    }
  }

  dispose() { this.geometry.dispose(); this.material.dispose(); }
}
