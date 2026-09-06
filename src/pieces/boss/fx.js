// Effects for the boss fight: particles (smoke / fire / sparks), shards,
// fireball explosions + shockwaves, sweeping laser beams with telegraphs,
// homing missiles, player bolts, and the hex shield.

const NOISE = /* glsl */ `
  float hash(vec3 p){ p = fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float noise(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
  float fbm(vec3 p){ float a=0.5,s=0.0; for(int i=0;i<4;i++){ s+=a*noise(p); p=p*2.1+7.3; a*=0.5; } return s; }
`;

function softSprite(THREE, hard = false) {
  const S = 128; const cv = document.createElement('canvas'); cv.width = cv.height = S; const c = cv.getContext('2d');
  const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  if (hard) { g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); }
  else { g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.4, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); }
  c.fillStyle = g; c.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(cv); return t;
}
function smokeSprite(THREE, rng) {
  const S = 128; const cv = document.createElement('canvas'); cv.width = cv.height = S; const c = cv.getContext('2d');
  // clumpy puff: several overlapping soft blobs
  for (let i = 0; i < 9; i++) {
    const x = S / 2 + (rng.next() - 0.5) * 50, y = S / 2 + (rng.next() - 0.5) * 50, r = 22 + rng.next() * 26;
    const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
  }
  return new THREE.CanvasTexture(cv);
}

