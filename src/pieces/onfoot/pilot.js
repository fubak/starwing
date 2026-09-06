// Procedural stylised pilot: Fox-style vulpine head (fur, muzzle, ears, green eyes,
// comm headset), flight jacket + flak vest, articulated limbs, tail, and
// run/idle/jump/roll animation with anticipation/overshoot springs.
import * as THREE from 'three';
import { makeFurTexture, makeFabricTexture } from './textures.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (t) => t * t * (3 - 2 * t);

/** Stylised rim (fresnel) light injected into a standard material — reads as a
 *  Nintendo-style backlight edge so the character pops from the dark hangar. */
function addRim(m, color = 0x7fc8ff, strength = 0.55, power = 3.0) {
  m.userData.rim = { color: new THREE.Color(color), strength, power };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = { value: m.userData.rim.color };
    shader.uniforms.uRimStrength = { value: m.userData.rim.strength };
    shader.uniforms.uRimPower = { value: m.userData.rim.power };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor; uniform float uRimStrength; uniform float uRimPower;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float rf = pow(1.0 - saturate(dot(normalize(vViewPosition), normal)), uRimPower);
          totalEmissiveRadiance += uRimColor * rf * uRimStrength; }`);
  };
  m.customProgramCacheKey = () => 'rim';
  return m;
}

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
function sphere(r, m, ws = 16, hs = 12) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), m);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
function rounded(w, h, d, r, m) {
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
  const furTex = makeFurTexture('#d9782a', '#a84e14'), furWhiteTex = makeFurTexture('#f4efe6', '#cfc4b4');
  const fabric = makeFabricTexture();
  const M = {
    fur: addRim(mat(0xffffff, { map: furTex, roughness: 0.92, metalness: 0.0, envMapIntensity: 0.35 }), 0xffb070, 0.35, 2.6),
    furWhite: addRim(mat(0xffffff, { map: furWhiteTex, roughness: 0.9, metalness: 0.0, envMapIntensity: 0.35 }), 0xbfe0ff, 0.3, 2.6),
    pants: addRim(mat(0xdfe3ea, { map: fabric, roughness: 0.75, metalness: 0.0 }), 0x7fc8ff, 0.4, 3.0),
    jacket: addRim(mat(0x2e8a54, { map: fabric, roughness: 0.7, metalness: 0.0 }), 0x9fe0c0, 0.45, 3.0),
    vest: addRim(mat(0xf2f4f7, { map: fabric, roughness: 0.6, metalness: 0.02 }), 0x9fd8ff, 0.5, 3.0),
    dark: addRim(mat(0x1d2230, { roughness: 0.35, metalness: 0.3 }), 0x6fa8ff, 0.5, 3.0),
    red: addRim(mat(0xd8342c, { roughness: 0.5 }), 0xff9080, 0.4, 3.0),
    metal: mat(0x9aa4b4, { roughness: 0.25, metalness: 0.9, envMapIntensity: 1.2 }),
    eyeWhite: mat(0xf6fbff, { roughness: 0.15, metalness: 0.0, envMapIntensity: 1.0 }),
    iris: mat(0x2ecf6a, { roughness: 0.1, emissive: 0x0d6b2c, emissiveIntensity: 0.8 }),
    pupil: mat(0x06080c, { roughness: 0.05 }),
    nose: mat(0x1a1214, { roughness: 0.25, metalness: 0.1 }),
    visorGlass: new THREE.MeshPhysicalMaterial({ color: 0x3aff9a, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55, emissive: 0x1fbf5a, emissiveIntensity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
    glow: new THREE.MeshStandardMaterial({ color: 0x66e0ff, emissive: 0x66e0ff, emissiveIntensity: 2.4, roughness: 0.3 }),
  };

  const root = new THREE.Group();
  const body = new THREE.Group(); // squash/stretch + roll pivot
  root.add(body);
  const rollPivot = new THREE.Group(); body.add(rollPivot);
  rollPivot.position.y = 0.9; // roll about waist height
  const hips = new THREE.Group(); rollPivot.add(hips);
  hips.position.y = 0.05; // hips at ~0.95m

  // pelvis + belt
  const pelvis = rounded(0.38, 0.22, 0.28, 0.07, M.pants); pelvis.position.y = 0.02; hips.add(pelvis);
  const belt = box(0.36, 0.05, 0.26, M.dark); belt.position.y = 0.12; hips.add(belt);
  const buckle = box(0.08, 0.06, 0.03, M.metal); buckle.position.set(0, 0.12, 0.135); hips.add(buckle);
  const holster = rounded(0.08, 0.16, 0.1, 0.02, M.dark); holster.position.set(-0.2, -0.02, 0.02); hips.add(holster);

  // tail (three segments, animated)
  const tailRoot = new THREE.Group(); tailRoot.position.set(0, 0.0, -0.14); hips.add(tailRoot);
  const tailSegs = [];
  { let parent = tailRoot;
    for (let i = 0; i < 3; i++) {
      const seg = new THREE.Group(); parent.add(seg); if (i > 0) seg.position.z = -0.17;
      const r = i === 2 ? 0.075 : 0.09 - i * 0.005;
      const m = sphere(r, i === 2 ? M.furWhite : M.fur, 12, 10); m.scale.set(1, 1, 1.4); m.position.z = -0.1; seg.add(m);
      tailSegs.push(seg); parent = seg;
    } }

  // torso: jacket, white flak vest, chest rig
  const torso = new THREE.Group(); torso.position.y = 0.14; hips.add(torso);
  const chest = rounded(0.46, 0.5, 0.3, 0.09, M.jacket); chest.position.y = 0.27; torso.add(chest);
  const vest = rounded(0.4, 0.4, 0.34, 0.06, M.vest); vest.position.set(0, 0.3, 0.0); torso.add(vest);
  const vestSeam = box(0.03, 0.34, 0.02, M.dark); vestSeam.position.set(0, 0.3, 0.175); torso.add(vestSeam);
  const chestPlate = rounded(0.16, 0.1, 0.05, 0.02, M.metal); chestPlate.position.set(-0.1, 0.34, 0.18); torso.add(chestPlate);
  const chestLamp = box(0.05, 0.03, 0.02, M.glow); chestLamp.position.set(-0.1, 0.36, 0.205); torso.add(chestLamp);
  const backpack = rounded(0.3, 0.36, 0.14, 0.04, M.dark); backpack.position.set(0, 0.24, -0.2); torso.add(backpack);
  const packLight = box(0.12, 0.02, 0.02, M.glow); packLight.position.set(0, 0.35, -0.275); torso.add(packLight);
  // shoulder pads
  for (const s of [-1, 1]) {
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), M.red);
    pad.position.set(s * 0.25, 0.5, 0); pad.castShadow = true; torso.add(pad);
  }
  // scarf collar + tails
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.05, 8, 16), M.red);
  collar.rotation.x = Math.PI / 2; collar.position.y = 0.55; collar.castShadow = true; torso.add(collar);
  const scarfTail = capsule(0.035, 0.24, M.red); scarfTail.position.set(0.06, 0.4, -0.2); scarfTail.rotation.x = 0.4; torso.add(scarfTail);
  const scarfTail2 = capsule(0.03, 0.18, M.red); scarfTail2.position.set(-0.03, 0.42, -0.21); scarfTail2.rotation.x = 0.6; torso.add(scarfTail2);

  // ---- head: Fox McCloud-style vulpine head
  const neck = new THREE.Group(); neck.position.y = 0.57; torso.add(neck);
  const neckFur = sphere(0.075, M.fur, 12, 8); neckFur.position.y = 0.05; neck.add(neckFur);
  const head = new THREE.Group(); head.position.y = 0.16; neck.add(head);
  const cranium = sphere(0.17, M.fur, 24, 18); cranium.scale.set(1.0, 0.98, 1.06); head.add(cranium);
  // cheek / jaw fur (white), muzzle, nose
  for (const s of [-1, 1]) { const cheek = sphere(0.085, M.furWhite, 14, 10); cheek.position.set(s * 0.085, -0.055, 0.09); cheek.scale.set(1.0, 0.85, 1.0); head.add(cheek); }
  const muzzle = sphere(0.075, M.furWhite, 14, 10); muzzle.position.set(0, -0.055, 0.16); muzzle.scale.set(1.15, 0.8, 1.45); head.add(muzzle);
  const nose = sphere(0.028, M.nose, 10, 8); nose.position.set(0, -0.035, 0.265); nose.scale.set(1.2, 0.9, 1); head.add(nose);
  const mouth = box(0.05, 0.008, 0.02, M.nose); mouth.position.set(0, -0.09, 0.245); head.add(mouth);
  // eyes: whites, green irises, pupils, brow ridges
  for (const s of [-1, 1]) {
    const eyeG = new THREE.Group(); eyeG.position.set(s * 0.068, 0.02, 0.135); eyeG.rotation.y = s * 0.35; head.add(eyeG);
    const white = sphere(0.04, M.eyeWhite, 14, 10); white.scale.set(1.0, 1.25, 0.55); eyeG.add(white);
    const iris = sphere(0.022, M.iris, 12, 8); iris.position.z = 0.02; iris.scale.set(1, 1.25, 0.5); eyeG.add(iris);
    const pupil = sphere(0.011, M.pupil, 8, 6); pupil.position.z = 0.03; pupil.scale.set(1, 1.6, 0.4); eyeG.add(pupil);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.044, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), M.fur); lid.position.set(0, 0.005, 0); lid.scale.set(1.0, 1.25, 0.6); lid.rotation.x = -0.25; eyeG.add(lid);
    const brow = box(0.06, 0.012, 0.02, M.nose); brow.position.set(0, 0.06, 0.0); brow.rotation.z = -s * 0.2; eyeG.add(brow);
  }
  // ears (outer orange cone, inner dark cone, white tuft)
  const ears = [];
  for (const s of [-1, 1]) {
    const ear = new THREE.Group(); ear.position.set(s * 0.095, 0.15, -0.02); ear.rotation.z = -s * 0.28; ear.rotation.x = -0.15; head.add(ear);
    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.058, 0.19, 10), M.fur); outer.position.y = 0.08; outer.castShadow = true; ear.add(outer);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.14, 8), M.nose); inner.position.set(0, 0.07, 0.02); inner.scale.z = 0.5; ear.add(inner);
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.06, 6), M.furWhite); tuft.position.set(0, 0.03, 0.03); ear.add(tuft);
    ears.push(ear);
  }
  // tuft of head fur
  const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.11, 8), M.fur); tuft.position.set(0.02, 0.15, 0.09); tuft.rotation.x = 0.9; tuft.rotation.z = -0.3; head.add(tuft);
  // comm headset: band, earcups, mic boom, green eyepiece
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.178, 0.014, 8, 32, Math.PI), M.dark); band.rotation.set(0, Math.PI / 2, Math.PI); band.position.set(0, 0.05, 0); band.scale.set(1, 1, 1.06); head.add(band);
  for (const s of [-1, 1]) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.035, 16), M.dark); cup.rotation.z = Math.PI / 2; cup.position.set(s * 0.175, -0.01, 0.0); cup.castShadow = true; head.add(cup);
    const cupGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.012, 12), M.glow); cupGlow.rotation.z = Math.PI / 2; cupGlow.position.set(s * 0.196, -0.01, 0); head.add(cupGlow);
  }
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.19, 6), M.metal); boom.position.set(0.14, -0.06, 0.12); boom.rotation.set(0.3, 0, -1.1); head.add(boom);
  const mic = sphere(0.014, M.dark, 8, 6); mic.position.set(0.06, -0.1, 0.2); head.add(mic);
  const visorArm = box(0.012, 0.012, 0.16, M.metal); visorArm.position.set(0.15, 0.03, 0.08); head.add(visorArm);
  const visor = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.065), M.visorGlass); visor.position.set(0.075, 0.03, 0.2); visor.rotation.y = 0.35; head.add(visor);
  const visorRim = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.006, 6, 16), M.metal); visorRim.position.copy(visor.position).add(new THREE.Vector3(0, 0, -0.004)); visorRim.rotation.y = 0.35; visorRim.scale.set(1.05, 0.7, 1); head.add(visorRim);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.16, 6), M.metal); antenna.position.set(-0.175, 0.09, -0.03); antenna.rotation.z = 0.15; head.add(antenna);
  const antTip = sphere(0.014, M.glow, 8, 6); antTip.position.set(-0.187, 0.175, -0.03); head.add(antTip);

  // arms
  const arms = {};
  for (const s of [-1, 1]) {
    const name = s < 0 ? 'L' : 'R';
    const shoulder = new THREE.Group(); shoulder.position.set(s * 0.27, 0.48, 0); torso.add(shoulder);
    const upper = capsule(0.065, 0.22, M.jacket); upper.position.y = -0.15; shoulder.add(upper);
    const elbow = new THREE.Group(); elbow.position.y = -0.3; shoulder.add(elbow);
    const fore = capsule(0.055, 0.2, M.jacket); fore.position.y = -0.13; elbow.add(fore);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.065, 0.07, 12), M.dark); cuff.position.y = -0.22; cuff.castShadow = true; elbow.add(cuff);
    const hand = rounded(0.09, 0.1, 0.07, 0.025, M.dark); hand.position.y = -0.3; elbow.add(hand);
    arms[name] = { shoulder, elbow, hand };
  }
  // blaster in right hand
  const gun = new THREE.Group(); gun.position.set(0, -0.32, 0.03); arms.R.elbow.add(gun);
  const grip = box(0.04, 0.1, 0.05, M.dark); gun.add(grip);
  const barrel = box(0.05, 0.06, 0.26, M.metal); barrel.position.set(0, 0.06, 0.1); gun.add(barrel);
  const barrelTip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.08, 10), M.dark); barrelTip.rotation.x = Math.PI / 2; barrelTip.position.set(0, 0.06, 0.26); gun.add(barrelTip);
  const gunGlow = box(0.056, 0.02, 0.12, M.glow); gunGlow.position.set(0, 0.075, 0.12); gun.add(gunGlow);
  const muzzleO = new THREE.Object3D(); muzzleO.position.set(0, 0.06, 0.32); gun.add(muzzleO);
  const muzzleFlash = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0xaaf6ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  muzzleO.add(muzzleFlash);

  // legs
  const legs = {};
  for (const s of [-1, 1]) {
    const name = s < 0 ? 'L' : 'R';
    const hip = new THREE.Group(); hip.position.set(s * 0.11, -0.05, 0); hips.add(hip);
    const thigh = capsule(0.105, 0.28, M.pants); thigh.position.y = -0.2; hip.add(thigh);
    const knee = new THREE.Group(); knee.position.y = -0.42; hip.add(knee);
    const kneePad = sphere(0.085, M.dark, 12, 8); kneePad.position.set(0, 0.0, 0.03); kneePad.scale.set(1, 0.9, 0.8); knee.add(kneePad);
    const shin = capsule(0.085, 0.24, M.pants); shin.position.y = -0.18; knee.add(shin);
    const boot = rounded(0.2, 0.15, 0.34, 0.05, M.dark); boot.position.set(0, -0.42, 0.05); knee.add(boot);
    const bootTrim = box(0.17, 0.03, 0.31, M.red); bootTrim.position.set(0, -0.36, 0.05); knee.add(bootTrim);
    const sole = box(0.15, 0.03, 0.29, M.metal); sole.position.set(0, -0.485, 0.05); knee.add(sole);
    legs[name] = { hip, knee };
  }

  body.position.y = 0.02;

  // --- animation state
  const st = {
    phase: 0, speed: 0, lean: 0, leanV: 0, tilt: 0, tiltV: 0,
    squash: 1, squashV: 0, air: 0, aim: 0, fireFlash: 0, blink: 0, blinkT: 2.5, earTwitch: 0,
  };
  function spring(cur, vel, target, k, d, dt) {
    const a = (target - cur) * k - vel * d;
    vel += a * dt; cur += vel * dt;
    return [cur, vel];
  }

  function animate(dt, p) {
    const spd = clamp01(p.speed);
    st.speed = lerp(st.speed, spd, 1 - Math.exp(-dt * 10));
    const stride = 2.8; // Hz at full speed
    st.phase += dt * (1.0 + st.speed * (stride * Math.PI * 2 - 1.0));
    const ph = st.phase;
    const s = st.speed;

    [st.lean, st.leanV] = spring(st.lean, st.leanV, s * 0.28 + (p.accel ?? 0) * 0.25, 60, 8, dt);
    [st.tilt, st.tiltV] = spring(st.tilt, st.tiltV, -(p.turn ?? 0) * 0.25 * s, 50, 8, dt);
    if (p.landed) st.squashV = -6;
    [st.squash, st.squashV] = spring(st.squash, st.squashV, 1, 220, 12, dt);
    st.air = lerp(st.air, p.airborne ? 1 : 0, 1 - Math.exp(-dt * 12));
    st.fireFlash = Math.max(0, st.fireFlash - dt * 12);

    const idleB = Math.sin(ph * 1.0) * 0.5 + 0.5;
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

    // ears: perk when moving, twitch when idle; tail: wag / trail
    st.blinkT -= dt; if (st.blinkT <= 0) { st.blink = 1; st.blinkT = 2.2 + Math.random() * 2.5; }
    st.blink = Math.max(0, st.blink - dt * 9);
    st.earTwitch = (1 - s) * (Math.sin(ph * 3.1) > 0.97 ? 1 : 0);
    ears[0].rotation.z = 0.28 + s * 0.12 + st.earTwitch * 0.25; ears[1].rotation.z = -0.28 - s * 0.12;
    ears[0].rotation.x = ears[1].rotation.x = -0.15 - s * 0.2 - jumpTuck * 0.3;
    const wag = Math.sin(ph * (s > 0.2 ? 1 : 1.6)) * (0.25 + s * 0.15);
    tailRoot.rotation.x = -0.9 - s * 0.6 + jumpTuck * 0.6 - st.lean; tailRoot.rotation.y = wag * 0.5;
    tailSegs[1].rotation.y = wag * 0.6; tailSegs[1].rotation.x = -0.25 + s * 0.2;
    tailSegs[2].rotation.y = Math.sin(ph * 1.6 - 0.8) * 0.4; tailSegs[2].rotation.x = -0.2 + s * 0.15;

    for (const [name, sgn] of [['L', 1], ['R', -1]]) {
      const leg = legs[name];
      const a = ph + (sgn < 0 ? Math.PI : 0);
      const swing = Math.sin(a);
      const lift = Math.max(0, Math.sin(a + Math.PI * 0.5));
      const runHip = swing * 0.85;
      const runKnee = Math.max(0.05, lift * 1.5 * (0.6 + 0.4 * Math.max(0, -swing)));
      const idleHip = 0.02 * sgn, idleKnee = 0.06;
      const jumpHip = sgn > 0 ? -0.9 : -0.3, jumpKnee = sgn > 0 ? 1.7 : 0.9;
      leg.hip.rotation.x = lerp(lerp(idleHip, runHip, s), jumpHip, jumpTuck);
      leg.knee.rotation.x = lerp(lerp(idleKnee, runKnee, s), jumpKnee, jumpTuck);
    }
    const aim = p.aiming ? 1 : 0;
    st.aim = lerp(st.aim, aim, 1 - Math.exp(-dt * 14));
    for (const [name, sgn] of [['L', 1], ['R', -1]]) {
      const arm = arms[name];
      const a = ph + (sgn < 0 ? 0 : Math.PI);
      const swing = Math.sin(a);
      const runSh = swing * 0.9 - 0.3, runEl = -(0.9 + Math.max(0, swing) * 0.7);
      const idleSh = 0.1 + Math.sin(ph * 0.7) * 0.03, idleEl = -0.25;
      const jumpSh = -1.4 + (sgn > 0 ? -0.5 : 0.2), jumpEl = -0.5;
      let shX = lerp(lerp(idleSh, runSh, s), jumpSh, jumpTuck);
      let elX = lerp(lerp(idleEl, runEl, s), jumpEl, jumpTuck);
      let shZ = -sgn * (0.14 + s * 0.08);
      if (name === 'R') { shX = lerp(shX, -1.45, st.aim); elX = lerp(elX, -0.15 + st.fireFlash * 0.35, st.aim); shZ = lerp(shZ, 0.02, st.aim); }
      arm.shoulder.rotation.x = shX; arm.shoulder.rotation.z = shZ; arm.elbow.rotation.x = elX;
    }
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

  return { root, animate, fire, muzzle: muzzleO, materials: M, head };
}
