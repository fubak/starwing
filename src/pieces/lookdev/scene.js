import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildArwing } from '../ship/arwing.js';
import { makeHeroMaterials } from './hero.js';

// ---------------------------------------------------------------------------
// Sky-rim: a fresnel edge light in the sky colour injected into the standard
// PBR shader, so hardware silhouettes separate from the background the way
// Star Fox Zero's hulls do. uRim is shared so the look can re-tint it.
// ---------------------------------------------------------------------------
const RIM = { uRimColor: { value: new THREE.Color(0.35, 0.6, 1.0) }, uRimK: { value: 0.55 } };
function withRim(mat) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = RIM.uRimColor;
    shader.uniforms.uRimK = RIM.uRimK;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor; uniform float uRimK;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float rimF = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), 3.2);
          totalEmissiveRadiance += uRimColor * rimF * uRimK; }`);
  };
  mat.customProgramCacheKey = () => 'lookdev-rim';
  return mat;
}
// bevelled box so every edge catches a specular line instead of reading as a flat slab
const bevelBox = (w, h, d, r = 0.35) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, Math.min(w, h, d) * 0.45));

/**
 * Cinematic hero moment for the look reference: a three-ship Arwing flight
 * banking in low orbit toward a Cornerian orbital gate, sun rising over the
 * planet limb. Everything here is a *subject* for the look (lighting rig, ACES,
 * bloom, grade, sky) — the rig itself lives in look.js.
 *
 * makeHeroScene() -> Group with .update(dt, t, camera, input), .lead (Arwing
 * handle), .pop(), .disposeScene()
 */

// ---------------------------------------------------------------------------
// Orbital gate: a chunky 12-segment hull ring with cobalt pylons, a blue
// energy rim, red beacons and a spine of antenna masts.
// ---------------------------------------------------------------------------
function makeGate(M) {
  const g = new THREE.Group();
  g.name = 'corneria-gate';
  const R = 38;
  const SEG = 12;
  const tmp = new THREE.Object3D();
  // hull: 12 chunky armour segments (chords, not a smooth tube) with visible
  // gaps so the silhouette reads as built hardware. Bevelled by a slightly
  // smaller dark inner block so every segment has a dark seam.
  const chord = 2 * R * Math.sin(Math.PI / SEG);
  const segGeo = bevelBox(chord - 1.6, 4.6, 5.4, 0.5);
  const segs = new THREE.InstancedMesh(segGeo, M.hull, SEG);
  const innerGeo = bevelBox(chord - 0.4, 3.2, 3.2, 0.3);
  const inners = new THREE.InstancedMesh(innerGeo, M.dark, SEG);
  for (let i = 0; i < SEG; i++) {
    const a = (i / SEG) * Math.PI * 2 + Math.PI / SEG;
    tmp.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
    tmp.rotation.set(0, 0, a + Math.PI / 2);
    tmp.updateMatrix(); segs.setMatrixAt(i, tmp.matrix);
    tmp.position.set(Math.cos(a) * (R - 0.6), Math.sin(a) * (R - 0.6), 0);
    tmp.updateMatrix(); inners.setMatrixAt(i, tmp.matrix);
  }
  g.add(segs, inners);
  // inner cobalt rail + blue emitter lips on both faces (the gate's energy channel)
  const rail = new THREE.Mesh(new THREE.TorusGeometry(R - 3.4, 1.1, 8, 72), M.cobalt);
  g.add(rail);
  for (const z of [-1.5, 1.5]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R - 3.9, 0.32, 6, 96), M.emitBlue);
    rim.position.z = z; g.add(rim);
  }
  const rimIn = new THREE.Mesh(new THREE.TorusGeometry(R - 4.6, 0.22, 6, 96), M.emitBlue);
  g.add(rimIn);
  // 4 major pylons (cardinal) : cobalt wedge + white cowl + gold clamp; 4 minor
  // strut blocks between them
  const pylonGeo = bevelBox(6.4, 10, 7.6, 0.6);
  const pylons = new THREE.InstancedMesh(pylonGeo, M.cobalt, 4);
  const cowlGeo = bevelBox(7.2, 3.2, 8.4, 0.5);
  const cowls = new THREE.InstancedMesh(cowlGeo, M.hull, 4);
  const clampGeo = bevelBox(7.6, 0.8, 8.8, 0.25);
  const clamps = new THREE.InstancedMesh(clampGeo, M.gold, 4);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    tmp.rotation.set(0, 0, a - Math.PI / 2);
    tmp.position.set(Math.cos(a) * (R + 1.5), Math.sin(a) * (R + 1.5), 0);
    tmp.updateMatrix(); pylons.setMatrixAt(i, tmp.matrix);
    tmp.position.set(Math.cos(a) * (R + 7.2), Math.sin(a) * (R + 7.2), 0);
    tmp.updateMatrix(); cowls.setMatrixAt(i, tmp.matrix);
    tmp.position.set(Math.cos(a) * (R + 5.3), Math.sin(a) * (R + 5.3), 0);
    tmp.updateMatrix(); clamps.setMatrixAt(i, tmp.matrix);
  }
  const capGeo = bevelBox(3.4, 2.2, 6.6, 0.4);
  const caps = new THREE.InstancedMesh(capGeo, M.dark, 4);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    tmp.rotation.set(0, 0, a - Math.PI / 2);
    tmp.position.set(Math.cos(a) * (R + 3.0), Math.sin(a) * (R + 3.0), 0);
    tmp.updateMatrix(); caps.setMatrixAt(i, tmp.matrix);
  }
  g.add(pylons, cowls, clamps, caps);
  // beacon lamps (red, pulsing) on every pylon cap, both faces
  const lampGeo = new THREE.SphereGeometry(0.6, 10, 8);
  const lamps = new THREE.InstancedMesh(lampGeo, M.emitRed, 8);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    for (let s = 0; s < 2; s++) {
      tmp.position.set(Math.cos(a) * (R + 8.9), Math.sin(a) * (R + 8.9), s ? 3.2 : -3.2);
      tmp.rotation.set(0, 0, 0); tmp.updateMatrix();
      lamps.setMatrixAt(i * 2 + s, tmp.matrix);
    }
  }
  g.add(lamps);
  // antenna masts on the top pylon, gold caps
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.45, 14, 8), M.dark);
  mast.position.set(0, R + 11, 0); g.add(mast);
  const mastCap = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12), M.gold);
  mastCap.position.set(0, R + 18.2, 0); g.add(mastCap);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(3.4, 24, 12, 0, Math.PI * 2, 0, Math.PI / 3), M.hull);
  dish.position.set(0, R + 8, 5.5); dish.rotation.x = -Math.PI / 2 + 0.5; g.add(dish);
  // ventral docking spar: long hull beam below the ring with a hex dock
  const spar = new THREE.Mesh(bevelBox(3, 22, 3, 0.4), M.hull);
  spar.position.set(0, -R - 14, 0); g.add(spar);
  const sparRib = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.2, 4.2), M.cobalt);
  sparRib.position.set(0, -R - 10, 0); g.add(sparRib);
  const dock = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5.5, 4, 6), M.gold);
  dock.position.set(0, -R - 26, 0); g.add(dock);
  const dockGlow = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.6, 6), M.emitBlue);
  dockGlow.position.set(0, -R - 28.3, 0); g.add(dockGlow);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  g.userData.lamps = lamps;
  return g;
}

// ---------------------------------------------------------------------------
// Speed streaks: thin additive lines streaming past the camera along +z.
// ---------------------------------------------------------------------------
// Instanced soft quads (not GL lines): tapered along their length and feathered
// across their width, so boost reads as glowing air streaks, not film scratches.
function makeStreaks(n = 48) {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.translate(0, 0.5, 0); // origin at the head, extends along +y (we rotate y->z)
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uOpacity: { value: 0 }, uCol: { value: new THREE.Color(0.55, 0.75, 1.0) } },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying float vB;
      void main() { vUv = uv; vB = instanceColor.r; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying float vB; uniform float uOpacity; uniform vec3 uCol;
      void main() {
        float across = 1.0 - abs(vUv.x - 0.5) * 2.0; across *= across;
        float along = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y));
        float a = across * along * uOpacity * vB;
        gl_FragColor = vec4(uCol * (0.6 + 0.8 * (1.0 - vUv.y)) * a, a);
      }`,
  });
  mat.toneMapped = false;
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.frustumCulled = false;
  const seeds = [];
  const tmp = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    seeds.push({ x: (Math.random() - 0.5) * 70, y: (Math.random() - 0.5) * 40 + 2, z: -Math.random() * 140, len: 3 + Math.random() * 5, sp: 90 + Math.random() * 60, w: 0.22 + Math.random() * 0.3 });
    mesh.setColorAt(i, new THREE.Color(0.4 + Math.random() * 0.6, 0, 0));
  }
  const camLocal = new THREE.Vector3();
  mesh.update = (dt, boost, camera) => {
    mat.uniforms.uOpacity.value = Math.max(0, boost - 0.08) * 0.9;
    mesh.visible = boost > 0.09;
    if (!mesh.visible) return;
    if (camera) camLocal.copy(camera.position); else camLocal.set(0, 3, 19);
    for (let i = 0; i < n; i++) {
      const s = seeds[i];
      s.z += s.sp * dt * (0.6 + boost * 1.6);
      if (s.z > 24) { s.z = -140 - Math.random() * 40; s.x = (Math.random() - 0.5) * 70; s.y = (Math.random() - 0.5) * 40 + 2; }
      const L = s.len * (0.5 + boost * 1.6);
      // width axis: perpendicular to z and to the camera->streak offset, so the
      // quad always faces the camera about the travel axis
      const dx = s.x - camLocal.x, dy = s.y - camLocal.y;
      const ang = Math.atan2(dy, dx) + Math.PI / 2;
      tmp.position.set(s.x, s.y, s.z);
      tmp.rotation.set(-Math.PI / 2, 0, ang, 'ZXY'); // plane's +y -> +z (tail behind head), roll about z toward camera
      tmp.scale.set(s.w, L, 1);
      tmp.updateMatrix(); mesh.setMatrixAt(i, tmp.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  mesh.disposeStreaks = () => { geo.dispose(); mat.dispose(); };
  return mesh;
}

// ---------------------------------------------------------------------------
// Laser bolts: pooled twin green bolts with a hot white core.
// ---------------------------------------------------------------------------
function makeBolts(max = 24) {
  const grp = new THREE.Group();
  // long white-hot core + a tight saturated sheath with a hard edge: reads as
  // a crisp Star Fox bolt, not a soft blob. The sheath is a stretched capsule
  // whose alpha is flat inside and drops sharply at the silhouette.
  const coreGeo = new THREE.CapsuleGeometry(0.11, 5.2, 4, 12);
  coreGeo.rotateX(Math.PI / 2);
  const glowGeo = new THREE.CapsuleGeometry(0.3, 5.4, 4, 16);
  glowGeo.rotateX(Math.PI / 2);
  const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 6.0, 3.4), toneMapped: false });
  const glowMat = new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    uniforms: { uCol: { value: new THREE.Color(0.25, 1.6, 0.4) } },
    vertexShader: /* glsl */ `
      varying float vF;
      void main() {
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        vec3 n = normalize(mat3(modelViewMatrix * instanceMatrix) * normal);
        vF = max(dot(n, normalize(-mv.xyz)), 0.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `varying float vF; uniform vec3 uCol;
      void main() { float a = smoothstep(0.05, 0.45, vF); gl_FragColor = vec4(uCol * (0.9 + 1.4 * vF) * a, a); }`,
  });
  glowMat.toneMapped = false;
  const core = new THREE.InstancedMesh(coreGeo, coreMat, max);
  const glow = new THREE.InstancedMesh(glowGeo, glowMat, max);
  core.frustumCulled = glow.frustumCulled = false;
  grp.add(glow, core);
  const live = [];
  const tmp = new THREE.Object3D();
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < max; i++) { core.setMatrixAt(i, hide); glow.setMatrixAt(i, hide); }
  let head = 0;
  grp.fire = (p, q) => {
    const i = head; head = (head + 1) % max;
    const idx = live.findIndex((b) => b.i === i); if (idx >= 0) live.splice(idx, 1);
    live.push({ i, p: p.clone(), q: q.clone(), age: 0 });
  };
  grp.update = (dt) => {
    for (let k = live.length - 1; k >= 0; k--) {
      const b = live[k];
      b.age += dt;
      tmp.position.copy(b.p).addScaledVector(_fwd.set(0, 0, -1).applyQuaternion(b.q), b.age * 220 + 1.5);
      // stretch as it accelerates away (anticipation: short at the muzzle, long in flight)
      const st = 0.45 + Math.min(1, b.age * 5) * 0.55;
      tmp.quaternion.copy(b.q); tmp.scale.set(1, 1, st); tmp.updateMatrix();
      if (b.age > 1.4) { live.splice(k, 1); core.setMatrixAt(b.i, hide); glow.setMatrixAt(b.i, hide); continue; }
      core.setMatrixAt(b.i, tmp.matrix); glow.setMatrixAt(b.i, tmp.matrix);
    }
    core.instanceMatrix.needsUpdate = glow.instanceMatrix.needsUpdate = true;
  };
  grp.disposeBolts = () => { coreGeo.dispose(); glowGeo.dispose(); coreMat.dispose(); glowMat.dispose(); };
  return grp;
}
const _fwd = new THREE.Vector3();

// ---------------------------------------------------------------------------
export function makeHeroScene() {
  const M = makeHeroMaterials();
  for (const k of ['hull', 'cobalt', 'cobaltDS', 'gold', 'dark']) withRim(M[k]);
  const root = new THREE.Group();
  root.name = 'lookdev-hero-scene';

  // ---- flight: lead + two wingmen (Star Fox delta formation)
  const lead = buildArwing();
  lead.group.position.set(0, 0, 0);
  root.add(lead.group);
  const wing = [];
  for (const [x, y, z, ph] of [[-16, 2.2, -26, 1.7], [15.5, -3.6, -30, 3.9]]) {
    const w = buildArwing();
    w.group.position.set(x, y, z);
    w.group.userData.home = new THREE.Vector3(x, y, z);
    w.group.userData.ph = ph;
    w.setThrust(0.7);
    root.add(w.group); wing.push(w);
  }

  // ---- gate ahead, framed against the sun
  const gate = makeGate(M);
  const GATE_Z0 = -760, GATE_Z1 = 60, GATE_PERIOD = 18;
  gate.position.set(26, 14, GATE_Z0);
  gate.rotation.y = 0.12;
  root.add(gate);

  // ---- second, distant gate for depth (silhouette)
  const gate2 = makeGate(M);
  gate2.position.set(-420, 120, -1500);
  gate2.scale.setScalar(2.6);
  gate2.rotation.y = -0.7;
  root.add(gate2);

  const streaks = makeStreaks();
  root.add(streaks);
  const bolts = makeBolts();
  root.add(bolts);

  // muzzle flash light
  const flashLight = new THREE.PointLight(0x5aff7a, 0, 12, 2);
  lead.group.add(flashLight);

  // ---- state
  const st = {
    x: 0, y: 0, vx: 0, vy: 0,          // lead lateral offset (spring)
    bank: 0, pitch: 0,
    boost: 0, gateT: 0, popT: 10, flash: 0, fireCd: 0,
  };
  const spring = (x, v, target, dt, k, c) => { const a = (target - x) * k - v * c; v += a * dt; x += v * dt; return [x, v]; };
  const popCurve = (t) => (t < 0.1 ? 1 - 0.06 * Math.sin((Math.PI * t) / 0.1) : 1 + 0.12 * Math.exp(-(t - 0.1) * 5.5) * Math.sin((t - 0.1) * 17));
  const mz = new THREE.Vector3(); const mq = new THREE.Quaternion();

  root.update = (dt, t, camera, input) => {
    const ax = input?.axes.x ?? 0, ay = input?.axes.y ?? 0;
    const firing = input?.isHeld?.('fire') ?? false;
    const boostHeld = input?.isHeld?.('boost') ?? false;
    st.popT += dt;
    const pop = popCurve(st.popT);

    // lead ship: lateral spring with overshoot, bank follows velocity + stick
    [st.x, st.vx] = spring(st.x, st.vx, ax * 5.5, dt, 22, 5.2);
    [st.y, st.vy] = spring(st.y, st.vy, -ay * 3.0, dt, 22, 5.6);
    const bankT = THREE.MathUtils.clamp(ax * 0.85 + st.vx * 0.06, -1, 1);
    lead.setBank(bankT);
    lead.flap(boostHeld ? -0.6 : Math.abs(ax) * 0.4);
    st.boost += ((boostHeld ? 1 : 0) - st.boost) * Math.min(1, dt * 4);
    lead.setThrust(0.55 + st.boost * 0.45 + Math.abs(ax) * 0.1);
    lead.group.position.set(st.x, st.y + Math.sin(t * 0.9) * 0.25, 0);
    lead.group.rotation.set(-st.vy * 0.04 + st.y * 0.02, -st.vx * 0.035, 0);
    lead.group.scale.setScalar(pop);
    lead.update(dt, t, camera);

    // wingmen: hold formation with lag + their own little bob, mirror the bank softly
    for (let i = 0; i < wing.length; i++) {
      const w = wing[i], h = w.group.userData.home, ph = w.group.userData.ph;
      w.group.position.set(
        h.x + st.x * 0.55 + Math.sin(t * 0.7 + ph) * 0.6,
        h.y + st.y * 0.5 + Math.sin(t * 1.1 + ph) * 0.5,
        h.z + Math.sin(t * 0.5 + ph) * 2.5 - st.boost * 6,
      );
      w.setBank(bankT * 0.7 + Math.sin(t * 0.6 + ph) * 0.12);
      w.setThrust(0.6 + st.boost * 0.35);
      w.update(dt, t, camera);
    }

    // gate: approaches, we fly through, then it respawns far ahead (12 s loop)
    st.gateT = (t / GATE_PERIOD) % 1;
    // ease-in approach: reads as constant closing speed with perspective
    gate.position.z = GATE_Z0 + (GATE_Z1 - GATE_Z0) * (st.gateT * 0.7 + st.gateT * st.gateT * 0.3);
    gate.rotation.z = t * 0.03;
    gate2.rotation.z = -t * 0.015;
    const lampPulse = 1.8 + 1.2 * Math.max(0, Math.sin(t * 3.2));
    M.emitRed.emissiveIntensity = lampPulse * (1 + (pop - 1) * 3);
    M.emitBlue.emissiveIntensity = 2.0 * (0.9 + 0.1 * Math.sin(t * 2.3 + 1)) * (1 + (pop - 1) * 3);

    // lasers: twin bolts every 0.12 s while fire held
    st.fireCd -= dt;
    if (firing && st.fireCd <= 0) {
      st.fireCd = 0.11;
      lead.group.getWorldQuaternion(mq);
      for (const m of lead.muzzles) {
        mz.copy(m).applyQuaternion(lead.rig.quaternion);
        lead.group.localToWorld(mz);
        bolts.fire(mz, mq.clone().multiply(lead.rig.quaternion));
      }
      st.flash = 1;
    }
    st.flash = Math.max(0, st.flash - dt * 9);
    flashLight.intensity = st.flash * 6;
    flashLight.position.set(0, -0.3, -1.6);
    bolts.update(dt);
    streaks.update(dt, st.boost, camera);
  };
  root.pop = () => { st.popT = 0; };
  /** Tint the fresnel edge light (call with the current sky horizon colour). */
  root.setRim = (color, k = 0.55) => { RIM.uRimColor.value.copy(color); RIM.uRimK.value = k; };
  root.lead = lead;
  root.wing = wing;
  root.gate = gate;
  root.state = st;
  root.materials = M;
  root.disposeScene = () => {
    lead.dispose(); for (const w of wing) w.dispose();
    gate.traverse((o) => o.geometry?.dispose?.()); gate2.traverse((o) => o.geometry?.dispose?.());
    streaks.disposeStreaks(); bolts.disposeBolts();
    for (const m of Object.values(M)) { m.map?.dispose(); m.roughnessMap?.dispose(); m.dispose(); }
  };
  return root;
}