// ---------------------------------------------------------------- particles
export class Particles {
  constructor(THREE, { max = 1500, texture, blending = THREE.NormalBlending, sizeAtten = 1, tint = [1, 1, 1] }) {
    this.THREE = THREE; this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
    this.age = new Float32Array(max); this.life = new Float32Array(max);
    this.size0 = new Float32Array(max); this.grow = new Float32Array(max);
    this.aSize = new Float32Array(max); this.aAlpha = new Float32Array(max); this.aCol = new Float32Array(max * 3); this.col0 = new Float32Array(max * 3); this.col1 = new Float32Array(max * 3);
    this.drag = new Float32Array(max); this.rise = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.aSize, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.aAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aCol', new THREE.BufferAttribute(this.aCol, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending,
      uniforms: { uTex: { value: texture }, uScale: { value: 400 * sizeAtten } },
      vertexShader: /* glsl */ `attribute float aSize; attribute float aAlpha; attribute vec3 aCol; varying float vA; varying vec3 vC; uniform float uScale;
        void main(){ vA = aAlpha; vC = aCol; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `precision highp float; uniform sampler2D uTex; varying float vA; varying vec3 vC;
        void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vC * t.rgb, t.a * vA); }`,
    });
    this.points = new THREE.Points(geo, this.mat); this.points.frustumCulled = false;
    this.geo = geo;
  }
  emit(p, v, { life = 1, size = 1, grow = 0, drag = 0, rise = 0, c0 = [1, 1, 1], c1 = c0 }) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    this.age[i] = 0; this.life[i] = life; this.size0[i] = size; this.grow[i] = grow; this.drag[i] = drag; this.rise[i] = rise;
    this.col0.set(c0, i * 3); this.col1.set(c1, i * 3);
  }
  update(dt) {
    let n = this.n;
    for (let i = 0; i < n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { // swap-remove
        n--;
        if (i !== n) {
          for (const a of ['age', 'life', 'size0', 'grow', 'drag', 'rise']) this[a][i] = this[a][n];
          for (let k = 0; k < 3; k++) { this.pos[i * 3 + k] = this.pos[n * 3 + k]; this.vel[i * 3 + k] = this.vel[n * 3 + k]; this.col0[i * 3 + k] = this.col0[n * 3 + k]; this.col1[i * 3 + k] = this.col1[n * 3 + k]; }
        }
        i--; continue;
      }
      const u = this.age[i] / this.life[i];
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d + this.rise[i] * dt; this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.aSize[i] = this.size0[i] * (1 + this.grow[i] * u);
      this.aAlpha[i] = u < 0.1 ? u / 0.1 : 1 - (u - 0.1) / 0.9;
      for (let k = 0; k < 3; k++) this.aCol[i * 3 + k] = this.col0[i * 3 + k] + (this.col1[i * 3 + k] - this.col0[i * 3 + k]) * u;
    }
    this.n = n;
    this.geo.setDrawRange(0, n);
    for (const a of ['position', 'aSize', 'aAlpha', 'aCol']) this.geo.attributes[a].needsUpdate = true;
  }
  dispose() { this.geo.dispose(); this.mat.dispose(); }
}

// ---------------------------------------------------------------- shards
export class Shards {
  constructor(THREE, max = 160) {
    this.THREE = THREE; this.max = max; this.n = 0;
    const geo = new THREE.TetrahedronGeometry(1, 0);
    this.mat = new THREE.MeshStandardMaterial({ color: 0x8892a8, metalness: 0.8, roughness: 0.4, emissive: 0xff7a30, emissiveIntensity: 0 });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, max); this.mesh.frustumCulled = false; this.mesh.count = 0;
    this.items = [];
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3();
    this.emissiveAttr = new Float32Array(max);
  }
  burst(p, count, speed, size, { glow = 0.9, life = 2.2, dirBias = null } = {}) {
    const THREE = this.THREE;
    for (let i = 0; i < count && this.items.length < this.max; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      if (dirBias) v.add(dirBias).normalize();
      v.multiplyScalar(speed * (0.4 + Math.random()));
      const av = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(6);
      this.items.push({ p: p.clone(), v, q: new THREE.Quaternion().random(), av, age: 0, life: life * (0.6 + Math.random() * 0.6), s: size * (0.5 + Math.random()), glow });
    }
  }
  update(dt) {
    const alive = [];
    let glowSum = 0;
    for (const it of this.items) {
      it.age += dt; if (it.age >= it.life) continue;
      it.p.addScaledVector(it.v, dt); it.v.multiplyScalar(Math.exp(-0.6 * dt));
      const dq = new this.THREE.Quaternion().setFromEuler(new this.THREE.Euler(it.av.x * dt, it.av.y * dt, it.av.z * dt)); it.q.multiply(dq);
      alive.push(it); glowSum += it.glow * (1 - it.age / it.life);
    }
    this.items = alive;
    for (let i = 0; i < alive.length; i++) {
      const it = alive[i]; const k = 1 - it.age / it.life; const s = it.s * (0.3 + 0.7 * Math.min(1, k * 3));
      this._m.compose(it.p, it.q, this._s.set(s, s * 0.6, s * 1.4)); this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.count = alive.length; this.mesh.instanceMatrix.needsUpdate = true;
    this.mat.emissiveIntensity = alive.length ? Math.min(2.5, glowSum / alive.length * 2.5) : 0;
  }
  dispose() { this.mesh.geometry.dispose(); this.mat.dispose(); }
}

// ---------------------------------------------------------------- explosions
export class Explosions {
  constructor(THREE, scene, max = 14) {
    this.THREE = THREE; this.scene = scene; this.items = [];
    const fireGeo = new THREE.IcosahedronGeometry(1, 4);
    this.fireMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uAge: { value: 0 }, uSeed: { value: 0 }, uTint: { value: new THREE.Color(1, 1, 1) } },
      vertexShader: /* glsl */ `uniform float uAge; uniform float uSeed; varying vec3 vN; varying vec3 vV; varying vec3 vP; ${NOISE}
        void main(){ vP = position; float d = fbm(position * 1.6 + uSeed + uAge * 1.5); vec3 p = position * (0.8 + 0.5 * d); vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(p,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `precision highp float; uniform float uAge; uniform float uSeed; uniform vec3 uTint; varying vec3 vN; varying vec3 vV; varying vec3 vP; ${NOISE}
        void main(){ float n = fbm(vP * 2.5 + uSeed - uAge * 2.0); float ndv = max(dot(normalize(vN), normalize(vV)), 0.0);
          float heat = clamp(n * 1.6 - uAge * 1.1 + ndv * 0.5, 0.0, 1.0);
          vec3 col = mix(vec3(0.6, 0.05, 0.0), vec3(1.0, 0.45, 0.08), heat); col = mix(col, vec3(1.0, 0.95, 0.75), smoothstep(0.7, 1.0, heat));
          float a = smoothstep(0.0, 0.25, ndv) * (1.0 - uAge) * (0.6 + heat);
          gl_FragColor = vec4(col * uTint * (0.9 + 1.2 * (1.0 - uAge)), a * 0.85); }`,
    });
    this.ringGeo = new THREE.RingGeometry(0.7, 1, 48);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffc080, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.pool = [];
    for (let i = 0; i < max; i++) {
      const fire = new THREE.Mesh(fireGeo, this.fireMat.clone()); fire.visible = false; scene.add(fire);
      const ring = new THREE.Mesh(this.ringGeo, this.ringMat.clone()); ring.visible = false; scene.add(ring);
      this.pool.push({ fire, ring, active: false, age: 0, dur: 1, size: 1 });
    }
    this.light = new THREE.PointLight(0xffa050, 0, 260, 1.6); scene.add(this.light);
    this.flash = 0;
  }
  spawn(p, size = 10, dur = 1.1, tint = null) {
    const e = this.pool.find((x) => !x.active) || this.pool[0];
    e.active = true; e.age = 0; e.dur = dur; e.size = size;
    e.fire.visible = true; e.fire.position.copy(p); e.fire.material.uniforms.uSeed.value = Math.random() * 40;
    e.fire.material.uniforms.uTint.value.set(...(tint || [1, 1, 1]));
    e.ring.visible = true; e.ring.position.copy(p); e.ring.quaternion.random();
    this.light.position.copy(p); this.light.intensity = Math.min(1400, Math.max(this.light.intensity, size * 160)); this.flash = Math.max(this.flash, Math.min(1, size / 22));
    return e;
  }
  update(dt, camera, real = dt) {
    for (const e of this.pool) {
      if (!e.active) continue;
      e.age += dt; const u = e.age / e.dur;
      if (u >= 1) { e.active = false; e.fire.visible = e.ring.visible = false; continue; }
      const grow = 1 - Math.pow(1 - Math.min(1, u * 1.6), 3);
      e.fire.scale.setScalar(e.size * (0.25 + grow) * (1 + u * 0.35)); e.fire.material.uniforms.uAge.value = u;
      const ru = Math.min(1, u * 1.4); e.ring.scale.setScalar(e.size * 0.6 + e.size * 3.2 * (1 - Math.pow(1 - ru, 2.5)));
      e.ring.material.opacity = 0.9 * (1 - ru) * (1 - ru); e.ring.lookAt(camera.position);
    }
    this.light.intensity *= Math.exp(-real * 5); this.flash *= Math.exp(-real * 6);
  }
  dispose() { for (const e of this.pool) { e.fire.material.dispose(); e.ring.material.dispose(); this.scene.remove(e.fire, e.ring); } this.ringGeo.dispose(); this.fireMat.dispose(); this.scene.remove(this.light); }
}

