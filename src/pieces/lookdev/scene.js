import * as THREE from 'three';
import { buildArwing } from '../ship/arwing.js';
import { makeHeroMaterials } from './hero.js';

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
  // main hull ring: low-poly tube so the facets catch the key light as panels
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 3.4, 8, 12), M.hull);
  ring.rotation.z = Math.PI / 12;
  g.add(ring);
  // inner cobalt rail + blue emitter rim (the gate's "energy lip")
  const rail = new THREE.Mesh(new THREE.TorusGeometry(R - 3.2, 0.9, 6, 48), M.cobalt);
  g.add(rail);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R - 3.9, 0.28, 6, 64), M.emitBlue);
  g.add(rim);
  // 6 pylons: wedge boxes bolted onto the ring, alternating with beacon masts
  const pylonGeo = new THREE.BoxGeometry(5.2, 9, 6.5);
  const pylons = new THREE.InstancedMesh(pylonGeo, M.cobalt, 6);
  const capGeo = new THREE.BoxGeometry(5.6, 1.2, 7);
  const caps = new THREE.InstancedMesh(capGeo, M.dark, 6);
  const tmp = new THREE.Object3D();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    tmp.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
    tmp.rotation.set(0, 0, a - Math.PI / 2);
    tmp.updateMatrix(); pylons.setMatrixAt(i, tmp.matrix);
    tmp.position.set(Math.cos(a) * (R + 5.0), Math.sin(a) * (R + 5.0), 0);
    tmp.updateMatrix(); caps.setMatrixAt(i, tmp.matrix);
  }
  g.add(pylons, caps);
  // beacon lamps (red, pulsing) on every pylon cap, both faces
  const lampGeo = new THREE.SphereGeometry(0.55, 10, 8);
  const lamps = new THREE.InstancedMesh(lampGeo, M.emitRed, 12);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    for (let s = 0; s < 2; s++) {
      tmp.position.set(Math.cos(a) * (R + 5.6), Math.sin(a) * (R + 5.6), s ? 3.6 : -3.6);
      tmp.rotation.set(0, 0, 0); tmp.updateMatrix();
      lamps.setMatrixAt(i * 2 + s, tmp.matrix);
    }
  }
  g.add(lamps);
  // antenna masts on the top pylon, gold caps
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.4, 14, 8), M.dark);
  mast.position.set(0, R + 12, 0); g.add(mast);
  const mastCap = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12), M.gold);
  mastCap.position.set(0, R + 19.2, 0); g.add(mastCap);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(3.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 3), M.hull);
  dish.position.set(0, R + 9, 4.5); dish.rotation.x = -Math.PI / 2 + 0.5; g.add(dish);
  // ventral docking spar: long hull beam below the ring with hazard stripe cubes
  const spar = new THREE.Mesh(new THREE.BoxGeometry(3, 22, 3), M.hull);
  spar.position.set(0, -R - 14, 0); g.add(spar);
  const dock = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5.5, 4, 6), M.gold);
  dock.position.set(0, -R - 26, 0); g.add(dock);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  g.userData.lamps = lamps;
  return g;
}

// ---------------------------------------------------------------------------
// Speed streaks: thin additive lines streaming past the camera along +z.
// ---------------------------------------------------------------------------
function makeStreaks(n = 110) {
  const pos = new Float32Array(n * 2 * 3);
  const col = new Float32Array(n * 2 * 3);
  const seeds = [];
  for (let i = 0; i < n; i++) {
    const x = (Math.random() - 0.5) * 60, y = (Math.random() - 0.5) * 34 + 2, z = -Math.random() * 120;
    const len = 1.5 + Math.random() * 4;
    seeds.push({ x, y, z, len, sp: 60 + Math.random() * 40 });
    pos.set([x, y, z, x, y, z + len], i * 6);
    const b = 0.35 + Math.random() * 0.4;
    col.set([b * 0.7, b * 0.85, b, 0, 0, 0], i * 6);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  lines.update = (dt, boost) => {
    const p = geo.attributes.position.array;
    for (let i = 0; i < n; i++) {
      const s = seeds[i];
      s.z += s.sp * dt * (0.8 + boost * 1.4);
      if (s.z > 20) { s.z = -120 - Math.random() * 30; s.x = (Math.random() - 0.5) * 60; s.y = (Math.random() - 0.5) * 34 + 2; }
      const L = s.len * (0.6 + boost * 2.0);
      mat.opacity = 0.03 + boost * 0.3;
      p[i * 6] = s.x; p[i * 6 + 1] = s.y; p[i * 6 + 2] = s.z;
      p[i * 6 + 3] = s.x; p[i * 6 + 4] = s.y; p[i * 6 + 5] = s.z + L;
    }
    geo.attributes.position.needsUpdate = true;
  };
  lines.disposeStreaks = () => { geo.dispose(); mat.dispose(); };
  return lines;
}

// ---------------------------------------------------------------------------
// Laser bolts: pooled twin green bolts with a hot white core.
// ---------------------------------------------------------------------------
function makeBolts(max = 24) {
  const grp = new THREE.Group();
  const coreGeo = new THREE.CapsuleGeometry(0.07, 1.9, 4, 10);
  coreGeo.rotateX(Math.PI / 2);
  const glowGeo = new THREE.CapsuleGeometry(0.2, 2.1, 4, 10);
  glowGeo.rotateX(Math.PI / 2);
  const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 3.2, 1.8), toneMapped: false });
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 1.6, 0.45), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
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
      tmp.position.copy(b.p).addScaledVector(_fwd.set(0, 0, -1).applyQuaternion(b.q), b.age * 180);
      tmp.quaternion.copy(b.q); tmp.scale.setScalar(1); tmp.updateMatrix();
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
      st.fireCd = 0.12;
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
    streaks.update(dt, st.boost);
  };
  root.pop = () => { st.popT = 0; };
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
