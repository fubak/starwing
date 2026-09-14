// Layered, shaded explosions for the boss fight.
//
// One `spawn()` builds a CLUSTER: a hero fireball plus several staggered child
// fireballs, a camera-facing shockwave ring, a hard core flash, and (for the
// big ones) a second, edge-on shockwave disc. Fireballs are opaque, noise-
// displaced icosahedra shaded with a fake key light so the soot shell reads as
// a lit volume (dark underside, bright rim toward the sun), with a hot emissive
// interior that cools from white -> yellow -> orange -> red -> soot over life.
// Nothing here is additive except the flash and the shockwave leading edge, so
// stacking many of them never whites the frame out.

const NOISE = /* glsl */ `
  float hash(vec3 p){ p = fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float noise(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
  float fbm(vec3 p){ float a=0.5,s=0.0; for(int i=0;i<4;i++){ s+=a*noise(p); p=p*2.07+7.3; a*=0.5; } return s; }
`;

const FIRE_VERT = /* glsl */ `
  uniform float uAge; uniform float uSeed; uniform float uPuff;
  varying vec3 vN; varying vec3 vP; varying vec3 vW; varying float vD; ${NOISE}
  void main(){
    vP = position;
    // cauliflower displacement: low-freq lobes + high-freq crinkle, drifting with age
    float d1 = fbm(position * 1.3 + uSeed + uAge * 0.9);
    float d2 = fbm(position * 3.4 - uSeed * 0.7 + uAge * 1.6);
    float d = d1 * 0.75 + d2 * 0.25;
    vD = d;
    vec3 p = position * (0.62 + 0.75 * d * uPuff);
    vN = normalize(normalMatrix * normal);
    vec4 wp = modelMatrix * vec4(p, 1.0); vW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

const FIRE_FRAG = /* glsl */ `
  precision highp float;
  uniform float uAge; uniform float uSeed; uniform vec3 uTint; uniform vec3 uLightDir; uniform float uHot;
  varying vec3 vN; varying vec3 vP; varying vec3 vW; varying float vD; ${NOISE}
  void main(){
    vec3 n = normalize(vN);
    vec3 v = normalize(cameraPosition - vW);
    float ndv = max(dot(n, v), 0.0);
    // internal heat field: bright where the displacement lobes are, cooling with age
    float f = fbm(vP * 2.6 + uSeed - uAge * 1.4);
    float heat = clamp((vD * 1.1 + f * 0.9) * 1.25 - uAge * 1.55 + uHot, 0.0, 1.0);
    // soot shell lighting (key light + soft sky wrap + rim)
    float ndl = dot(n, normalize(uLightDir));
    float lit = 0.18 + 0.82 * max(ndl, 0.0) + 0.12 * max(-ndl, 0.0);
    float rim = pow(1.0 - ndv, 3.0);
    vec3 soot = vec3(0.09, 0.075, 0.07) * lit + vec3(0.35, 0.28, 0.24) * rim * 0.5;
    // fire ramp: soot -> deep red -> orange -> yellow -> white
    vec3 col = soot;
    col = mix(col, vec3(0.55, 0.06, 0.01), smoothstep(0.05, 0.30, heat));
    col = mix(col, vec3(1.00, 0.34, 0.04), smoothstep(0.30, 0.55, heat));
    col = mix(col, vec3(1.00, 0.72, 0.18), smoothstep(0.55, 0.78, heat));
    col = mix(col, vec3(1.00, 0.96, 0.82), smoothstep(0.78, 0.96, heat));
    // Hot interior is self-lit; soot is only lit externally.
    // The gain is per-channel and warm-weighted so the interior CLIPS IN ORDER:
    // red saturates first, then green, then blue. Under ACES + bloom that gives
    // the classic filmic fireball (white core -> yellow -> amber -> orange edge)
    // instead of a flat blown-out white disc, which is what a scalar 2.6x gain
    // produced on the death cluster (every channel hit 1.0 at the same time and
    // half the screen went to paper white with no interior detail left).
    float glow = smoothstep(0.08, 0.6, heat);
    col = col * mix(vec3(1.0), vec3(2.30, 1.72, 1.12), glow) * uTint;
    // fresnel-eroded silhouette + noise dissolve at end of life so the ball breaks into smoke rags
    float dissolve = smoothstep(0.55, 1.0, uAge);
    float edge = smoothstep(0.0, 0.35 + dissolve * 0.5, ndv);
    float rag = smoothstep(dissolve - 0.25, dissolve + 0.05, f + vD * 0.5);
    float a = edge * rag * (1.0 - smoothstep(0.85, 1.0, uAge));
    if (a < 0.03) discard;
    gl_FragColor = vec4(col, a);
  }`;

// camera-facing shockwave: refractive-looking ring, bright leading edge, soft trailing haze
const RING_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RING_FRAG = /* glsl */ `
  precision highp float; uniform float uAge; uniform vec3 uColor; uniform float uSeed; varying vec2 vUv; ${NOISE}
  void main(){
    vec2 p = vUv - 0.5; float r = length(p) * 2.0; float ang = atan(p.y, p.x);
    float front = 0.92 - uAge * 0.06;             // leading edge
    float w = 0.05 + uAge * 0.10;                  // thickens & softens as it expands
    float n = noise(vec3(cos(ang) * 4.0, sin(ang) * 4.0, uSeed)) * 0.5 + 0.5;
    float edge = smoothstep(front - w, front, r) * (1.0 - smoothstep(front, front + 0.03, r));
    float haze = smoothstep(front - 0.35, front - 0.05, r) * (1.0 - smoothstep(front - 0.05, front, r)) * 0.35;
    float a = (edge * (0.7 + 0.5 * n) + haze * n) * (1.0 - uAge) * (1.0 - uAge);
    // These are ADDITIVE and up to 12 can overlap during the chain-reaction
    // death, which bleached the whole dreadnought hull to paper white. Halve
    // the gain and keep the leading edge warm (not white) so ten stacked rings
    // read as a lattice of hot shockwaves instead of one flat glare.
    vec3 col = mix(uColor, vec3(1.0, 0.94, 0.78), edge * 0.35);
    gl_FragColor = vec4(col * a * 0.95, a);
  }`;

// short hard core flash (billboard), additive; carries the "pop"
const FLASH_FRAG = /* glsl */ `
  precision highp float; uniform float uAge; uniform vec3 uColor; varying vec2 vUv;
  void main(){ vec2 p = vUv - 0.5; float r = length(p) * 2.0;
    float core = pow(max(0.0, 1.0 - r), 3.0); float rays = pow(max(0.0, 1.0 - r), 1.2) * (0.55 + 0.45 * pow(abs(cos(atan(p.y, p.x) * 3.0)), 6.0));
    float a = (core * 1.05 + rays * 0.32) * (1.0 - uAge) * (1.0 - uAge);
    // stop just short of pure white: the additive flash sitting on top of the
    // fireballs is what pushed the death cluster over the clip point
    gl_FragColor = vec4(mix(uColor, vec3(1.0, 0.97, 0.88), core * 0.85) * a, a); }`;

export class Explosions {
  constructor(THREE, scene, { maxBalls = 40, maxRings = 12, maxFlashes = 10, lightDir = new THREE.Vector3(0.6, 0.55, 0.6) } = {}) {
    this.THREE = THREE; this.scene = scene;
    this.lightDir = lightDir.clone().normalize();
    const ballGeo = new THREE.IcosahedronGeometry(1, 5);
    this.balls = [];
    for (let i = 0; i < maxBalls; i++) {
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.FrontSide,
        uniforms: { uAge: { value: 0 }, uSeed: { value: 0 }, uTint: { value: new THREE.Color(1, 1, 1) }, uLightDir: { value: this.lightDir }, uPuff: { value: 1 }, uHot: { value: 0 } },
        vertexShader: FIRE_VERT, fragmentShader: FIRE_FRAG,
      });
      const m = new THREE.Mesh(ballGeo, mat); m.visible = false; m.renderOrder = 6; m.frustumCulled = false; scene.add(m);
      this.balls.push({ m, active: false, age: 0, delay: 0, dur: 1, size: 1, vel: new THREE.Vector3(), spin: new THREE.Vector3() });
    }
    const quad = new THREE.PlaneGeometry(2, 2);
    this.rings = [];
    for (let i = 0; i < maxRings; i++) {
      const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uAge: { value: 0 }, uColor: { value: new THREE.Color(1, 0.7, 0.45) }, uSeed: { value: 0 } }, vertexShader: RING_VERT, fragmentShader: RING_FRAG });
      const m = new THREE.Mesh(quad, mat); m.visible = false; m.renderOrder = 7; m.frustumCulled = false; scene.add(m);
      this.rings.push({ m, active: false, age: 0, dur: 1, size: 1, delay: 0, facing: 'camera', normal: new THREE.Vector3(0, 1, 0) });
    }
    this.flashes = [];
    for (let i = 0; i < maxFlashes; i++) {
      const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uAge: { value: 0 }, uColor: { value: new THREE.Color(1, 0.8, 0.5) } }, vertexShader: RING_VERT, fragmentShader: FLASH_FRAG });
      const m = new THREE.Mesh(quad, mat); m.visible = false; m.renderOrder = 8; m.frustumCulled = false; scene.add(m);
      this.flashes.push({ m, active: false, age: 0, dur: 0.3, size: 1, delay: 0 });
    }
    this.light = new THREE.PointLight(0xffa050, 0, 320, 1.5); scene.add(this.light);
    this.light2 = new THREE.PointLight(0xff6a30, 0, 420, 1.4); scene.add(this.light2);
    this.flash = 0; // 0..1 screen-flash suggestion for the HUD
    this._q = new THREE.Quaternion(); this._v = new THREE.Vector3();
  }

  _ball() { return this.balls.find((b) => !b.active) || this.balls.reduce((a, b) => (a.age / a.dur > b.age / b.dur ? a : b)); }
  _ring() { return this.rings.find((b) => !b.active) || this.rings[0]; }
  _flash() { return this.flashes.find((b) => !b.active) || this.flashes[0]; }

  /**
   * spawn(p, size, dur, { tint, children, ring, flash, hot, vel })
   * size = hero fireball radius (world units). Returns nothing.
   */
  spawn(p, size = 10, dur = 1.2, opts = null) {
    const THREE = this.THREE;
    const o = Array.isArray(opts) ? { tint: opts } : (opts || {});
    const tint = o.tint || [1, 1, 1];
    const children = o.children ?? (size > 30 ? 7 : size > 14 ? 4 : 2);
    const spread = o.spread ?? size * 0.75;
    const hero = this._ball();
    const setup = (b, pos, s, d, delay, hot, vel) => {
      b.active = true; b.age = 0; b.delay = delay; b.dur = d; b.size = s;
      b.m.position.copy(pos); b.m.visible = false; b.m.quaternion.random();
      b.m.material.uniforms.uSeed.value = Math.random() * 60; b.m.material.uniforms.uTint.value.set(...tint);
      b.m.material.uniforms.uPuff.value = 0.85 + Math.random() * 0.3; b.m.material.uniforms.uHot.value = hot;
      b.vel.copy(vel); b.spin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.6);
    };
    setup(hero, p, size, dur, 0, o.hot ?? 0.25, o.vel ? o.vel.clone() : new THREE.Vector3(0, size * 0.35, 0));
    for (let i = 0; i < children; i++) {
      const b = this._ball(); if (b === hero) break;
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize();
      const pos = p.clone().addScaledVector(dir, spread * (0.4 + Math.random() * 0.8));
      const s = size * (0.35 + Math.random() * 0.4);
      setup(b, pos, s, dur * (0.75 + Math.random() * 0.5), 0.04 + Math.random() * dur * 0.35, Math.random() * 0.3, dir.clone().multiplyScalar(size * (0.5 + Math.random() * 0.8)).add(new THREE.Vector3(0, s * 0.3, 0)));
    }
    if (o.ring !== false) {
      const r = this._ring(); r.active = true; r.age = 0; r.delay = 0; r.dur = dur * (o.ringDur ?? 0.9); r.size = size * (o.ringScale ?? 4.2); r.facing = 'camera';
      r.m.position.copy(p); r.m.visible = false; r.m.material.uniforms.uSeed.value = Math.random() * 10; r.m.material.uniforms.uColor.value.set(...(o.ringColor || [1.0, 0.72, 0.45]));
      if (o.discRing) {
        const r2 = this._ring(); if (r2 !== r) { r2.active = true; r2.age = 0; r2.delay = 0.05; r2.dur = dur * 1.1; r2.size = size * 6.5; r2.facing = 'normal'; r2.normal.set(0.15, 1, 0.1).normalize(); r2.m.position.copy(p); r2.m.visible = false; r2.m.material.uniforms.uSeed.value = Math.random() * 10; r2.m.material.uniforms.uColor.value.set(0.9, 0.75, 0.6); }
      }
    }
    if (o.flash !== false) {
      const f = this._flash(); f.active = true; f.age = 0; f.delay = 0; f.dur = Math.min(0.5, dur * 0.3); f.size = size * 2.6; f.m.position.copy(p); f.m.visible = false; f.m.material.uniforms.uColor.value.set(...(o.flashColor || [1, 0.85, 0.6]));
    }
    // lights: primary jumps to the newest big explosion, secondary lingers on the previous
    if (size * 40 >= this.light.intensity) { this.light2.position.copy(this.light.position); this.light2.intensity = Math.max(this.light2.intensity, this.light.intensity * 0.7); this.light.position.copy(p); this.light.intensity = Math.min(900, size * 40); }
    else { this.light2.position.copy(p); this.light2.intensity = Math.max(this.light2.intensity, Math.min(600, size * 30)); }
    this.flash = Math.max(this.flash, Math.min(1, size / 40));
  }

  clear() {
    for (const b of this.balls) { b.active = false; b.m.visible = false; }
    for (const r of this.rings) { r.active = false; r.m.visible = false; }
    for (const f of this.flashes) { f.active = false; f.m.visible = false; }
    this.light.intensity = this.light2.intensity = 0; this.flash = 0;
  }

  update(dt, camera, real = dt) {
    const ease = (u) => 1 - Math.pow(1 - u, 3);
    for (const b of this.balls) {
      if (!b.active) continue;
      if (b.delay > 0) { b.delay -= dt; continue; }
      b.age += dt; const u = b.age / b.dur;
      if (u >= 1) { b.active = false; b.m.visible = false; continue; }
      b.m.visible = true;
      // fast pop then slow swell; drifts with velocity that decays; buoyant rise late
      const g = ease(Math.min(1, u * 1.35));
      b.m.scale.setScalar(b.size * (0.15 + 0.85 * g) * (1 + u * 0.45));
      b.m.position.addScaledVector(b.vel, dt); b.vel.multiplyScalar(Math.exp(-1.6 * dt)); b.vel.y += b.size * 0.25 * dt;
      b.m.rotation.x += b.spin.x * dt; b.m.rotation.y += b.spin.y * dt; b.m.rotation.z += b.spin.z * dt;
      b.m.material.uniforms.uAge.value = u;
    }
    for (const r of this.rings) {
      if (!r.active) continue;
      if (r.delay > 0) { r.delay -= dt; continue; }
      r.age += dt; const u = r.age / r.dur;
      if (u >= 1) { r.active = false; r.m.visible = false; continue; }
      r.m.visible = true;
      r.m.scale.setScalar(r.size * (0.15 + 0.85 * ease(u)));
      if (r.facing === 'camera') r.m.lookAt(camera.position);
      else { this._q.setFromUnitVectors(this._v.set(0, 0, 1), r.normal); r.m.quaternion.copy(this._q); }
      r.m.material.uniforms.uAge.value = u;
    }
    for (const f of this.flashes) {
      if (!f.active) continue;
      f.age += dt; const u = f.age / f.dur;
      if (u >= 1) { f.active = false; f.m.visible = false; continue; }
      f.m.visible = true; f.m.scale.setScalar(f.size * (0.6 + 0.4 * ease(u))); f.m.lookAt(camera.position); f.m.material.uniforms.uAge.value = u;
    }
    this.light.intensity *= Math.exp(-real * 3.2); this.light2.intensity *= Math.exp(-real * 2.4); this.flash *= Math.exp(-real * 6);
  }

  dispose() {
    for (const b of this.balls) { b.m.material.dispose(); this.scene.remove(b.m); }
    for (const r of this.rings) { r.m.material.dispose(); this.scene.remove(r.m); }
    for (const f of this.flashes) { f.m.material.dispose(); this.scene.remove(f.m); }
    this.balls[0]?.m.geometry.dispose(); this.rings[0]?.m.geometry.dispose();
    this.scene.remove(this.light, this.light2);
  }
}