// ---------------------------------------------------------------- beam (laser sweep)
export class Beam {
  constructor(THREE, scene, color = 0xff4020) {
    this.THREE = THREE; this.scene = scene;
    this.group = new THREE.Group(); scene.add(this.group);
    const len = 1;
    const coreGeo = new THREE.CylinderGeometry(1, 1, len, 12, 1, true); coreGeo.translate(0, len / 2, 0); coreGeo.rotateX(Math.PI / 2);
    this.core = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({ color: 0xfff2e0, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.glow = new THREE.Mesh(coreGeo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uPower: { value: 1 } },
      vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV; varying vec2 vUv; void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `precision highp float; varying vec3 vN; varying vec3 vV; varying vec2 vUv; uniform vec3 uColor; uniform float uTime; uniform float uPower;
        void main(){ float f = abs(dot(normalize(vN), normalize(vV))); float a = pow(f, 2.2) * uPower; float pulse = 0.85 + 0.15 * sin(vUv.y * 120.0 - uTime * 60.0); gl_FragColor = vec4(uColor * (1.5 + pulse) * a + vec3(1.0) * pow(f, 12.0) * uPower, a); }`,
    }));
    this.tele = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.group.add(this.core, this.glow, this.tele);
    this.group.visible = false;
    this.state = 'idle'; this.t = 0;
    this.from = new THREE.Vector3(); this.to = new THREE.Vector3();
    this.hitLight = new THREE.PointLight(color, 0, 120, 1.5); scene.add(this.hitLight);
  }
  /** Telegraph for `teleDur`, then fire for `fireDur`. `pathFn(u)` returns target point (u = 0..1 over fire). */
  start(from, pathFn, teleDur = 1.2, fireDur = 1.6) {
    this.pathFn = pathFn; this.teleDur = teleDur; this.fireDur = fireDur; this.t = 0; this.state = 'tele'; this.group.visible = true; this.fromRef = from;
  }
  _aim(radius, mesh) {
    const d = this.to.clone().sub(this.from); const L = d.length();
    mesh.position.copy(this.from); mesh.lookAt(this.to); mesh.scale.set(radius, radius, L);
  }
  update(dt, tNow) {
    if (this.state === 'idle') return;
    this.t += dt;
    this.from.setFromMatrixPosition(this.fromRef.matrixWorld);
    this.glow.material.uniforms.uTime.value = tNow;
    if (this.state === 'tele') {
      const u = this.t / this.teleDur;
      this.to.copy(this.pathFn(0));
      this.tele.visible = true; this.core.visible = this.glow.visible = false;
      const pulse = 0.35 + 0.65 * Math.abs(Math.sin(u * u * 26));
      this.tele.material.opacity = pulse * (0.3 + 0.6 * u); this._aim(0.25 + u * 0.35, this.tele);
      this.hitLight.intensity = 0;
      if (u >= 1) { this.state = 'fire'; this.t = 0; }
    } else if (this.state === 'fire') {
      const u = this.t / this.fireDur;
      this.tele.visible = false; this.core.visible = this.glow.visible = true;
      this.to.copy(this.pathFn(Math.min(1, u)));
      const fade = u > 0.85 ? (1 - u) / 0.15 : 1; const ramp = Math.min(1, u * 8);
      const p = fade * ramp;
      this._aim(1.3 * p + 0.2, this.core); this._aim(5.5 * p + 0.5, this.glow);
      this.glow.material.uniforms.uPower.value = p; this.core.material.opacity = p;
      this.hitLight.position.copy(this.to); this.hitLight.intensity = 60 * p;
      if (u >= 1) { this.state = 'idle'; this.group.visible = false; this.hitLight.intensity = 0; }
    }
  }
  get firing() { return this.state === 'fire'; }
  dispose() { this.scene.remove(this.group, this.hitLight); this.core.geometry.dispose(); this.core.material.dispose(); this.glow.material.dispose(); this.tele.material.dispose(); }
}

