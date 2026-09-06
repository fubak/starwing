// Procedural stylised pilot: helmet, articulated limbs, run/idle/jump/roll animation.
import * as THREE from 'three';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (t) => t * t * (3 - 2 * t);

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05, envMapIntensity: 0.7, ...opts });
}

function capsule(r, len, m, segs = 8) {
  const g = new THREE.CapsuleGeometry(r, len, 4, segs);
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
function box(w, h, d, m) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d, 1, 1, 1), m);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
function rounded(w, h, d, r, m) {
  // rounded box via scaled capsule-ish box: use BoxGeometry with bevel via multiple boxes is heavy; simple approach:
  const shape = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  shape.moveTo(x + r, y); shape.lineTo(x + w - r, y); shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r); shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h); shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(shape, { depth: d - r * 2, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 3, curveSegments: 4 });
  g.translate(0, 0, -(d - r * 2) / 2);
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

export function buildPilot() {
  const M = {
    suit: mat(0xe9edf2, { roughness: 0.5 }),
    jacket: mat(0x2f8f57, { roughness: 0.55 }),
    dark: mat(0x1d2230, { roughness: 0.35, metalness: 0.3 }),
    red: mat(0xd8342c, { roughness: 0.5 }),
    metal: mat(0x9aa4b4, { roughness: 0.25, metalness: 0.9, envMapIntensity: 1.2 }),
    helmet: mat(0xf2f5f8, { roughness: 0.18, metalness: 0.15, envMapIntensity: 1.3 }),
    visor: new THREE.MeshPhysicalMaterial({ color: 0x0a1a2e, roughness: 0.05, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.6, emissive: 0x1c4a80, emissiveIntensity: 0.5 }),
    glow: new THREE.MeshStandardMaterial({ color: 0x66e0ff, emissive: 0x66e0ff, emissiveIntensity: 2.4, roughness: 0.3 }),
    skin: mat(0xd9a56a, { roughness: 0.6 }),
  };

  const root = new THREE.Group();
  const body = new THREE.Group(); // squash/stretch + roll pivot
  root.add(body);
  body.position.y = 0;
  const rollPivot = new THREE.Group(); body.add(rollPivot);
  rollPivot.position.y = 0.9; // roll about waist height
  const hips = new THREE.Group(); rollPivot.add(hips);
  hips.position.y = 0.05; // hips at ~0.95m

  // pelvis
  const pelvis = rounded(0.38, 0.22, 0.28, 0.07, M.dark); pelvis.position.y = 0.02; hips.add(pelvis);
  const belt = box(0.36, 0.05, 0.26, M.metal); belt.position.y = 0.12; hips.add(belt);
  const buckle = box(0.08, 0.06, 0.03, M.glow); buckle.position.set(0, 0.12, 0.135); hips.add(buckle);

  // torso
  const torso = new THREE.Group(); torso.position.y = 0.14; hips.add(torso);
  const chest = rounded(0.46, 0.5, 0.3, 0.09, M.jacket); chest.position.y = 0.27; torso.add(chest);
  const undershirt = rounded(0.22, 0.42, 0.2, 0.05, M.suit); undershirt.position.set(0, 0.24, 0.07); torso.add(undershirt);
  const chestPlate = rounded(0.26, 0.14, 0.06, 0.02, M.metal); chestPlate.position.set(0, 0.34, 0.16); torso.add(chestPlate);
  const chestLamp = box(0.05, 0.03, 0.02, M.glow); chestLamp.position.set(-0.07, 0.36, 0.19); torso.add(chestLamp);
  const backpack = rounded(0.3, 0.36, 0.14, 0.04, M.dark); backpack.position.set(0, 0.24, -0.2); torso.add(backpack);
  const packLight = box(0.12, 0.02, 0.02, M.glow); packLight.position.set(0, 0.35, -0.275); torso.add(packLight);
  // shoulder pads
  for (const s of [-1, 1]) {
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), M.red);
    pad.position.set(s * 0.25, 0.5, 0); pad.castShadow = true; torso.add(pad);
  }
  // scarf / collar
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.045, 8, 16), M.red);
  collar.rotation.x = Math.PI / 2; collar.position.y = 0.55; collar.castShadow = true; torso.add(collar);
  const scarfTail = capsule(0.035, 0.22, M.red); scarfTail.position.set(0.06, 0.42, -0.19); scarfTail.rotation.x = 0.4; torso.add(scarfTail);

  // head + helmet
  const neck = new THREE.Group(); neck.position.y = 0.57; torso.add(neck);
  const head = new THREE.Group(); head.position.y = 0.16; neck.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.19, 24, 18), M.helmet);
  helmet.scale.set(1, 1.05, 1.05); helmet.castShadow = true; head.add(helmet);
  // visor: front slice of sphere
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.175, 24, 16, Math.PI * 0.62, Math.PI * 0.76, Math.PI * 0.33, Math.PI * 0.32), M.visor);
  visor.position.set(0, -0.005, 0.02); visor.scale.set(1.04, 1, 1.06); head.add(visor);
  // visor rim
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.012, 6, 32, Math.PI * 1.05), M.metal);
  rim.rotation.set(Math.PI / 2, 0, -Math.PI * 0.025); rim.position.set(0, 0.05, 0.02); head.add(rim);
  // chin guard
  const chin = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.1, 20, 1, true, Math.PI * 0.5, Math.PI), M.dark);
  chin.position.set(0, -0.12, 0.0); chin.castShadow = true; head.add(chin);
  // ear pieces + antenna
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 16), M.dark);
    ear.rotation.z = Math.PI / 2; ear.position.set(s * 0.19, -0.02, 0); head.add(ear);
    const earGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 12), M.glow);
    earGlow.rotation.z = Math.PI / 2; earGlow.position.set(s * 0.215, -0.02, 0); head.add(earGlow);
  }
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 6), M.metal);
  antenna.position.set(0.19, 0.1, -0.02); antenna.rotation.z = -0.2; head.add(antenna);
  const antTip = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8), M.glow); antTip.position.set(0.205, 0.18, -0.02); head.add(antTip);
  // fin crest
  const crest = box(0.02, 0.08, 0.2, M.red); crest.position.set(0, 0.17, -0.04); head.add(crest);

  // arms
  const arms = {};
  for (const s of [-1, 1]) {
    const name = s < 0 ? 'L' : 'R';
    const shoulder = new THREE.Group(); shoulder.position.set(s * 0.27, 0.48, 0); torso.add(shoulder);
    const upper = capsule(0.065, 0.22, M.jacket); upper.position.y = -0.15; shoulder.add(upper);
    const elbow = new THREE.Group(); elbow.position.y = -0.3; shoulder.add(elbow);
    const fore = capsule(0.055, 0.2, M.suit); fore.position.y = -0.13; elbow.add(fore);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.065, 0.07, 12), M.dark); cuff.position.y = -0.22; cuff.castShadow = true; elbow.add(cuff);
    const hand = rounded(0.09, 0.1, 0.07, 0.025, M.dark); hand.position.y = -0.3; elbow.add(hand);
    arms[name] = { shoulder, elbow, hand };
  }
  // blaster in right hand
  const gun = new THREE.Group(); gun.position.set(0, -0.32, 0.03); arms.R.elbow.add(gun);
  const grip = box(0.04, 0.1, 0.05, M.dark); grip.position.y = 0.0; gun.add(grip);
  const barrel = box(0.05, 0.06, 0.26, M.metal); barrel.position.set(0, 0.06, 0.1); gun.add(barrel);
  const barrelTip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.08, 10), M.dark); barrelTip.rotation.x = Math.PI / 2; barrelTip.position.set(0, 0.06, 0.26); gun.add(barrelTip);
  const gunGlow = box(0.056, 0.02, 0.12, M.glow); gunGlow.position.set(0, 0.075, 0.12); gun.add(gunGlow);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.06, 0.32); gun.add(muzzle);
  const muzzleFlash = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0xaaf6ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  muzzle.add(muzzleFlash);

  // legs
  const legs = {};
  for (const s of [-1, 1]) {
    const name = s < 0 ? 'L' : 'R';
    const hip = new THREE.Group(); hip.position.set(s * 0.11, -0.05, 0); hips.add(hip);
    const thigh = capsule(0.105, 0.28, M.suit); thigh.position.y = -0.2; hip.add(thigh);
    const knee = new THREE.Group(); knee.position.y = -0.42; hip.add(knee);
    const kneePad = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 8), M.dark); kneePad.position.set(0, 0.0, 0.03); kneePad.scale.set(1, 0.9, 0.8); kneePad.castShadow = true; knee.add(kneePad);
    const shin = capsule(0.085, 0.24, M.suit); shin.position.y = -0.18; knee.add(shin);
    const boot = rounded(0.2, 0.15, 0.34, 0.05, M.dark); boot.position.set(0, -0.42, 0.05); knee.add(boot);
    const bootTrim = box(0.17, 0.03, 0.31, M.red); bootTrim.position.set(0, -0.36, 0.05); knee.add(bootTrim);
    const sole = box(0.15, 0.03, 0.29, M.metal); sole.position.set(0, -0.485, 0.05); knee.add(sole);
    legs[name] = { hip, knee };
  }

  // Ground contact: feet bottom at hips.y(0.95) - 0.05 - 0.42 - 0.5 = -0.02 → shift body so feet touch y=0.
  body.position.y = 0.02;

  // --- animation state
  const st = {
    phase: 0, speed: 0, lean: 0, leanV: 0, tilt: 0, tiltV: 0,
    squash: 1, squashV: 0, air: 0, roll: 0, rolling: false, rollT: 0,
    aim: 0, fireFlash: 0, landKick: 0,
  };

  function spring(cur, vel, target, k, d, dt) {
    const a = (target - cur) * k - vel * d;
    vel += a * dt; cur += vel * dt;
    return [cur, vel];
  }

  /**
   * @param dt
   * @param p { speed:0..1, airborne:bool, vy:number, rolling:bool, rollT:0..1, turn:(-1..1), aiming:bool, landed:bool }
   */
  function animate(dt, p) {
    const spd = clamp01(p.speed);
    st.speed = lerp(st.speed, spd, 1 - Math.exp(-dt * 10));
    const stride = 2.8; // Hz at full speed
    st.phase += dt * (1.0 + st.speed * (stride * Math.PI * 2 - 1.0));
    const ph = st.phase;
    const s = st.speed;

    // body lean (anticipation/overshoot spring)
    [st.lean, st.leanV] = spring(st.lean, st.leanV, s * 0.28 + (p.accel ?? 0) * 0.25, 60, 8, dt);
    [st.tilt, st.tiltV] = spring(st.tilt, st.tiltV, -(p.turn ?? 0) * 0.25 * s, 50, 8, dt);
    if (p.landed) st.squashV = -6;
    [st.squash, st.squashV] = spring(st.squash, st.squashV, 1, 220, 12, dt);
    st.air = lerp(st.air, p.airborne ? 1 : 0, 1 - Math.exp(-dt * 12));
    st.fireFlash = Math.max(0, st.fireFlash - dt * 12);

    const idleB = Math.sin(ph * 1.0) * 0.5 + 0.5; // slow-ish breath when idle (phase ≈ 1 rad/s when idle)
    const runBob = Math.abs(Math.sin(ph)) * 0.07 * s;
    const jumpTuck = st.air;

    body.scale.set(1 / Math.sqrt(st.squash), st.squash, 1 / Math.sqrt(st.squash));
    hips.position.y = 0.05 + runBob + (1 - s) * idleB * 0.01 - jumpTuck * 0.08;
    hips.rotation.x = st.lean * 0.5 + jumpTuck * 0.15;
    hips.rotation.z = Math.sin(ph) * 0.05 * s + st.tilt * 0.3;
    hips.rotation.y = Math.sin(ph) * 0.12 * s;
    torso.rotation.x = st.lean * 0.6 - jumpTuck * 0.1;
    torso.rotation.y = -Math.sin(ph) * 0.18 * s;
    torso.rotation.z = st.tilt * 0.6;
    neck.rotation.x = -st.lean * 0.9 + (1 - s) * Math.sin(ph * 0.7) * 0.03;
    head.rotation.y = (1 - s) * Math.sin(ph * 0.5) * 0.25 + (p.turn ?? 0) * 0.3 * s;
    head.rotation.z = -st.tilt * 0.5;

    // legs
    for (const [name, sgn] of [['L', 1], ['R', -1]]) {
      const leg = legs[name];
      const a = ph + (sgn < 0 ? Math.PI : 0);
      const swing = Math.sin(a);
      const lift = Math.max(0, Math.sin(a + Math.PI * 0.5)); // knee bend when leg is passing under/behind
      const runHip = swing * 0.85;
      const runKnee = Math.max(0.05, lift * 1.5 * (0.6 + 0.4 * Math.max(0, -swing)));
      const idleHip = 0.02 * sgn;
      const idleKnee = 0.06;
      const jumpHip = sgn > 0 ? -0.9 : -0.3;
      const jumpKnee = sgn > 0 ? 1.7 : 0.9;
      leg.hip.rotation.x = lerp(lerp(idleHip, runHip, s), jumpHip, jumpTuck);
      leg.knee.rotation.x = lerp(lerp(idleKnee, runKnee, s), jumpKnee, jumpTuck);
    }
    // arms
    const aim = p.aiming ? 1 : 0;
    st.aim = lerp(st.aim, aim, 1 - Math.exp(-dt * 14));
    for (const [name, sgn] of [['L', 1], ['R', -1]]) {
      const arm = arms[name];
      const a = ph + (sgn < 0 ? 0 : Math.PI); // opposite to same-side leg
      const swing = Math.sin(a);
      const runSh = swing * 0.9 - 0.3;
      const runEl = -(0.9 + Math.max(0, swing) * 0.7);
      const idleSh = 0.1 + Math.sin(ph * 0.7) * 0.03;
      const idleEl = -0.25;
      const jumpSh = -1.4 + (sgn > 0 ? -0.5 : 0.2);
      const jumpEl = -0.5;
      let shX = lerp(lerp(idleSh, runSh, s), jumpSh, jumpTuck);
      let elX = lerp(lerp(idleEl, runEl, s), jumpEl, jumpTuck);
      let shZ = -sgn * (0.14 + s * 0.08);
      if (name === 'R') {
        // aim pose: right arm forward
        shX = lerp(shX, -1.45, st.aim);
        elX = lerp(elX, -0.15 + st.fireFlash * 0.35, st.aim);
        shZ = lerp(shZ, 0.02, st.aim);
      }
      arm.shoulder.rotation.x = shX;
      arm.shoulder.rotation.z = shZ;
      arm.elbow.rotation.x = elX;
    }
    // roll: rotate the body around its pivot, tuck limbs
    if (p.rolling) {
      const t = clamp01(p.rollT);
      const e = smooth(t);
      rollPivot.rotation.x = e * Math.PI * 2;
      const tuck = Math.sin(t * Math.PI);
      for (const name of ['L', 'R']) {
        legs[name].hip.rotation.x = lerp(legs[name].hip.rotation.x, -1.6, tuck);
        legs[name].knee.rotation.x = lerp(legs[name].knee.rotation.x, 2.3, tuck);
        arms[name].shoulder.rotation.x = lerp(arms[name].shoulder.rotation.x, -2.2, tuck);
        arms[name].elbow.rotation.x = lerp(arms[name].elbow.rotation.x, -2.0, tuck);
      }
      neck.rotation.x = lerp(neck.rotation.x, 0.9, tuck);
      hips.position.y -= tuck * 0.25;
    } else {
      rollPivot.rotation.x = 0;
    }
    muzzleFlash.material.opacity = st.fireFlash;
    muzzleFlash.scale.setScalar(0.6 + st.fireFlash * 1.2);
  }

  function fire() { st.fireFlash = 1; }

  return { root, animate, fire, muzzle, materials: M, head };
}