// ---------------------------------------------------------------- missiles
export class Missiles {
  constructor(THREE, scene, smoke, explosions, max = 14) {
    this.THREE = THREE; this.scene = scene; this.smoke = smoke; this.explosions = explosions;
    const body = new THREE.CylinderGeometry(0.55, 0.55, 5, 10); body.rotateX(Math.PI / 2);
    const nose = new THREE.ConeGeometry(0.55, 1.6, 10); nose.rotateX(Math.PI / 2); nose.translate(0, 0, 3.3);
    this.mat = new THREE.MeshStandardMaterial({ color: 0xd8dde6, metalness: 0.5, roughness: 0.35 });
    this.noseMat = new THREE.MeshStandardMaterial({ color: 0xb01c22, metalness: 0.4, roughness: 0.4 });
    this.flameMat = new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    this.pool = [];
    for (let i = 0; i < max; i++) {
      const g = new THREE.Group(); g.add(new THREE.Mesh(body, this.mat)); g.add(new THREE.Mesh(nose, this.noseMat));
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.5, 10), this.flameMat); flame.rotation.x = Math.PI / 2; flame.position.z = -4.2; g.add(flame);
      for (const s of [-1, 1]) { const fin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 1.4), this.noseMat); fin.position.set(0, 0, -1.8); fin.rotation.z = s * Math.PI / 4; g.add(fin); }
      g.visible = false; scene.add(g);
      this.pool.push({ g, active: false, v: new THREE.Vector3(), age: 0, life: 4, target: null, turn: 1.2, flame });
    }
    this.onDetonate = null;
  }
  launch(pos, dir, target, { life = 4.2, speed = 30, turn = 1.4 } = {}) {
    const m = this.pool.find((x) => !x.active); if (!m) return null;
    m.active = true; m.age = 0; m.life = life; m.target = target; m.turn = turn; m.speed = speed;
    m.g.visible = true; m.g.position.copy(pos); m.v.copy(dir).normalize().multiplyScalar(speed * 0.6);
    m.g.lookAt(pos.clone().add(dir)); m.wobble = Math.random() * 10;
    return m;
  }
  update(dt, tNow) {
    const THREE = this.THREE; const tmp = new THREE.Vector3();
    for (const m of this.pool) {
      if (!m.active) continue;
      m.age += dt;
      // homing: steer toward target with limited turn rate, accelerate
      if (m.target && m.age > 0.35) {
        tmp.copy(m.target).sub(m.g.position); const dist = tmp.length(); tmp.normalize();
        const cur = m.v.clone().normalize(); const k = Math.min(1, m.turn * dt * (1 + (5 - Math.min(5, dist / 20))));
        cur.lerp(tmp, k).normalize(); m.v.copy(cur).multiplyScalar(Math.min(m.speed * 2.2, m.v.length() + 45 * dt));
        // sideways wobble for character
        m.v.addScaledVector(new THREE.Vector3(Math.sin(tNow * 9 + m.wobble), Math.cos(tNow * 7 + m.wobble), 0), 2.0 * dt * 30);
        if (dist < 5 || m.age > m.life) { this.detonate(m); continue; }
      } else if (m.age > m.life) { this.detonate(m); continue; }
      m.g.position.addScaledVector(m.v, dt);
      m.g.lookAt(m.g.position.clone().add(m.v));
      m.flame.scale.setScalar(0.8 + 0.4 * Math.sin(tNow * 60 + m.wobble));
      if (Math.random() < 0.9) this.smoke.emit(m.g.position.clone().addScaledVector(m.v.clone().normalize(), -3), tmp.set((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3), { life: 1.4 + Math.random(), size: 1.8, grow: 3.5, drag: 1, c0: [0.95, 0.9, 0.85], c1: [0.4, 0.4, 0.45] });
    }
  }
  detonate(m) {
    m.active = false; m.g.visible = false;
    this.explosions.spawn(m.g.position, 7, 0.9);
    this.onDetonate?.(m);
  }
  get activeCount() { return this.pool.filter((m) => m.active).length; }
  dispose() { for (const m of this.pool) this.scene.remove(m.g); this.mat.dispose(); this.noseMat.dispose(); this.flameMat.dispose(); }
}

// ---------------------------------------------------------------- player bolts
export class Bolts {
  constructor(THREE, scene, max = 28, color = 0x7dff5a) {
    this.THREE = THREE; this.scene = scene;
    const geo = new THREE.CapsuleGeometry(0.22, 4.5, 4, 8); geo.rotateX(Math.PI / 2);
    const glowGeo = new THREE.CapsuleGeometry(0.7, 5, 4, 10); glowGeo.rotateX(Math.PI / 2);
    this.coreMat = new THREE.MeshBasicMaterial({ color: 0xf4ffe8 });
    this.glowMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(color) } },
      vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `precision highp float; varying vec3 vN; varying vec3 vV; uniform vec3 uColor; void main(){ float f = pow(max(dot(normalize(vN), normalize(vV)), 0.0), 1.8); gl_FragColor = vec4(uColor * 2.2 * f, f); }`,
    });
    this.pool = [];
    for (let i = 0; i < max; i++) {
      const g = new THREE.Group(); g.add(new THREE.Mesh(geo, this.coreMat)); g.add(new THREE.Mesh(glowGeo, this.glowMat)); g.visible = false; scene.add(g);
      this.pool.push({ g, active: false, v: new THREE.Vector3(), age: 0 });
    }
  }
  fire(pos, dir, speed = 260) {
    const b = this.pool.find((x) => !x.active); if (!b) return;
    b.active = true; b.age = 0; b.g.visible = true; b.g.position.copy(pos); b.v.copy(dir).normalize().multiplyScalar(speed); b.g.lookAt(pos.clone().add(dir));
  }
  /** hitTest(prevPos, pos) -> true if consumed */
  update(dt, hitTest) {
    const prev = new this.THREE.Vector3();
    for (const b of this.pool) {
      if (!b.active) continue;
      b.age += dt; prev.copy(b.g.position); b.g.position.addScaledVector(b.v, dt);
      if (b.age > 1.6 || hitTest(prev, b.g.position, b)) { b.active = false; b.g.visible = false; }
    }
  }
  dispose() { for (const b of this.pool) this.scene.remove(b.g); this.coreMat.dispose(); this.glowMat.dispose(); }
}

// ---------------------------------------------------------------- shield
export function makeShield(THREE, radius = [118, 46, 96]) {
  const geo = new THREE.SphereGeometry(1, 64, 32);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
    uniforms: {
      uTime: { value: 0 }, uDissolve: { value: 0 }, uPower: { value: 1 }, uColor: { value: new THREE.Color(0x46b8ff) },
      uHits: { value: [new THREE.Vector4(0, 0, 0, -10), new THREE.Vector4(0, 0, 0, -10), new THREE.Vector4(0, 0, 0, -10), new THREE.Vector4(0, 0, 0, -10)] },
    },
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV; varying vec3 vW; varying vec3 vL;
      void main(){ vL = position; vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */ `precision highp float; varying vec3 vN; varying vec3 vV; varying vec3 vW; varying vec3 vL;
      uniform float uTime; uniform float uDissolve; uniform float uPower; uniform vec3 uColor; uniform vec4 uHits[4];
      float hexDist(vec2 p){ p = abs(p); return max(dot(p, normalize(vec2(1.0, 1.7320508))), p.x); }
      vec4 hexCoords(vec2 uv){ vec2 r = vec2(1.0, 1.7320508); vec2 h = r * 0.5; vec2 a = mod(uv, r) - h; vec2 b = mod(uv - h, r) - h; vec2 gv = dot(a,a) < dot(b,b) ? a : b; return vec4(gv, uv - gv); }
      float hash2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        vec3 n = normalize(vN); float ndv = abs(dot(n, normalize(vV)));
        // planar-ish hex projection: use the two dominant local axes by normal
        vec3 an = abs(n); vec2 uv = an.z > an.x && an.z > an.y ? vL.xy : (an.x > an.y ? vL.zy : vL.xz);
        vec4 hc = hexCoords(uv * 0.55);
        float edge = smoothstep(0.42, 0.5, hexDist(hc.xy));
        float id = hash2(hc.zw);
        if (id < uDissolve) discard;
        float cellPulse = 0.5 + 0.5 * sin(uTime * 2.0 + id * 6.283);
        float fres = pow(1.0 - ndv, 3.0);
        float ripple = 0.0;
        for (int i = 0; i < 4; i++) { float age = uTime - uHits[i].w; if (age < 0.0 || age > 1.2) continue; float k = 1.0 - age / 1.2; float d = distance(vW, uHits[i].xyz); float r = age * 55.0; ripple += smoothstep(10.0, 0.0, abs(d - r)) * k * 0.9 + smoothstep(22.0, 0.0, d) * k * k * 0.6; }
        ripple = min(ripple, 1.6);
        float dis = smoothstep(uDissolve - 0.08, uDissolve, id) * step(0.001, uDissolve) * 1.2; // cells about to fall flare up
        float a = min(0.9, (fres * 0.9 + edge * (0.10 + 0.08 * cellPulse) + ripple * (0.35 + edge) + dis * (0.3 + edge)) * uPower);
        vec3 col = mix(uColor, vec3(0.85, 0.95, 1.0), ripple * 0.5 + dis * 0.4);
        gl_FragColor = vec4(col * a * 1.6, a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.scale.set(...radius); mesh.renderOrder = 5;
  return mesh;
}

export function makeTextures(THREE, rng) {
  return { soft: softSprite(THREE, false), hard: softSprite(THREE, true), smoke: smokeSprite(THREE, rng) };
}
